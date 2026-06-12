import React, { useState, useEffect } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDoc, runTransaction } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Ticket, UserProfile } from "../types";
import { isLotterySalesSuspended, getCampaignDrawProjection } from "../utils/validation";
import RankingView from "./RankingView";
import CelebrationConfetti from "./CelebrationConfetti";
import { Ticket as TicketIcon, Search, Landmark, Copy, Check, Calendar, Trophy, AlertCircle, ShoppingBag, User as UserIcon, LogOut, ArrowRight, HelpCircle, Sparkles, ShieldCheck, Download, Printer } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function getDiscountedPrice(
  quantity: number,
  ticketPrice: number,
  discounts?: { minQuantity: number; discountPrice: number; discountPercentage?: number }[]
) {
  if (!discounts || discounts.length === 0) {
    return { unitPrice: ticketPrice, totalPrice: ticketPrice * quantity, appliedDiscount: false, discountPercentage: 0 };
  }
  const sortedDiscounts = [...discounts].sort((a, b) => b.minQuantity - a.minQuantity);
  const matchingTier = sortedDiscounts.find(tier => quantity >= tier.minQuantity);
  if (matchingTier) {
    const finalPct = matchingTier.discountPercentage !== undefined
      ? matchingTier.discountPercentage
      : matchingTier.discountPrice > 0 && ticketPrice > 0
        ? Math.max(0, Math.round((1 - matchingTier.discountPrice / ticketPrice) * 100))
        : 0;

    const finalUnitPrice = matchingTier.discountPercentage !== undefined
      ? ticketPrice * (1 - matchingTier.discountPercentage / 100)
      : matchingTier.discountPrice;

    return {
      unitPrice: finalUnitPrice,
      totalPrice: finalUnitPrice * quantity,
      appliedDiscount: true,
      discountPercentage: finalPct
    };
  }
  return { unitPrice: ticketPrice, totalPrice: ticketPrice * quantity, appliedDiscount: false, discountPercentage: 0 };
}

export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ClientDashboardProps {
  userProfile: UserProfile;
  onLogout: () => void;
}

export default function ClientDashboard({ userProfile, onLogout }: ClientDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [tickets, setTickets] = useState<{ [id: string]: Ticket }>({});
  const [myTickets, setMyTickets] = useState<{ [campaignId: string]: Ticket[] }>({});
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Ticket grid rendering controls
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketPage, setTicketPage] = useState(0);
  const TICKETS_PER_PAGE = 300;

  // Reservation Flow
  const [activeTab, setActiveTab] = useState<"rifas" | "compras" | "ranking">("rifas");

  // Rankings state and listener
  const [allReservations, setAllReservations] = useState<{ [campaignId: string]: Ticket[] }>({});
  const [loadingAllReservations, setLoadingAllReservations] = useState(true);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [reserving, setReserving] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [successReserved, setSuccessReserved] = useState<string[] | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Responsive mobile states
  const [gridFilter, setGridFilter] = useState<"all" | "available" | "mine" | "selected">("all");
  const [showFullDescriptionMobile, setShowFullDescriptionMobile] = useState(false);

  // LGPD Privacy hooks
  const [showLgpdModal, setShowLgpdModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "info" | "warning" | "error" }[]>([]);

  const addToast = (message: string, type: "success" | "info" | "warning" | "error" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Ticket Generation State
  const [ticketModalConfig, setTicketModalConfig] = useState<{
    campaign: Campaign;
    tickets: Ticket[];
  } | null>(null);

  // Safe Masked Name for supporting competition with LGPD
  const formatMaskedName = (fullName?: string): string => {
    if (!fullName) return "Participante";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const first = parts[0];
    const second = parts[1];
    if (second && second.length > 0) {
      return `${first} ${second[0].toUpperCase()}.`;
    }
    return first;
  };

  const renderTopSupportersWidget = (isSidebar: boolean = false) => {
    const buyerMap: { [uid: string]: { name: string; phone: string; totalCount: number; confirmedCount: number; reservedCount: number } } = {};

    (Object.entries(allReservations) as [string, Ticket[]][]).forEach(([campaignId, tList]) => {
      // If inside sidebar under a selected campaign, only show contributors for this specific active campaign!
      if (selectedCampaign && campaignId !== selectedCampaign.id) return;

      tList.forEach((t) => {
        if (!t.buyerUid) return;
        if (t.status === "available") return;

        if (!buyerMap[t.buyerUid]) {
          buyerMap[t.buyerUid] = {
            name: t.buyerName || "Apoiador Anônimo",
            phone: t.buyerPhone || "",
            totalCount: 0,
            confirmedCount: 0,
            reservedCount: 0
          };
        }
        buyerMap[t.buyerUid].totalCount++;
        if (t.status === "confirmed") {
          buyerMap[t.buyerUid].confirmedCount++;
        } else if (t.status === "reserved") {
          buyerMap[t.buyerUid].reservedCount++;
        }
      });
    });

    const list = Object.entries(buyerMap)
      .map(([uid, data]) => ({
        uid,
        ...data
      }))
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) {
          return b.totalCount - a.totalCount;
        }
        return b.confirmedCount - a.confirmedCount;
      })
      .slice(0, 5);

    if (list.length === 0) {
      return (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 text-center space-y-2">
          <Trophy className="w-8 h-8 text-indigo-550 mx-auto animate-pulse" />
          <h4 className="text-slate-750 font-bold text-xs">Apoiadores Iniciando</h4>
          <p className="text-slate-400 text-[10px] leading-relaxed">
            Seja o primeiro a reservar cotas e lidere o ranking de apoiadores! 🚀
          </p>
        </div>
      );
    }

    return (
      <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4 ${isSidebar ? "" : "w-full animate-fadeIn"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4.5 h-4.5 text-amber-500 shrink-0" />
            <span>🏆 Maiores Apoiadores {selectedCampaign ? "" : "Globais"}</span>
          </h2>
          <span className="bg-amber-100 text-amber-800 font-extrabold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full">
            Top 5
          </span>
        </div>
        <p className="text-slate-500 text-xs leading-normal font-normal">
          {selectedCampaign 
            ? `Quem está liderando a corrida pelo prêmio "${selectedCampaign.title}"?`
            : "Os apoiadores mais engajados que estão impulsionando a formatura da nossa turma!"
          }
        </p>

        <div className="space-y-2.5 pt-1">
          {list.map((buyer, index) => {
            const position = index + 1;
            const isMe = buyer.uid === userProfile.uid;
            const confirmedPct = buyer.totalCount > 0 ? (buyer.confirmedCount / buyer.totalCount) * 100 : 0;

            return (
              <div 
                key={buyer.uid} 
                className={`p-3 rounded-xl flex items-center justify-between gap-3 transition-all ${
                  isMe 
                    ? "bg-amber-500/5 border border-amber-300 ring-2 ring-amber-300/10 shadow-xs" 
                    : "bg-slate-50 border border-slate-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Position Badge with styling */}
                  <div className={`w-6 h-6 rounded-lg font-mono text-[10px] font-black flex items-center justify-center shrink-0 ${
                    position === 1 ? "bg-amber-400 text-amber-955" 
                    : position === 2 ? "bg-slate-300 text-slate-800" 
                    : position === 3 ? "bg-amber-100 text-amber-900" 
                    : "bg-slate-200/60 text-slate-500"
                  }`}>
                    {position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : position}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-805 truncate block">
                        {formatMaskedName(buyer.name)}
                      </span>
                      {isMe && (
                        <span className="bg-amber-500 text-white font-extrabold text-[8px] uppercase px-1.5 py-0.2 rounded shadow-xs shrink-0 select-none">
                          Você
                        </span>
                      )}
                    </div>
                    {/* Micro count */}
                    <span className="text-[9.5px] text-slate-400 block mt-0.5">
                      {buyer.confirmedCount} Pago • {buyer.reservedCount} Reservado
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end justify-center">
                  <span className="text-xs font-black text-slate-805 font-mono">
                    {buyer.totalCount} <span className="font-sans font-medium text-[9.5px] text-slate-450">cotas</span>
                  </span>
                  
                  {/* Slim progress bar indicating paid/unpaid segment */}
                  <div className="h-1 w-14 bg-slate-200 rounded-full overflow-hidden flex mt-1">
                    <div 
                      style={{ width: `${confirmedPct}%` }}
                      className="h-full bg-emerald-500"
                    />
                    <div 
                      style={{ width: `${100 - confirmedPct}%` }}
                      className="h-full bg-amber-400"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Secure privacy text */}
        <div className="text-[9px] text-slate-400/90 leading-tight bg-slate-50/50 p-2 rounded-lg border border-slate-100 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Políticas de Privacidade: Nomes mascarados em conformidade com a LGPD.</span>
        </div>
      </div>
    );
  };

  // LGPD - Export Stored Personal Data (Data Portability)
  const handleExportMyData = () => {
    try {
      const dataToExport = {
        lgpd_compliance: "Lei Geral de Proteção de Dados (Lei nº 13.709/2018) - Brasil",
        export_date: new Date().toISOString(),
        user_profile: {
          uid: userProfile.uid,
          name: userProfile.name,
          email: userProfile.email,
          cpf: userProfile.cpf,
          city: userProfile.city,
          phone: userProfile.phone,
          role: userProfile.role,
          createdAt: userProfile.createdAt,
        },
        reserved_tickets: Object.keys(myTickets).reduce((acc, campaignId) => {
          const ticketsList = myTickets[campaignId] || [];
          if (ticketsList.length > 0) {
            acc[campaignId] = ticketsList.map(t => ({
              ticketId: t.id,
              number: t.number,
              status: t.status,
              reservedAt: t.reservedAt,
            }));
          }
          return acc;
        }, {} as any)
      };

      const jsonStr = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meus_dados_lgpd_${userProfile.cpf}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast("Seus dados pessoais foram exportados com sucesso!", "success");
    } catch (err) {
      console.error("Error exporting LGPD data:", err);
      addToast("Não foi possível gerar a exportação dos dados no momento.", "error");
    }
  };

  // LGPD - Right to be forgotten (Direito ao Esquecimento) - Account elimination
  const handleDeleteMyDataAndAccount = async () => {
    const confirmation1 = window.confirm(
      "DIREITO AO ESQUECIMENTO (LGPD):\n\n" +
      "Deseja realmente solicitar a eliminação definitiva dos seus dados pessoais?\n" +
      "Esta ação apagará totalmente o seu cadastro em nosso banco de dados."
    );
    if (!confirmation1) return;

    const confirmation2 = window.confirm(
      "CONFIRMAÇÃO FINAL DE SEGURANÇA:\n\n" +
      "Atenção: Isso cancelará e liberará todos os bilhetes que estejam reservados em seu nome.\n" +
      "Deseja prosseguir com a exclusão?"
    );
    if (!confirmation2) return;

    setIsDeletingAccount(true);

    try {
      // 1. Release / delete all tickets reserved across all campaigns
      const deletePromises: Promise<void>[] = [];
      Object.keys(myTickets).forEach((campaignId) => {
        const list = myTickets[campaignId] || [];
        list.forEach((t) => {
          const ticketRef = doc(db, "campaigns", campaignId, "tickets", t.id);
          deletePromises.push(deleteDoc(ticketRef));
        });
      });

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }

      // 2. Delete user profile document under 'users/{uid}'
      const userProfileRef = doc(db, "users", userProfile.uid);
      await deleteDoc(userProfileRef);

      // 3. Inform and sign out
      alert("Seu cadastro de dados pessoais foi permanentemente excluído (Art. 16, LGPD).");
      onLogout();
    } catch (err) {
      console.error("Error performing right to be forgotten:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `users/${userProfile.uid}`);
      } catch (mappedErr) {
        addToast("Ocorreu um erro ao excluir seus dados. Limite de segurança excedido.", "error");
      }
    } finally {
      setIsDeletingAccount(false);
      setShowLgpdModal(false);
    }
  };

  // Load all campaigns
  useEffect(() => {
    const q = query(collection(db, "campaigns"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const campaignList: Campaign[] = [];
        snapshot.forEach((docSnap) => {
          campaignList.push({ id: docSnap.id, ...docSnap.data() } as Campaign);
        });
        setCampaigns(campaignList);
        setLoadingCampaigns(false);

        // Auto-select first active campaign if none selected
        if (campaignList.length > 0 && !selectedCampaign) {
          const active = campaignList.find(c => c.status === "active") || campaignList[0];
          setSelectedCampaign(active);
        }
      },
      (error) => {
        console.error("Error watching campaigns:", error);
        setLoadingCampaigns(false);
      }
    );

    return () => unsubscribe();
  }, [selectedCampaign]);

  // Load tickets for selected campaign
  useEffect(() => {
    if (!selectedCampaign) {
      setTickets({});
      return;
    }

    setLoadingTickets(true);
    const ticketsCollectionRef = collection(db, "campaigns", selectedCampaign.id, "tickets");

    const unsubscribe = onSnapshot(
      ticketsCollectionRef,
      (snapshot) => {
        const ticketMap: { [id: string]: Ticket } = {};
        snapshot.forEach((docSnap) => {
          ticketMap[docSnap.id] = docSnap.data() as Ticket;
        });
        setTickets(ticketMap);
        setLoadingTickets(false);
      },
      (error) => {
        console.error("Error watching campaign tickets:", error);
        setLoadingTickets(false);
      }
    );

    return () => unsubscribe();
  }, [selectedCampaign]);

  // Listen to active user's tickets across all registered campaigns to assemble "Minhas Compras" tab
  useEffect(() => {
    if (!userProfile.uid || campaigns.length === 0) return;

    const unsubscribes = campaigns.map((campaign) => {
      const ticketsRef = collection(db, "campaigns", campaign.id, "tickets");
      const userTicketsQuery = query(ticketsRef, where("buyerUid", "==", userProfile.uid));

      return onSnapshot(userTicketsQuery, (snapshot) => {
        const userTicketList: Ticket[] = [];
        snapshot.forEach((docSnap) => {
          userTicketList.push(docSnap.data() as Ticket);
        });
        setMyTickets((prev) => ({
          ...prev,
          [campaign.id]: userTicketList,
        }));
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [userProfile.uid, campaigns]);

  // Listen to tickets across all campaigns for real-time buyer rankings
  useEffect(() => {
    if (campaigns.length === 0) {
      setLoadingAllReservations(false);
      return;
    }

    setLoadingAllReservations(true);
    let loadedCount = 0;
    const totalCampaigns = campaigns.length;

    const unsubscribes = campaigns.map((camp) => {
      const ref = collection(db, "campaigns", camp.id, "tickets");
      return onSnapshot(
        ref,
        (snapshot) => {
          const ticketList: Ticket[] = [];
          snapshot.forEach((d) => {
            ticketList.push(d.data() as Ticket);
          });

          setAllReservations((prev) => ({
            ...prev,
            [camp.id]: ticketList,
          }));

          loadedCount++;
          if (loadedCount >= totalCampaigns) {
            setLoadingAllReservations(false);
          }
        },
        (error) => {
          console.error(`Error loading ranking tickets for ${camp.id}:`, error);
          loadedCount++;
          if (loadedCount >= totalCampaigns) {
            setLoadingAllReservations(false);
          }
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [campaigns]);

  // Dynamic settings state
  const [settings, setSettings] = useState({
    pixKey: "contato@rifadochiquinho.com.br",
    bankName: "Banco Central",
    receiverName: "Apoio Rifa do Chiquinho",
    expirationHours: 24,
    supportContact: "51999999999",
    supportEmail: "contato@rifadochiquinho.com.br",
    rulesText: "Os bilhetes reservados têm prazo de validade. Caso a transferência via PIX não seja comprovada, a cota retornará à disponibilidade geral automaticamente.",
    backgroundAudioUrl: "",
    autoWhatsAppRedirect: true,
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        setSettings(d.data() as any);
      }
    });
    return () => unsub();
  }, []);

  const handleCopyPix = () => {
    navigator.clipboard.writeText(settings.pixKey);
    setCopiedPix(true);
    addToast("Chave PIX copiada com sucesso para área de transferência!", "success");
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const handleWhatsAppRedirect = (targetTickets?: Ticket[], camp?: Campaign) => {
    const cleanPhone = settings.supportContact ? settings.supportContact.replace(/\D/g, "") : "";
    if (!cleanPhone) {
      addToast("O contato da comissão de formatura não foi cadastrado pelo administrador.", "warning");
      return;
    }

    let billsText = "";
    let totalValue = 0;

    if (targetTickets && camp) {
      const numbers = targetTickets.map(t => `#${t.number}`).join(", ");
      const calc = getDiscountedPrice(targetTickets.length, camp.ticketPrice, camp.progressiveDiscounts);
      totalValue = calc.totalPrice;
      billsText = `📋 *Rifa:* ${camp.title}\n🎫 *Números Reservados:* ${numbers}\n💰 *Valor Total:* R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    } else {
      const reservedListByCampaign: { campaign: Campaign; tickets: Ticket[] }[] = [];
      (Object.entries(myTickets) as [string, Ticket[]][]).forEach(([campaignId, tList]) => {
        const campaignReserved = tList.filter(t => t.status === "reserved");
        if (campaignReserved.length > 0) {
          const matchingCamp = campaigns.find(c => c.id === campaignId);
          if (matchingCamp) {
            reservedListByCampaign.push({ campaign: matchingCamp, tickets: campaignReserved });
          }
        }
      });

      if (reservedListByCampaign.length === 0) {
        addToast("Você não possui nenhuma reserva pendente no momento.", "info");
        return;
      }

      billsText = reservedListByCampaign
        .map(({ campaign, tickets }) => {
          const numbers = tickets.map(t => `#${t.number}`).join(", ");
          const calc = getDiscountedPrice(tickets.length, campaign.ticketPrice, campaign.progressiveDiscounts);
          totalValue += calc.totalPrice;
          return `📋 *Rifa:* ${campaign.title}\n🎫 *Números:* ${numbers}\n💰 *Valor:* R$ ${calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        })
        .join("\n\n");
    }

    const message = `Olá Comissão de Formatura! 🎓✨

Gostaria de solicitar a validação manual do comprovante para a minha reserva.

👤 *Apoiador:* ${userProfile.name}
🆔 *CPF:* ${userProfile.cpf}
📞 *Telefone:* ${userProfile.phone || "Não informado"}

---
*DETALHES DA RESERVA:*
${billsText}

*VALOR TOTAL A CONFIRMAR:* R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
---

Estou enviando o comprovante do PIX anexo a esta mensagem. Por favor, confirmem para mim assim que possível! Muito obrigado! 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone}?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  };

  const handleReserveTickets = async () => {
    if (!selectedCampaign || selectedNumbers.length === 0) return;
    
    if (userProfile.isBlocked) {
      addToast("Sua conta está suspensa ou bloqueada. Por favor, entre em contato com o suporte.", "error");
      return;
    }

    const suspension = isLotterySalesSuspended();
    if (suspension.suspended) {
      addToast(suspension.reason || "Vendas suspensas temporariamente para o sorteio da Loteria Federal.", "error");
      return;
    }

    const reservedCount = selectedNumbers.length;
    setReserving(true);

    try {
      // Execute as a secure atomic transaction to prevent double reservation of any slot
      await runTransaction(db, async (transaction) => {
        const ticketReads = await Promise.all(
          selectedNumbers.map(async (numberStr) => {
            const ticketRef = doc(db, "campaigns", selectedCampaign.id, "tickets", numberStr);
            const ticketDoc = await transaction.get(ticketRef);
            return {
              numberStr,
              ticketRef,
              exists: ticketDoc.exists(),
              data: ticketDoc.data() as Ticket | undefined,
            };
          })
        );

        // Filter out any tickets that are already reserved/confirmed by another user
        const occupied = ticketReads.filter(
          (t) => t.exists && t.data && t.data.status !== "available" && t.data.buyerUid !== userProfile.uid
        );

        if (occupied.length > 0) {
          const occupiedNumStr = occupied.map((o) => o.numberStr).join(", ");
          throw new Error(`Algumas das cotas escolhidas acabam de ser reservadas ou confirmadas por outro usuário: ${occupiedNumStr}`);
        }

        // Apply reservations inside the transaction
        ticketReads.forEach((t) => {
          const ticketData: Ticket = {
            id: t.numberStr,
            number: t.numberStr,
            status: "reserved",
            buyerUid: userProfile.uid,
            buyerName: userProfile.name,
            buyerPhone: userProfile.phone,
            buyerCpf: userProfile.cpf,
            buyerEmail: userProfile.email,
            reservedAt: new Date().toISOString(),
          };
          transaction.set(t.ticketRef, ticketData);
        });
      });

      const reservedCopy = [...selectedNumbers];
      setSuccessReserved(reservedCopy);
      setSelectedNumbers([]);
      addToast(`Reserva realizada com sucesso! (${reservedCount} cota${reservedCount > 1 ? "s" : ""} reservada${reservedCount > 1 ? "s" : ""})`, "success");
      
      // Delay the warning slightly so the user perceives both milestones clearly
      setTimeout(() => {
        addToast("Atenção: Seu pagamento está com status pendente de homologação via PIX.", "warning");
      }, 700);
    } catch (err: any) {
      console.error("Failed to reserve tickets:", err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes("acabam de ser reservadas ou confirmadas")) {
        addToast(errMsg, "error");
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `campaigns/${selectedCampaign.id}/tickets`);
        } catch (mappedErr: any) {
          addToast("Limite de vagas excedido ou algumas das cotas já foram reservadas por outro participante.", "error");
        }
      }
    } finally {
      setReserving(false);
    }
  };

  const handleToggleNumberSelection = (numberStr: string) => {
    const suspension = isLotterySalesSuspended();
    if (suspension.suspended) {
      addToast(suspension.reason || "Vendas suspensas temporariamente para o sorteio da Loteria Federal.", "error");
      return;
    }

    setSelectedNumbers((prev) =>
      prev.includes(numberStr)
        ? prev.filter((n) => n !== numberStr)
        : [...prev, numberStr].sort((a, b) => Number(a) - Number(b))
    );
  };

  const handleCancelReservation = async (campaignId: string, ticketId: string) => {
    if (!window.confirm(`Deseja realmente cancelar esta reserva de bilhete #${ticketId}?`)) return;

    try {
      const ticketRef = doc(db, "campaigns", campaignId, "tickets", ticketId);
      await deleteDoc(ticketRef);
      addToast(`Reserva do bilhete #${ticketId} cancelada com sucesso.`, "info");
    } catch (err) {
      console.error("Error canceling ticket:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `campaigns/${campaignId}/tickets/${ticketId}`);
      } catch (mappedErr) {
        addToast("Sem autorização para cancelar a reserva.", "error");
      }
    }
  };

  const padNumber = (num: number, limit: number): string => {
    const padLength = limit > 1000 ? 4 : limit > 100 ? 3 : 2;
    return num.toString().padStart(padLength, "0");
  };

  const handleQuickSelectRandom = (count: number) => {
    const suspension = isLotterySalesSuspended();
    if (suspension.suspended) {
      addToast(suspension.reason || "Vendas suspensas temporariamente para o sorteio da Loteria Federal.", "error");
      return;
    }

    if (!selectedCampaign) return;
    const total = selectedCampaign.totalTickets;
    
    // Find all available numbers in the current campaign
    const availableNumbers: string[] = [];
    for (let idx = 0; idx < total; idx++) {
      const numStr = padNumber(idx, total);
      if (!tickets[numStr]) {
        availableNumbers.push(numStr);
      }
    }
    
    if (availableNumbers.length === 0) {
      addToast("Nenhuma cota se encontra livre neste momento.", "error");
      return;
    }
    
    // Shuffle the available numbers
    const shuffled = [...availableNumbers].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    
    setSelectedNumbers(selected);
    
    if (selected.length < count) {
      addToast(`Apenas ${selected.length} cotas estavam disponíveis e foram selecionadas.`, "info");
    } else {
      addToast(`${count} cotas aleatórias foram selecionadas com sucesso!`, "success");
    }
  };

  useEffect(() => {
    setTicketPage(0);
  }, [ticketSearch, gridFilter]);

  const filteredIndices = React.useMemo(() => {
    if (!selectedCampaign) return [];
    const total = selectedCampaign.totalTickets;
    let indices = Array.from({ length: total }, (_, i) => i);

    // Filter by tickets status gridFilter criteria
    if (gridFilter === "available") {
      indices = indices.filter((idx) => {
        const numStr = padNumber(idx, total);
        return !tickets[numStr];
      });
    } else if (gridFilter === "mine") {
      indices = indices.filter((idx) => {
        const numStr = padNumber(idx, total);
        return tickets[numStr]?.buyerUid === userProfile.uid;
      });
    } else if (gridFilter === "selected") {
      indices = indices.filter((idx) => {
        const numStr = padNumber(idx, total);
        return selectedNumbers.includes(numStr);
      });
    }

    if (!ticketSearch.trim()) return indices;
    const cleanSearch = ticketSearch.trim();
    const padLength = total > 1050 ? 4 : total > 100 ? 3 : 2;
    return indices.filter((idx) => {
      const numStr = idx.toString().padStart(padLength, "0");
      return numStr.includes(cleanSearch);
    });
  }, [selectedCampaign, ticketSearch, gridFilter, tickets, selectedNumbers]);

  const paginatedIndices = React.useMemo(() => {
    const start = ticketPage * TICKETS_PER_PAGE;
    return filteredIndices.slice(start, start + TICKETS_PER_PAGE);
  }, [filteredIndices, ticketPage, TICKETS_PER_PAGE]);

  const totalPages = Math.ceil(filteredIndices.length / TICKETS_PER_PAGE);

  // Helper calculating total reserved and confirmed count
  const myTotalTicketsCount = Object.values(myTickets).flat().length;

  return (
    <div className="space-y-6 md:space-y-8 pb-16 pt-safe">
      {/* Client Header bar - DESKTOP ONLY */}
      <header className="hidden lg:flex bg-slate-900 rounded-3xl p-8 text-white shadow-lg border border-slate-800 justify-between items-center gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <GraduationCapIcon className="w-6 h-6 text-indigo-400 shrink-0" />
            <h1 className="text-xl font-extrabold tracking-tight">Rifa Formatura</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
            <span>Cliente: <strong className="text-slate-100">{userProfile.name}</strong></span>
            <span className="text-slate-700">|</span>
            <span>CPF: <strong className="text-slate-100">{userProfile.cpf}</strong></span>
            <span className="text-slate-700">|</span>
            <span>Cidade: <strong className="text-slate-100">{userProfile.city}</strong></span>
            <span className="text-slate-700">|</span>
            <span>Contato: <a href={`mailto:${settings.supportEmail || "contato@rifadochiquinho.com.br"}`} className="text-indigo-400 hover:underline hover:text-indigo-300 font-medium transition-colors">{settings.supportEmail || "contato@rifadochiquinho.com.br"}</a></span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {myTotalTicketsCount > 0 && (
            <div className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-semibold shrink-0">
              <ShoppingBag className="w-4 h-4" />
              <span>{myTotalTicketsCount} Bilhete(s)</span>
            </div>
          )}
          <button
            onClick={() => setShowRulesModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-500/10 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-200" />
            <span>Regulamento</span>
          </button>
          <button
            onClick={() => setShowLgpdModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-500/10 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-250" />
            <span>Meus Dados (LGPD)</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl text-xs font-medium border border-slate-700/50 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Client Header bar - MOBILE ONLY */}
      <header className="flex lg:hidden flex-col gap-4 bg-gradient-to-br from-slate-900 to-indigo-950 p-4 rounded-3xl border border-slate-800/80 text-white shadow-md">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-550 to-indigo-650 border border-indigo-400/30 text-white flex items-center justify-center font-extrabold text-sm shadow-md shrink-0">
              {userProfile.name ? userProfile.name.slice(0, 2).toUpperCase() : "U"}
            </div>
            <div className="space-y-0.5">
              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black leading-none block">Bem-vindo(a) Apoio</span>
              <h2 className="text-sm font-black text-white leading-tight truncate max-w-[140px]">{userProfile.name}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRulesModal(true)}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer transition-colors border border-slate-700/40"
              title="Regulamento"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowLgpdModal(true)}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-emerald-400 hover:text-emerald-300 cursor-pointer transition-colors border border-slate-700/40"
              title="Meus Dados (LGPD)"
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-rose-400 hover:text-rose-300 cursor-pointer transition-colors border border-slate-700/40"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact statistics metadata row */}
        <div className="bg-slate-950/40 rounded-2xl p-2.5 px-3 flex justify-between items-center text-[10px] text-slate-300 font-medium font-sans border border-white/5">
          <span>CPF: <strong className="text-white">{userProfile.cpf}</strong></span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Local: <strong className="text-white">{userProfile.city}</strong></span>
          {myTotalTicketsCount > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="text-indigo-400 font-bold">🎟️ {myTotalTicketsCount} Cota(s)</span>
            </>
          )}
        </div>
      </header>

      {/* Navigation tabs selector - DESKTOP ONLY */}
      <div className="hidden lg:flex bg-slate-100 border border-slate-200/40 rounded-2xl p-1 gap-1.5 shadow-sm text-xs w-full max-w-2xl mx-auto">
        <button
          onClick={() => {
            setActiveTab("rifas");
            setSuccessReserved(null);
          }}
          className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === "rifas" 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-850"
          }`}
        >
          <TicketIcon className="w-4 h-4 text-indigo-600" />
          <span>Rifas & Cotas</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("compras");
            setSuccessReserved(null);
          }}
          className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 relative ${
            activeTab === "compras" 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-850"
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-indigo-600" />
          <span>Minhas Reservas</span>
          {myTotalTicketsCount > 0 && (
            <span className="absolute top-1/2 -translate-y-1/2 right-3.5 bg-indigo-600 text-white font-extrabold text-[10px] h-[18px] min-w-[18px] px-1 rounded-full flex items-center justify-center border-2 border-slate-100">
              {myTotalTicketsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab("ranking");
            setSuccessReserved(null);
          }}
          className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === "ranking" 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-850"
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-500 animate-pulse" />
          <span>Ranking</span>
        </button>
      </div>

      {/* 2. MAIN CLIENT RIFAS CONTENT GRID */}
      {activeTab === "rifas" && (
        <div className="space-y-6 md:space-y-8 animate-fadeIn">
          {/* Lottery Draw Sales Suspension Banner */}
          {(() => {
            const suspension = isLotterySalesSuspended();
            if (!suspension.suspended) return null;
            return (
              <div id="lottery-suspended-banner" className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4.5 flex gap-3 text-amber-900 animate-pulse shadow-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold tracking-tight text-sm text-amber-950">Vendas Temporariamente Suspensas! ⏳</h4>
                  <p className="text-amber-700 leading-relaxed font-medium">
                    {suspension.reason} As cotas podem ser consultadas, porém novas pré-reservas estão bloqueadas temporariamente neste intervalo. As vendas retornarão normalmente a partir das 21:00h.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Seção das Miniaturas / Thumbnail grid of all campaigns */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg md:text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-550 shrink-0" />
                  <span>Prêmios & Rifas Ativas</span>
                </h2>
                <p className="text-slate-500 text-xs">
                  Selecione uma das rifas de formatura abaixo para verificar o regulamento e escolher seus números premiados!
                </p>
              </div>
              <span className="text-xs bg-indigo-50/70 text-indigo-700 font-bold px-3 py-1 rounded-full border border-indigo-100 flex items-center gap-1.5 shrink-0">
                <span>🎓</span> {campaigns.length} Campanhas
              </span>
            </div>

            {loadingCampaigns ? (
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-2xl border border-slate-150 animate-pulse"></div>
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <TicketIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <h4 className="text-slate-700 font-bold text-sm">Nenhuma rifa cadastrada</h4>
                <p className="text-slate-400 text-xs mt-1">Nenhum prêmio ou rifa ativa no momento.</p>
              </div>
            ) : (() => {
              const activeCampaigns = campaigns.filter(c => c.status !== "drawn");
              const closedCampaigns = campaigns.filter(c => c.status === "drawn");

              return (
                <div className="space-y-10">
                  {/* --- CAMPANHAS ATIVAS --- */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-slate-500">
                        Disponíveis para Compra ({activeCampaigns.length})
                      </h3>
                    </div>
                    {activeCampaigns.length === 0 ? (
                      <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200/80">
                        <TicketIcon className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
                        <h4 className="text-slate-650 font-bold text-xs">Nenhuma rifa ativa no momento</h4>
                        <p className="text-slate-400 text-[10px] mt-0.5">Em breve teremos novas oportunidades! Fique de olho.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 animate-fadeIn">
                        {activeCampaigns.map((camp) => {
                          const isSelected = selectedCampaign?.id === camp.id;
                          const userTicketsCount = myTickets[camp.id]?.length || 0;
                          
                          // Calculate real-time tickets metrics
                          const campTickets = allReservations[camp.id] || [];
                          const vendidas = campTickets.filter(t => t.status === "confirmed").length;
                          const restantes = Math.max(0, camp.totalTickets - campTickets.length);

                          return (
                            <button
                              key={camp.id}
                              onClick={() => {
                                setSelectedCampaign(camp);
                                setSuccessReserved(null);
                                setSelectedNumbers([]);
                                setTicketSearch("");
                                setTicketPage(0);
                                setGridFilter("all");
                                setShowFullDescriptionMobile(false);
                                
                                const boardEl = document.getElementById("quadro-bilhetes");
                                if (boardEl) {
                                  boardEl.scrollIntoView({ behavior: "smooth", block: "start" });
                                }
                              }}
                              className={`group relative flex flex-col text-left bg-white rounded-3xl border overflow-hidden p-4 md:p-5 transition-all duration-300 cursor-pointer w-full ${
                                isSelected
                                  ? "border-emerald-500 ring-4 ring-emerald-500/15 shadow-lg transform scale-[1.01]"
                                  : "border-slate-200 hover:border-slate-350 hover:shadow-lg hover:-translate-y-0.5"
                              }`}
                            >
                              {/* Thumbnail Image Container ("Foto da Campanha") */}
                              <div className="relative aspect-square w-full overflow-hidden bg-slate-50 rounded-2xl border border-slate-100 shrink-0 mb-4">
                                {camp.imageUrl ? (
                                   <img
                                     src={camp.imageUrl}
                                     alt={camp.title}
                                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                     referrerPolicy="no-referrer"
                                   />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 flex flex-col items-center justify-center p-2 text-center">
                                    <span className="text-2xl md:text-3xl.5 filter drop-shadow">🎓</span>
                                    <span className="text-[8px] md:text-[9px] text-indigo-300 font-bold tracking-widest uppercase mt-1 font-mono">Formandos</span>
                                  </div>
                                )}

                                {/* Diagonal Sold Out Banner */}
                                {restantes === 0 && (
                                  <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                                    <div className="bg-gradient-to-r from-red-700 via-rose-500 to-red-700 text-white font-extrabold text-[11px] md:text-xs py-2 w-[160%] text-center uppercase tracking-widest rotate-[-25deg] shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-y-2 border-yellow-400 animate-pulse select-none">
                                      COTAS ESGOTADAS
                                    </div>
                                  </div>
                                )}

                                {/* Floating Price Tag ("Valor Cota") */}
                                <div className="absolute top-2.5 left-2.5 bg-[#82C943] text-white font-black text-xs md:text-sm px-3.5 py-1.5 rounded-xl shadow-lg border border-white/10 flex items-center justify-center">
                                  R$ {camp.ticketPrice.toFixed(2)}
                                </div>

                                {/* Floating status badges */}
                                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                                  {userTicketsCount > 0 && (
                                    <span className="bg-indigo-600 text-white text-[8px] md:text-[9px] font-black px-2 py-0.5 rounded-full shadow-md">
                                      {userTicketsCount} Reservado(s)
                                    </span>
                                  )}
                                  <span className="bg-slate-950/75 backdrop-blur-sm text-white px-2 py-0.5 md:px-2.5 md:py-1 text-[8px] md:text-[9.5px] font-bold rounded-full flex items-center gap-1 border border-white/10">
                                    <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Ativa
                                  </span>
                                </div>
                              </div>

                              {/* Title and Description */}
                              <div className="space-y-1 mb-3.5 flex-1 flex flex-col justify-start">
                                <h3 className="font-extrabold text-slate-800 text-sm md:text-base leading-snug group-hover:text-emerald-600 transition-colors line-clamp-1">
                                  {camp.title}
                                </h3>
                                <p className="text-slate-450 text-[10px] md:text-xs line-clamp-2 leading-relaxed">
                                  {camp.description ? stripHtml(camp.description) : "Participe desta rifa e garanta sua chance de ganhar prêmios incríveis enquanto apoia nossa comissão de formatura."}
                                </p>
                              </div>

                              {/* The Trio of Info Boxes (Cotas, Vendidas, Restantes) */}
                              <div className="grid grid-cols-3 gap-1.5 md:gap-2.5 mb-3">
                                <div className="bg-[#f0f8db]/80 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-emerald-700 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Cotas</span>
                                  <span className="text-emerald-800 font-black text-xs md:text-sm mt-0.5">{camp.totalTickets}</span>
                                </div>
                                <div className="bg-[#f1f9db]/85 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-amber-700 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Vendidas</span>
                                  <span className="text-amber-800 font-black text-xs md:text-sm mt-0.5">{vendidas}</span>
                                </div>
                                <div className="bg-[#f1f9db]/85 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-red-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Restantes</span>
                                  <span className="text-red-700 font-black text-xs md:text-sm mt-0.5">{restantes}</span>
                                </div>
                              </div>

                              {/* Dynamic Projection Box based on sales velocity */}
                              {(() => {
                                const proj = getCampaignDrawProjection(camp, campTickets);
                                return (
                                  <div className="mb-4 bg-indigo-50/50 border border-indigo-100/60 rounded-2xl p-2.5 flex flex-col justify-center space-y-1 w-full text-left">
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-indigo-950 font-extrabold uppercase tracking-wider flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-650 animate-pulse" />
                                        Sorteio Provável
                                      </span>
                                      <span className={`font-extrabold text-[9px] px-1.5 py-0.2 rounded-md ${
                                        proj.confidenceRating === "high" 
                                          ? "bg-emerald-100 text-emerald-800" 
                                          : proj.confidenceRating === "medium"
                                            ? "bg-indigo-100 text-indigo-800"
                                            : "bg-amber-100 text-amber-700"
                                      }`}>
                                        Confiança: {proj.confidenceRating === "high" ? "Alta" : proj.confidenceRating === "medium" ? "Média" : "Baixa"}
                                      </span>
                                    </div>
                                    <div className="text-[11.5px] font-black text-slate-800 leading-snug tracking-tight">
                                      {proj.formattedProbableDrawDate.split(" às ")[0]}
                                    </div>
                                    <div className="text-[9.5px] text-slate-500 flex items-center justify-between font-semibold">
                                      <span>Est: ~{proj.daysRemainingEst} dias</span>
                                      <span>Velo: {proj.salesVelocity}/dia</span>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Comprar Bilhetes Button */}
                              <div className={`w-full text-center text-xs md:text-sm font-black py-2.5 md:py-3.5 px-4 rounded-2xl transition-all duration-200 border ${
                                isSelected
                                  ? "bg-green-600 text-white border-green-600 shadow-md"
                                  : "bg-[#82C943] text-white border-[#82C943] hover:bg-[#72b834] hover:border-[#72b834] shadow-md shadow-green-500/10"
                              }`}>
                                {isSelected ? "Comprar Bilhetes ✓" : "Comprar Bilhetes"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* --- CAMPANHAS ENCERRADAS --- */}
                  {closedCampaigns.length > 0 && (
                    <div className="space-y-4 pt-6 border-t border-slate-100">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                        <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-slate-500">
                          Sorteios Realizados & Encerrados ({closedCampaigns.length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 animate-fadeIn">
                        {closedCampaigns.map((camp) => {
                          const isSelected = selectedCampaign?.id === camp.id;
                          const userTicketsCount = myTickets[camp.id]?.length || 0;

                          // Calculate real-time tickets metrics
                          const campTickets = allReservations[camp.id] || [];
                          const vendidas = campTickets.filter(t => t.status === "confirmed").length;
                          const restantes = Math.max(0, camp.totalTickets - campTickets.length);

                          return (
                            <button
                              key={camp.id}
                              onClick={() => {
                                setSelectedCampaign(camp);
                                setSuccessReserved(null);
                                setSelectedNumbers([]);
                                setTicketSearch("");
                                setTicketPage(0);
                                setGridFilter("all");
                                setShowFullDescriptionMobile(false);
                                
                                const boardEl = document.getElementById("quadro-bilhetes");
                                if (boardEl) {
                                  boardEl.scrollIntoView({ behavior: "smooth", block: "start" });
                                }
                              }}
                              className={`group relative flex flex-col text-left bg-white rounded-3xl border overflow-hidden p-4 md:p-5 transition-all duration-300 cursor-pointer w-full opacity-90 hover:opacity-100 ${
                                isSelected
                                  ? "border-amber-500 ring-4 ring-amber-500/15 shadow-lg transform scale-[1.01]"
                                  : "border-slate-200 hover:border-amber-350 hover:shadow-lg hover:-translate-y-0.5"
                              }`}
                            >
                              {/* Thumbnail Image Container ("Foto da Campanha" - Concluido) */}
                              <div className="relative aspect-square w-full overflow-hidden bg-slate-50 rounded-2xl border border-slate-100 shrink-0 mb-4 grayscale group-hover:grayscale-0 transition-all duration-350">
                                {camp.imageUrl ? (
                                   <img
                                     src={camp.imageUrl}
                                     alt={camp.title}
                                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                     referrerPolicy="no-referrer"
                                   />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 flex flex-col items-center justify-center p-2 text-center">
                                    <span className="text-2xl md:text-3.5xl filter drop-shadow">🎓</span>
                                    <span className="text-[8px] md:text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-1 font-mono">Concluído</span>
                                  </div>
                                )}

                                {/* Diagonal Sold Out Banner */}
                                {restantes === 0 && (
                                  <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                                    <div className="bg-gradient-to-r from-red-700 via-rose-500 to-red-700 text-white font-extrabold text-[11px] md:text-xs py-2 w-[160%] text-center uppercase tracking-widest rotate-[-25deg] shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-y-2 border-yellow-400 animate-pulse select-none">
                                      COTAS ESGOTADAS
                                    </div>
                                  </div>
                                )}

                                {/* Floating Winner Number Tag */}
                                <div className="absolute top-2.5 left-2.5 bg-amber-500 text-white font-black text-xs md:text-sm px-3.5 py-1.5 rounded-xl shadow-lg border border-white/10 flex items-center justify-center gap-1.5">
                                  🏆 Nº {camp.winningNumber || "Sorteado"}
                                </div>

                                {/* Floating status badge (right side) */}
                                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                                  {userTicketsCount > 0 && (
                                    <span className="bg-slate-600 text-white text-[8px] md:text-[9.5px] font-black px-2 py-0.5 rounded-full shadow-md">
                                      {userTicketsCount} Adquirido(s)
                                    </span>
                                  )}
                                  <span className="bg-slate-900/85 backdrop-blur-sm text-white px-2 py-0.5 md:px-2.5 md:py-1 text-[8px] md:text-[9.5px] font-bold rounded-full flex items-center gap-1 border border-white/10">
                                    <Trophy className="w-2.5 h-2.5 text-amber-450 animate-bounce" />
                                    Encerrada
                                  </span>
                                </div>
                              </div>

                              {/* Title and Description */}
                              <div className="space-y-1 mb-3.5 flex-1 flex flex-col justify-start">
                                <h3 className="font-extrabold text-slate-800 text-sm md:text-base leading-snug group-hover:text-amber-600 transition-colors line-clamp-1">
                                  {camp.title}
                                </h3>
                                <p className="text-slate-450 text-[10px] md:text-xs line-clamp-2 leading-relaxed">
                                  {camp.description ? stripHtml(camp.description) : "Confira os detalhes e o bilhete contemplado para este sorteio encerrado de formatura."}
                                </p>
                              </div>

                              {/* The Trio of Info Boxes (Cotas, Vendidas, Restantes) */}
                              <div className="grid grid-cols-3 gap-1.5 md:gap-2.5 mb-4">
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Cotas</span>
                                  <span className="text-slate-700 font-black text-xs md:text-sm mt-0.5">{camp.totalTickets}</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Vendidas</span>
                                  <span className="text-slate-700 font-black text-xs md:text-sm mt-0.5">{vendidas}</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                  <span className="text-slate-450 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Sobra</span>
                                  <span className="text-slate-600 font-black text-xs md:text-sm mt-0.5">{restantes}</span>
                                </div>
                              </div>

                              {/* Resultado / Ver Ganhador Button */}
                              <div className={`w-full text-center text-xs md:text-sm font-black py-2.5 md:py-3.5 px-4 rounded-2xl transition-all duration-200 border ${
                                isSelected
                                  ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10"
                                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-200 shadow-sm"
                              }`}>
                                {isSelected ? "Resultado Selecionado ✓" : "Ver Ganhador 🏆"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Main overview rankings if no campaign is selected */}
          {!selectedCampaign && (
            <div className="pt-8 border-t border-slate-200/80 max-w-4xl mx-auto">
              {renderTopSupportersWidget(false)}
            </div>
          )}

          {/* Sub-Seção dos Detalhes da Rifa Selecionada & Bilhetes (col-span-8) e as Compras/Pix do Cliente (col-span-4) */}
          {selectedCampaign && (
            <div id="quadro-bilhetes" className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start pt-8 border-t border-slate-200/80">
              
              {/* Coluna Esquerda: Quadro de Bilhetes & Resultado */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {/* Campaign banner section */}
                  <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {selectedCampaign.imageUrl && (() => {
                      const selectedCampaignTickets = allReservations[selectedCampaign.id] || [];
                      const selectedCampaignRestantes = Math.max(0, selectedCampaign.totalTickets - selectedCampaignTickets.length);
                      const selectedCampaignIsSoldOut = selectedCampaignRestantes === 0;

                      return (
                        <div className="md:col-span-4 shrink-0 flex justify-center relative overflow-hidden rounded-2xl">
                          <img
                            src={selectedCampaign.imageUrl}
                            alt={selectedCampaign.title}
                            className="w-full max-w-[280px] md:max-w-full aspect-square rounded-2xl object-contain bg-white border border-slate-200 shadow-md p-2 hover:scale-[1.01] transition-transform duration-300"
                            referrerPolicy="no-referrer"
                          />
                          {selectedCampaignIsSoldOut && (
                            <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none flex items-center justify-center overflow-hidden m-2 rounded-2xl">
                              <div className="bg-gradient-to-r from-red-700 via-rose-500 to-red-700 text-white font-extrabold text-[11px] md:text-sm py-2 w-[160%] text-center uppercase tracking-widest rotate-[-25deg] shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-y-2 border-yellow-400 animate-pulse select-none">
                                COTAS ESGOTADAS
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className={selectedCampaign.imageUrl ? "md:col-span-8 space-y-2" : "md:col-span-12 space-y-2"}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full">
                          R$ {selectedCampaign.ticketPrice.toFixed(2)} / BILHETE
                        </span>
                        {selectedCampaign.drawDate && (
                          <span className="bg-slate-200 text-slate-700 text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Loteria Federal de: {selectedCampaign.drawDate}
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-800">{selectedCampaign.title}</h2>
                      <div 
                        className="text-slate-650 text-xs leading-relaxed rich-text-content"
                        dangerouslySetInnerHTML={{ __html: selectedCampaign.description || "" }}
                      />
                      
                      {selectedCampaign.progressiveDiscounts && selectedCampaign.progressiveDiscounts.length > 0 && (
                        <div className="mt-2.5 bg-indigo-50/70 border border-indigo-200/60 p-3 rounded-xl space-y-1.5 shadow-2xs">
                          <h4 className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-900 flex items-center gap-1">
                            <span>🔥 Desconto Progressivo Especial</span>
                          </h4>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {selectedCampaign.progressiveDiscounts.map((tier, idx) => {
                              const pct = tier.discountPercentage !== undefined
                                ? tier.discountPercentage
                                : selectedCampaign.ticketPrice > 0
                                  ? Math.max(0, Math.round((1 - tier.discountPrice / selectedCampaign.ticketPrice) * 100))
                                  : 0;
                              
                              const finalPrice = tier.discountPercentage !== undefined
                                ? selectedCampaign.ticketPrice * (1 - tier.discountPercentage / 100)
                                : tier.discountPrice;

                              return (
                                <span key={idx} className="bg-white px-2.5 py-1 rounded-lg border border-indigo-150/60 flex items-center gap-1.5 text-[11px] text-indigo-950 font-semibold shadow-3xs">
                                  <span>{tier.minQuantity}+ cotas:</span>
                                  <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded-md font-bold">{pct}% OFF</span>
                                  <span className="text-indigo-650">R$ {finalPrice.toFixed(2)} cada</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Probable Federal Lottery Draw Dynamic Prediction */}
                      {selectedCampaign.status === "active" && (
                        <div className="mt-3 bg-[#f3f9e4] border border-lime-300 text-emerald-950 p-3.5 rounded-xl space-y-2.5 shadow-2xs">
                          <h4 className="text-[10.5px] uppercase tracking-wider font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>📈 Projeção Inteligente de Sorteio (Meta 100%)</span>
                          </h4>
                          {(() => {
                            const campTicketsList = allReservations[selectedCampaign.id] || [];
                            const proj = getCampaignDrawProjection(selectedCampaign, campTicketsList);
                            return (
                              <div className="space-y-1.5 text-xs text-slate-700 leading-relaxed font-semibold">
                                <p className="flex flex-wrap items-center gap-1.5 py-0.5 text-slate-700 text-xs md:text-[13px] leading-relaxed">
                                  Com base no ritmo de vendas atual desta campanha (<strong className="text-slate-900 font-bold bg-slate-100 border border-slate-250/70 px-1.5 py-0.5 rounded text-[11px] font-mono">{proj.salesVelocity} cotas/dia</strong>), prevemos a conclusão das reservas em aproximadamente <strong className="text-emerald-800 font-black text-sm md:text-base bg-emerald-150 border border-emerald-300 shadow-sm px-2 py-1 rounded-lg inline-flex items-center mx-0.5">{proj.daysRemainingEst} dias</strong>.
                                </p>
                                <div className="p-3 bg-white/95 rounded-lg border border-lime-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 shadow-3xs">
                                  <div>
                                    <span className="text-[9.5px] uppercase font-extrabold text-slate-450 block tracking-wider leading-none mb-1">PROVÁVEL CONCURSO LOTERIA FEDERAL</span>
                                    <span className="text-xs md:text-[13px] font-black text-slate-800 block leading-tight">{proj.formattedProbableDrawDate}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-4xs ${
                                      proj.confidenceRating === "high" 
                                        ? "bg-emerald-100 text-emerald-800" 
                                        : proj.confidenceRating === "medium"
                                          ? "bg-indigo-100 text-indigo-800"
                                          : "bg-amber-100 text-amber-800"
                                    }`}>
                                      Confiança: {proj.confidenceRating === "high" ? "Alta" : proj.confidenceRating === "medium" ? "Média" : "Inicial"}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[9px] text-slate-500 font-medium italic leading-tight">
                                  *Os sorteios pela Loteria Federal ocorrem às quartas-feiras e sábados às 19:00h (Brasília). A estimativa recalcula dinamicamente em tempo real conforme novos bilhetes são preenchidos ou liberados.
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* DRAW RESULT MOOD CARD IF DRAWN */}
                  {selectedCampaign.status === "drawn" && (
                    <div className="p-6 md:p-8 bg-indigo-950 text-white text-center flex flex-col items-center">
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full mb-3">
                        <Trophy className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold tracking-tight">Sorteio Realizado!</h3>
                      <p className="text-slate-300 text-xs mt-1 max-w-md leading-relaxed">
                        Extração concurso nº <strong>{selectedCampaign.federalLotteryDrawId || "Oficial"}</strong> da Loteria Federal
                        {selectedCampaign.drawDate && (
                          <> realizada em <strong>{selectedCampaign.drawDate.split("-").reverse().join("/")}</strong></>
                        )}.
                      </p>

                      <div className="my-6 bg-indigo-900 border border-indigo-800 rounded-2xl px-8 py-5 flex flex-col items-center">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Número Sorteado</span>
                        <span className="text-5xl font-black text-indigo-300 tracking-wider font-mono mt-1">
                          {selectedCampaign.winningNumber}
                        </span>
                        {selectedCampaign.federalLotteryNumber && (
                          <span className="text-[11px] text-indigo-400 font-semibold mt-2 font-mono">
                            Extração Federal: {selectedCampaign.federalLotteryNumber}
                          </span>
                        )}
                      </div>

                      {tickets[selectedCampaign.winningNumber || ""]?.status === "confirmed" ? (
                        <div className="text-xs text-indigo-300 bg-indigo-900/40 p-3.5 border border-indigo-800/30 rounded-xl leading-relaxed max-w-sm">
                          ✨ Parabéns ao vencedor! <br />
                          <strong>{tickets[selectedCampaign.winningNumber || ""].buyerName}</strong> de{" "}
                          <strong>{tickets[selectedCampaign.winningNumber || ""].buyerCpf || "CPF verificado"}</strong> comprou este bilhete!
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          O bilhete correspondente não foi vendido ou não teve o pagamento confirmado a tempo.
                        </p>
                      )}
                    </div>
                  )}

                  {/* RESERVATION NOTIFICATIONS */}
                  {selectedCampaign.status === "active" && (
                    <div className="p-6 md:p-8 space-y-6">
                      {successReserved && successReserved.length > 0 && (() => {
                        const calc = getDiscountedPrice(successReserved.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts);
                        return (
                          <>
                            <CelebrationConfetti key={confettiKey} />
                            <div className="bg-indigo-55 border border-indigo-200 rounded-xl p-5 text-slate-750 animate-fadeIn space-y-4">
                              <div className="flex items-start gap-4">
                                <div className="flex flex-wrap gap-1 hover:max-h-none overflow-y-auto max-h-[84px] shrink-0 max-w-[160px] bg-indigo-100/50 p-1 rounded-xl border border-indigo-200/50">
                                  {successReserved.map((num) => (
                                    <div key={num} className="p-1 px-1.5 bg-indigo-600 text-white rounded-lg font-bold text-xs font-mono">
                                      #{num}
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-1 flex-1">
                                  <h4 className="font-bold text-slate-800 text-sm leading-none flex items-center gap-1.5 pt-1">
                                    {successReserved.length === 1 ? "Cota Reservada" : "Cotas Reservadas"} com Sucesso! 🎟️
                                  </h4>
                                  <p className="text-xs text-slate-650 leading-normal pt-1">
                                    Sua reserva temporária de <strong className="text-slate-900">{successReserved.length} cota(s)</strong> está ativa. Faça o PIX do valor total destacado abaixo para oficializar.
                                  </p>
                                </div>
                              </div>

                              {/* DESTAQUE PRINCIPAL DO VALOR TOTAL */}
                              <div className="bg-gradient-to-br from-indigo-600 to-indigo-750 text-white rounded-2xl p-5 shadow-md border border-indigo-500/20 text-center space-y-1 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full translate-x-8 -translate-y-8 select-none pointer-events-none" />
                                <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/10 rounded-full -translate-x-6 translate-y-6 select-none pointer-events-none" />
                                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-indigo-200/90">Valor Total a Pagar</span>
                                <div className="text-3xl md:text-4xl font-extrabold tracking-tight font-sans text-white">
                                  R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <span className="inline-block text-[11px] md:text-xs text-indigo-100/95 font-medium bg-indigo-800/40 border border-indigo-500/30 px-3 py-1 rounded-full">
                                  {successReserved.length} cota(s) • R$ {calc.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cada {calc.appliedDiscount ? "(Desconto Progressivo Aplicado!)" : ""}
                                </span>
                              </div>

                              {/* Manual Payment Step */}
                              <div className="bg-indigo-50/50 border border-indigo-150 rounded-2xl p-6 space-y-6">
                                <div className="font-extrabold text-slate-900 border-b border-indigo-150/60 pb-4 flex items-center justify-between">
                                  <span className="text-sm uppercase tracking-wider flex items-center gap-2 text-indigo-900">
                                    <Landmark className="w-5 h-5 text-indigo-600 animate-bounce" /> DADOS DE PAGAMENTO VIA PIX
                                  </span>
                                  <div className="text-right">
                                    <span className="text-xs font-bold text-slate-500 block">Total a Transferir:</span>
                                    <span className="text-lg font-black text-emerald-650 font-mono">
                                      R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                  {/* PIX Key copy block (Left space 7 columns) */}
                                  <div className="md:col-span-7 space-y-4">
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl space-y-3 relative overflow-hidden shadow-xs">
                                      {/* Glowing indicator */}
                                      <span className="absolute top-2 right-2 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                      </span>

                                      <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-widest block">
                                        🚀 Opção 1: Copiar Chave (Pix Copia e Cola)
                                      </span>
                                      
                                      {/* Big high visibility Key container holding copy buttons */}
                                      <div className="space-y-3">
                                        <div className="bg-slate-950 border-2 border-amber-400 p-5 rounded-2xl text-center select-all shrink-0 transition-all shadow-xl relative overflow-hidden group">
                                          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 opacity-50 pointer-events-none group-hover:opacity-75 transition-opacity duration-300" />
                                          <div className="relative z-10 flex flex-col items-center justify-center space-y-1 select-all">
                                            <span className="text-[9px] text-amber-400 font-black tracking-widest uppercase mb-1">
                                              👇 COPIE ESTA CHAVE EXATA 👇
                                            </span>
                                            <span className="font-mono font-black text-base md:text-xl text-yellow-300 break-all block leading-tight tracking-widest select-all">
                                              {settings.pixKey}
                                            </span>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={handleCopyPix}
                                          className={`w-full py-4.5 px-6 rounded-2xl font-black cursor-pointer transition-all flex items-center justify-center gap-3 text-base shadow-xl border-2 uppercase tracking-wider relative overflow-hidden group/btn ${
                                            copiedPix 
                                              ? "bg-gradient-to-r from-emerald-500 to-emerald-700 text-white border-emerald-400 shadow-emerald-500/25 scale-[1.03]" 
                                              : "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-600 hover:via-yellow-500 hover:to-amber-700 text-slate-950 border-yellow-300 shadow-amber-500/30 hover:scale-[1.03] animate-pulse"
                                          }`}
                                        >
                                          {copiedPix ? (
                                            <>
                                              <Check className="w-6 h-6 text-white stroke-[3px] animate-bounce" />
                                              <span>CHAVE PIX COPIADA! ✓</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-6 h-6 text-slate-900 stroke-[3px] transition-transform duration-300 group-hover/btn:scale-125 group-hover/btn:rotate-12 animate-pulse" />
                                              <span>CLIQUE PARA COPIAR A CHAVE PIX 📋</span>
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      <p className="text-[10px] text-slate-500 leading-normal font-medium text-center">
                                        Toque no botão acima para copiar. Abra o app do seu banco, escolha <strong>Pix Copia e Cola</strong> (ou chave de transferência) e cole o código.
                                      </p>
                                    </div>

                                    {/* Recipient breakdown details */}
                                    <div className="bg-white border border-slate-150 p-4 rounded-2xl space-y-2.5">
                                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Dados do Favorecido</span>
                                      <div className="space-y-2">
                                        {settings.receiverName && (
                                          <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                            <span className="text-slate-500 font-bold text-[10.5px] uppercase tracking-wider">Favorecido:</span>
                                            <span className="font-extrabold text-slate-800 text-xs md:text-sm text-right truncate max-w-[200px]">{settings.receiverName}</span>
                                          </div>
                                        )}
                                        {settings.bankName && (
                                          <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                            <span className="text-slate-500 font-bold text-[10.5px] uppercase tracking-wider">Banco / Instituição:</span>
                                            <span className="font-extrabold text-slate-800 text-xs md:text-sm text-right">{settings.bankName}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Instructions Box (Right space 5 columns) */}
                                  <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                                    {/* How to Confirm instructions */}
                                    <div className="bg-indigo-950 text-indigo-50 p-5 rounded-2xl space-y-3 border border-indigo-900 shadow-sm grow flex flex-col justify-center">
                                      <span className="text-[11px] text-indigo-300 font-black uppercase tracking-wider block">⚠️ Passos Importantes:</span>
                                      <ul className="text-[11px] space-y-2 leading-relaxed text-indigo-200">
                                        <li className="flex items-start gap-1.5">
                                          <span className="bg-indigo-800 text-white w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                          <span>Realize a transferência no valor exato de <strong>R$ {calc.totalPrice.toFixed(2)}</strong>.</span>
                                        </li>
                                        <li className="flex items-start gap-1.5">
                                          <span className="bg-indigo-800 text-white w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                          <span>Anote ou tire print do comprovante da transação.</span>
                                        </li>
                                        <li className="flex items-start gap-1.5">
                                          <span className="bg-indigo-800 text-white w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                                          <span>Clique em <strong>Confirmar no WhatsApp</strong> para enviar o comprovante.</span>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setConfettiKey((prev) => prev + 1)}
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                  title="Disparar confete comemorativo"
                                >
                                  <span>Celebrar! 🎉</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const tempTickets = successReserved.map(num => ({
                                      id: num,
                                      number: num,
                                      status: "reserved" as const,
                                      buyerUid: userProfile.uid,
                                      buyerName: userProfile.name,
                                      buyerPhone: userProfile.phone || "",
                                      buyerCpf: userProfile.cpf,
                                      buyerEmail: userProfile.email,
                                      reservedAt: new Date().toISOString(),
                                    }));
                                    handleWhatsAppRedirect(tempTickets, selectedCampaign);
                                    setConfettiKey((prev) => prev + 1); // trigger some more confetti on whatsapp redirection!
                                  }}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                                >
                                  <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.978L2 22l5.133-1.343a9.894 9.894 0 0 0 4.873 1.344h.004c5.507 0 9.99-4.478 9.99-9.984a9.97 9.97 0 0 0-2.926-7.064A9.923 9.923 0 0 0 12.012 2zm5.794 13.978c-.244.685-1.22 1.258-1.685 1.31-.415.048-.954.072-1.554-.12a14.2 14.2 0 0 1-5.323-3.26c-1.423-1.416-2.5-3.155-2.775-3.626-.275-.471-.03-.725.207-.962.214-.213.473-.553.71-.83.235-.276.314-.471.472-.786.158-.314.079-.588-.04-.844-.118-.256-.944-2.274-1.298-3.125-.347-.831-.699-.718-.959-.731-.248-.013-.016-.284 0-.749.106-1.14.53-.393.424-1.5 1.464-1.5 3.568 0 2.102 1.533 4.133 1.747 4.419.215.285 3.018 4.606 7.311 6.467 1.02.443 1.815.707 2.437.904 1.025.326 1.958.28 2.696.17.822-.123 2.533-1.035 2.89-2.035.356-1 .356-1.857.248-2.035-.108-.178-.396-.285-.84-.508z" />
                                  </svg>
                                  <span>Confirmar no WhatsApp</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSuccessReserved(null)}
                                  className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg cursor-pointer hover:bg-slate-800"
                                >
                                  Concluir e Voltar
                                </button>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* ACTIVE RESERVATION SELECTION CARD */}
                      {selectedNumbers.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-slate-800 space-y-3 animate-fadeIn">
                          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />
                            Deseja reservar as cotas selecionadas?
                          </h4>
                          <div className="text-xs text-slate-605 leading-relaxed">
                            Você selecionou <strong className="text-slate-900">{selectedNumbers.length} cota(s)</strong>:{" "}
                            <div className="flex flex-wrap gap-1.5 my-1.5">
                              {selectedNumbers.map(n => (
                                <span key={n} className="font-mono bg-amber-100 border border-amber-300 text-amber-900 rounded px-1.5 py-0.5 text-xs font-bold shadow-sm">
                                  #{n}
                                </span>
                              ))}
                            </div>
                            Ao confirmar, estes números serão temporariamente reservados sob seu nome por 2(Duas) horas. Para garanti-los, você deve realizar a transferência manual via PIX.
                          </div>

                          {/* DESTACADO VALOR TOTAL DA RESERVA SELECIONADA */}
                          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-2 border-amber-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                            <div className="space-y-1">
                              <span className="text-[10px] text-amber-850 font-black uppercase tracking-widest block leading-none">VALOR TOTAL DO PEDIDO</span>
                              {(() => {
                                const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts);
                                return (
                                  <div className="space-y-1.5">
                                    <strong className="text-3xl md:text-4xl font-extrabold text-amber-950 font-sans block leading-none">
                                      R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </strong>
                                    <span className="text-xs text-amber-800 font-semibold block leading-none">
                                      {selectedNumbers.length} cota(s) • R$ {calc.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cada {calc.appliedDiscount ? "(Desconto Progressivo!)" : ""}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                            {(() => {
                              const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts);
                              return (
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {calc.appliedDiscount && (
                                    <span className="text-[9px] bg-emerald-600 text-white font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-4xs animate-pulse">
                                      Melhor Desconto Ativo! 🏷️
                                    </span>
                                  )}
                                  <span className="text-3xl filter drop-shadow select-none hidden sm:inline">💎</span>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="flex gap-2 justify-end text-xs pt-1">
                            <button
                              onClick={() => setSelectedNumbers([])}
                              disabled={reserving}
                              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg cursor-pointer"
                            >
                              Limpar Seleção
                            </button>
                            <button
                              onClick={handleReserveTickets}
                              disabled={reserving}
                              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md shadow-indigo-500/20 cursor-pointer text-center flex items-center gap-1"
                            >
                              {reserving ? "Reservando..." : `Confirmar Pré-Reserva de ${selectedNumbers.length} Cota(s)`}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* INTERACTIVE GRID SECTION */}
                      <div className="space-y-4">
                        {(() => {
                          const suspension = isLotterySalesSuspended();
                          if (!suspension.suspended) return null;
                          return (
                            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed animate-pulse shadow-sm">
                              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <h5 className="font-extrabold text-[13px] text-amber-950 uppercase tracking-tight">Vendas Temporariamente Bloqueadas</h5>
                                <p className="font-medium text-amber-700">
                                  {suspension.reason} As cotas encontram-se travadas para transações de compra ou reserva, mas você pode visualizá-las normalmente nesta tela.
                                </p>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                              <TicketIcon className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
                              Quadro de Bilhetes Disponíveis
                            </h3>
                            <p className="text-slate-500 text-xs">
                              Clique sobre qualquer número em cinza ou use a compra rápida abaixo para realizar a sua reserva.
                            </p>
                          </div>

                          {/* Legend badges */}
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
                            <span className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> Dispo.
                            </span>
                            <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Reservado
                            </span>
                            <span className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 px-2 py-1 rounded">
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span> Confirmado
                            </span>
                          </div>
                        </div>

                        {/* COMPRA RÁPIDA (LOTES ALEATÓRIOS) */}
                        {selectedCampaign.status === "active" && (
                          <div className="bg-gradient-to-r from-emerald-500/10 via-[#82C943]/5 to-transparent border border-emerald-500/15 p-4 rounded-2xl space-y-3.5 animate-fadeIn">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                                  Compra Rápida (Lotes Promocionais)
                                </h4>
                                <p className="text-[10.5px] text-emerald-700/80 font-medium">
                                  Selecione cotas de forma 100% aleatória e garanta suas chances de ganhar!
                                </p>
                              </div>
                              <span className="text-[9px] text-[#55911d] font-mono bg-[#82C943]/20 border border-[#82C943]/30 px-2.5 py-0.5 rounded-full self-start sm:self-center font-bold uppercase tracking-wider">
                                🔥 Mais rápido
                              </span>
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                              {[5, 10, 25, 50, 100].map((count) => {
                                if (selectedCampaign.totalTickets < count) return null;
                                const isSelectedCount = selectedNumbers.length === count;
                                
                                return (
                                  <button
                                    key={count}
                                    type="button"
                                    onClick={() => handleQuickSelectRandom(count)}
                                    className={`relative py-2.5 px-1 sm:px-3 rounded-xl shadow-xs transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-center flex flex-col items-center justify-center cursor-pointer border font-black text-xs ${
                                      isSelectedCount
                                        ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                                        : "bg-[#82C943] border-[#82C943] hover:bg-[#72b834] hover:border-[#72b834] text-white"
                                    }`}
                                  >
                                    <span className="text-[15px] leading-tight">+{count}</span>
                                    <span className="text-[8px] font-sans font-medium opacity-90 uppercase tracking-widest mt-0.5">
                                      cotas
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Search and Pagination Controls */}
                        <div className="bg-slate-100/50 p-3 rounded-2xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                              <Search className="w-4 h-4" />
                            </span>
                            <input
                              type="text"
                              value={ticketSearch}
                              onChange={(e) => setTicketSearch(e.target.value.replace(/\D/g, ""))}
                              placeholder="Buscar número específico..."
                              className="w-full bg-white pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-650"
                            />
                            {ticketSearch && (
                              <button
                                onClick={() => setTicketSearch("")}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-slate-400 hover:text-slate-600"
                              >
                                Limpar
                              </button>
                            )}
                          </div>

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between md:justify-end gap-2.5 text-xs text-slate-650">
                              <button
                                disabled={ticketPage === 0}
                                onClick={() => setTicketPage(prev => Math.max(0, prev - 1))}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-50 font-bold hover:bg-slate-50 transition cursor-pointer"
                              >
                                Anterior
                              </button>
                              <span className="font-semibold text-slate-700 text-[11px]">
                                Página <strong>{ticketPage + 1}</strong> de {totalPages}
                              </span>
                              <button
                                disabled={ticketPage >= totalPages - 1}
                                onClick={() => setTicketPage(prev => Math.min(totalPages - 1, prev + 1))}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-50 font-bold hover:bg-slate-50 transition cursor-pointer"
                              >
                                Próxima
                              </button>
                            </div>
                          )}
                        </div>

                        {loadingTickets ? (
                          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                            {Array.from({ length: 40 }).map((_, idx) => (
                              <div key={idx} className="h-10 bg-slate-100 animate-pulse rounded-lg"></div>
                            ))}
                          </div>
                        ) : paginatedIndices.length === 0 ? (
                          <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl min-h-[140px] flex flex-col items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-amber-500 mb-2 shrink-0 animate-pulse" />
                            <h4 className="font-bold text-slate-800 text-[13px]">Nenhum número correspondente encontrado</h4>
                            <p className="text-[11px] text-slate-400 max-w-sm mt-0.5">Tente buscar por um termo numérico diferente existente nesta campanha.</p>
                          </div>
                        ) : (
                          /* Grid drawing loop based on total size limit */
                          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-[450px] overflow-y-auto p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full">
                            {paginatedIndices.map((idx) => {
                              const numStr = padNumber(idx, selectedCampaign.totalTickets);
                              const tInfo = tickets[numStr];
                              const isCurrentlySelected = selectedNumbers.includes(numStr);

                              // Resolve background style states
                              let bgClass = "bg-white text-slate-700 hover:bg-slate-100 border-slate-200 hover:scale-105 hover:bg-slate-50";
                              let statusLabel = "Livre (Disponível)";

                              if (isCurrentlySelected) {
                                bgClass = "bg-indigo-600 text-white border-indigo-600 font-bold scale-[1.03] shadow-md hover:bg-indigo-700 ring-2 ring-indigo-500/20";
                                statusLabel = "Selecionado por você";
                              } else if (tInfo) {
                                if (tInfo.status === "confirmed") {
                                  bgClass = "bg-indigo-100/70 text-indigo-400 border-indigo-100 cursor-not-allowed pointer-events-none opacity-60";
                                  statusLabel = `Confirmado por ${tInfo.buyerName}`;
                                } else if (tInfo.status === "reserved") {
                                  const isMine = tInfo.buyerUid === userProfile.uid;
                                  bgClass = isMine
                                    ? "bg-amber-400 text-slate-900 border-amber-400 hover:bg-amber-500 font-bold"
                                    : "bg-amber-100 text-amber-800 border-amber-200 cursor-not-allowed pointer-events-none opacity-70";
                                  statusLabel = isMine ? "Sua Reserva" : "Já Reservado";
                                }
                              }

                              return (
                                <button
                                  key={numStr}
                                  disabled={tInfo?.status === "confirmed" || (tInfo?.status === "reserved" && tInfo.buyerUid !== userProfile.uid)}
                                  onClick={() => {
                                    setSuccessReserved(null);
                                    handleToggleNumberSelection(numStr);
                                  }}
                                  className={`h-11 sm:h-12 border rounded-xl font-mono text-xs sm:text-sm font-semibold transition-all shadow-subtle flex flex-col items-center justify-center cursor-pointer ${bgClass}`}
                                  title={`Bilhete #${numStr} - ${statusLabel}`}
                                >
                                  <span>{numStr}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PAUSED RAFFLE MOOD CARD */}
                  {selectedCampaign.status === "paused" && (
                    <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                      <AlertCircle className="w-12 h-12 text-amber-500 animate-bounce" />
                      <h3 className="font-bold text-slate-800 text-lg">Esta rifa está pausada temporariamente</h3>
                      <p className="text-slate-500 text-xs max-w-sm leading-relaxed">
                        A visualização do regulamento continua disponível, mas a reserva de novos bilhetes está bloqueada até que o administrador reative a campanha.
                      </p>
                    </div>
                  )}
                </div>

                {/* Mobile Only: Top 5 Maiores Apoiadores of the active campaign */}
                <div className="block lg:hidden mt-6">
                  {renderTopSupportersWidget(false)}
                </div>
              </div>

              {/* Coluna Direita: Minhas Reservas (Desktop-only inside RIFAS view) */}
              <div className="hidden lg:block lg:col-span-4 space-y-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4 font-normal text-slate-705">
                  <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-650 shrink-0" />
                    Minhas Reservas & Bilhetes
                  </h2>
                  <p className="text-slate-505 text-xs font-normal">
                    Acompanhe o status do pagamento manual das suas reservas enviadas ao administrador.
                  </p>

                  {myTotalTicketsCount === 0 ? (
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-450 text-xs text-center normal-case">
                Você não possui compras ou reservas registradas no momento.
              </div>
            ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {(Object.entries(myTickets) as [string, Ticket[]][]).map(([campaignId, tList]) => {
                        if (tList.length === 0) return null;
                        const camp = campaigns.find(c => c.id === campaignId);
                        if (!camp) return null;

                        const confirmedTickets = tList.filter(item => item.status === "confirmed");

                        return (
                          <div key={campaignId} className="space-y-2 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <strong className="text-slate-800 text-xs block truncate max-w-[55%]" title={camp.title}>{camp.title}</strong>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-slate-400">{tList.length} cota(s)</span>
                                {tList.filter(t => t.status === "reserved").length > 0 && (
                                  <button
                                    onClick={() => handleWhatsAppRedirect(tList.filter(t => t.status === "reserved"), camp)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                                    title="Enviar comprovante de reserva desta campanha por WhatsApp"
                                  >
                                    <span>WhatsApp 💬</span>
                                  </button>
                                )}
                                {confirmedTickets.length > 0 && (
                                  <button
                                    onClick={() => setTicketModalConfig({ campaign: camp, tickets: confirmedTickets })}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                                    title="Emitir todos os bilhetes confirmados desta campanha"
                                  >
                                    <span>Emitir 🎟️</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {tList.map((t) => {
                                const isConfirmed = t.status === "confirmed";
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      if (isConfirmed) {
                                        setTicketModalConfig({ campaign: camp, tickets: [t] });
                                      }
                                    }}
                                    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold font-mono flex items-center gap-1 transition-all ${
                                      isConfirmed
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-800 hover:scale-[1.03] hover:bg-indigo-100 cursor-pointer"
                                        : "bg-amber-55 border-amber-200 text-amber-800 cursor-default"
                                    }`}
                                    title={isConfirmed ? "Clique para emitir seu Bilhete Oficial 🎟️" : "Aguardando confirmação de pagamento"}
                                  >
                                    <span>#{t.number}</span>
                                    <span className="text-[9px] uppercase px-1 rounded bg-white font-sans font-bold shrink-0">
                                      {isConfirmed ? "Pago 🌟" : "Pend."}
                                    </span>
                                    {t.status === "reserved" && (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCancelReservation(campaignId, t.id);
                                        }}
                                        className="text-red-500 hover:text-red-700 ml-0.5 font-sans font-extrabold cursor-pointer text-xs leading-none"
                                        title="Desistir da reserva"
                                      >
                                        ×
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Copy PIX helper inside reservations list */}
                  {myTotalTicketsCount > 0 && (Object.values(myTickets).flat() as Ticket[]).some(t => t.status === "reserved") && (
                    <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-xs text-slate-700 space-y-2.5 animate-fadeIn">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <Landmark className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Transferência Pix Pendente</span>
                      </div>

                      {/* VALOR TOTAL PENDENTE COM GRANDE VISIBILIDADE */}
                      {(() => {
                        let totalSum = 0;
                        let countSum = 0;
                        (Object.entries(myTickets) as [string, Ticket[]][]).forEach(([campaignId, tList]) => {
                          const pCount = tList.filter(t => t.status === "reserved").length;
                          if (pCount > 0) {
                            const camp = campaigns.find(c => c.id === campaignId);
                            if (camp) {
                              const calc = getDiscountedPrice(pCount, camp.ticketPrice, camp.progressiveDiscounts);
                              totalSum += calc.totalPrice;
                              countSum += pCount;
                            }
                          }
                        });
                        return (
                          <div className="bg-amber-500 text-white rounded-xl p-3.5 text-center flex flex-col justify-center items-center shadow-sm space-y-0.5 border border-amber-450">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-amber-100">Valor Total Devido (PIX)</span>
                            <span className="text-2xl font-black font-sans leading-none">R$ {totalSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-[10px] text-amber-50 font-medium">{countSum} cota(s) aguardando pagamento</span>
                          </div>
                        );
                      })()}

                      <p className="text-[11.5px] leading-relaxed text-slate-700 font-medium">
                        Realize a transferência acima via PIX das suas cotas pendentes nos dados abaixo para confirmar suas reservas:
                      </p>
                      <div className="space-y-3 bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-xs">
                        <div className="bg-slate-950 border-2 border-amber-400 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md relative overflow-hidden group">
                          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-yellow-500/5 pointer-events-none" />
                          <div className="flex-1 min-w-0 w-full relative z-10 select-all text-center sm:text-left">
                            <span className="text-[9px] text-amber-400 font-extrabold block font-sans tracking-widest uppercase">👇 COPIAR ESTA CHAVE PIX 👇</span>
                            <span className="break-all block font-extrabold text-[14px] md:text-[15px] text-yellow-300 font-mono tracking-wide bg-amber-500/10 px-2.5 py-2 rounded-lg border border-amber-500/20 mt-1 select-all">{settings.pixKey}</span>
                          </div>
                          <button
                            onClick={handleCopyPix}
                            className={`w-full sm:w-auto px-5 py-3.5 rounded-xl font-black cursor-pointer transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-lg border-2 shrink-0 group/pill ${
                              copiedPix
                                ? "bg-emerald-600 border-emerald-500 text-white"
                                : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 border-amber-400 active:scale-95 animate-pulse"
                            }`}
                            title="Copiar chave PIX"
                          >
                            {copiedPix ? (
                              <>
                                <Check className="w-4 h-4 text-white stroke-[3px] animate-bounce" />
                                <span>Copiada!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 text-slate-900 stroke-[3px] transition-transform duration-300 group-hover/pill:scale-125 group-hover/pill:rotate-12 animate-pulse" />
                                <span>Copiar Chave</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          {settings.receiverName && (
                            <div className="text-[11px] text-slate-650 bg-white/80 border border-slate-100/50 p-2 rounded-lg flex justify-between items-center font-sans">
                              <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Favorecido:</span>
                              <strong className="text-slate-905 font-black text-sm">{settings.receiverName}</strong>
                            </div>
                          )}
                          {settings.bankName && (
                            <div className="text-[11px] text-slate-650 bg-white/80 border border-slate-100/50 p-2 rounded-lg flex justify-between items-center font-sans">
                              <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Banco:</span>
                              <strong className="text-slate-905 font-black text-sm">{settings.bankName}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal bg-white/40 p-1.5 rounded-lg border border-slate-200/10">
                        💡 Realize o pagamento em até <strong>{settings.expirationHours} horas</strong>. Buscaremos no extrato pelo seu CPF <strong>{userProfile.cpf}</strong> para validar os números!
                      </p>
                      <button
                        onClick={() => handleWhatsAppRedirect()}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm border border-emerald-500/15"
                      >
                        <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                          <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.978L2 22l5.133-1.343a9.894 9.894 0 0 0 4.873 1.344h.004c5.507 0 9.99-4.478 9.99-9.984a9.97 9.97 0 0 0-2.926-7.064A9.923 9.923 0 0 0 12.012 2zm5.794 13.978c-.244.685-1.22 1.258-1.685 1.31-.415.048-.954.072-1.554-.12a14.2 14.2 0 0 1-5.323-3.26c-1.423-1.416-2.5-3.155-2.775-3.626-.275-.471-.03-.725.207-.962.214-.213.473-.553.71-.83.235-.276.314-.471.472-.786.158-.314.079-.588-.04-.844-.118-.256-.944-2.274-1.298-3.125-.347-.831-.699-.718-.959-.731-.248-.013-.532-.016-.816-.016-.284 0-.749.106-1.14.53-.393.424-1.5 1.464-1.5 3.568 0 2.102 1.533 4.133 1.747 4.419.215.285 3.018 4.606 7.311 6.467 1.02.443 1.815.707 2.437.904 1.025.326 1.958.28 2.696.17.822-.123 2.533-1.035 2.89-2.035.356-1 .356-1.857.248-2.035-.108-.178-.396-.285-.84-.508z" />
                        </svg>
                        <span>Confirmar no WhatsApp (Comissão)</span>
                      </button>
                    </div>
                  )}
                </div>
                {renderTopSupportersWidget(true)}
              </div>

            </div>
          )}
        </div>
      )}

      {/* 3. RETRO COMPATIBLE "COMPRAS" TAB SEARCH ON MOBILE (ONLY) */}
      {activeTab === "compras" && (
        <div className="block lg:hidden space-y-6 animate-fadeIn">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
            <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-650 shrink-0" />
              Minhas Reservas & Bilhetes
            </h2>
            <p className="text-slate-500 text-xs">
              Acompanhe o status do pagamento manual das suas reservas enviadas ao administrador.
            </p>

            {myTotalTicketsCount === 0 ? (
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-450 text-xs text-center normal-case">
                Você não possui compras ou reservas registradas no momento.
              </div>
            ) : (
              <div className="space-y-4">
                {(Object.entries(myTickets) as [string, Ticket[]][]).map(([campaignId, tList]) => {
                  if (tList.length === 0) return null;
                  const camp = campaigns.find(c => c.id === campaignId);
                  if (!camp) return null;

                  const confirmedTickets = tList.filter(item => item.status === "confirmed");

                  return (
                    <div key={campaignId} className="space-y-2 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <strong className="text-slate-800 text-xs block truncate max-w-[55%]" title={camp.title}>{camp.title}</strong>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400">{tList.length} cota(s)</span>
                          {tList.filter(t => t.status === "reserved").length > 0 && (
                            <button
                              onClick={() => handleWhatsAppRedirect(tList.filter(t => t.status === "reserved"), camp)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                              title="Enviar comprovante de reserva desta campanha por WhatsApp"
                            >
                              <span>WhatsApp 💬</span>
                            </button>
                          )}
                          {confirmedTickets.length > 0 && (
                            <button
                              onClick={() => setTicketModalConfig({ campaign: camp, tickets: confirmedTickets })}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                              title="Emitir todos os bilhetes confirmados desta campanha"
                            >
                              <span>Emitir 🎟️</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tList.map((t) => {
                          const isConfirmed = t.status === "confirmed";
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                if (isConfirmed) {
                                  setTicketModalConfig({ campaign: camp, tickets: [t] });
                                }
                              }}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-semibold font-mono flex items-center gap-1 transition-all ${
                                isConfirmed
                                  ? "bg-indigo-50 border-indigo-200 text-indigo-800 hover:scale-[1.03] hover:bg-indigo-100 cursor-pointer"
                                  : "bg-amber-55 border-amber-200 text-amber-800 cursor-default"
                              }`}
                              title={isConfirmed ? "Clique para emitir seu Bilhete Oficial 🎟️" : "Aguardando confirmação de pagamento"}
                            >
                              <span>#{t.number}</span>
                              <span className="text-[9px] uppercase px-1 rounded bg-white font-sans font-bold shrink-0">
                                {isConfirmed ? "Pago 🌟" : "Pend."}
                              </span>
                              {t.status === "reserved" && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelReservation(campaignId, t.id);
                                  }}
                                  className="text-red-500 hover:text-red-700 ml-0.5 font-sans font-extrabold cursor-pointer text-xs leading-none"
                                  title="Desistir da reserva"
                                >
                                  ×
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Copy PIX helper inside reservations list for mobile */}
            {myTotalTicketsCount > 0 && (Object.values(myTickets).flat() as Ticket[]).some(t => t.status === "reserved") && (
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-xs text-slate-705 space-y-2.5 animate-fadeIn">
                <div className="flex items-center gap-1.5 font-bold text-amber-850">
                  <Landmark className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Transferência Pix Pendente</span>
                </div>

                {/* VALOR TOTAL PENDENTE COM GRANDE VISIBILIDADE */}
                {(() => {
                  let totalSum = 0;
                  let countSum = 0;
                  (Object.entries(myTickets) as [string, Ticket[]][]).forEach(([campaignId, tList]) => {
                    const pCount = tList.filter(t => t.status === "reserved").length;
                    if (pCount > 0) {
                      const camp = campaigns.find(c => c.id === campaignId);
                      if (camp) {
                        const calc = getDiscountedPrice(pCount, camp.ticketPrice, camp.progressiveDiscounts);
                        totalSum += calc.totalPrice;
                        countSum += pCount;
                      }
                    }
                  });
                  return (
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-5 text-center flex flex-col justify-center items-center shadow-md space-y-1 border border-amber-400">
                      <span className="text-[10px] uppercase font-black tracking-widest text-amber-100/95">VALOR TOTAL DO PIX A SER PAGO</span>
                      <span className="text-3xl font-extrabold font-sans tracking-tight leading-none">
                        R$ {totalSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-700/30 rounded-full border border-amber-400/20 text-xs text-amber-50 font-semibold mt-1">
                        <span>🎟️ {countSum} cota{countSum > 1 ? "s" : ""} reservada{countSum > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  );
                })()}

                 <p className="text-[11.5px] leading-relaxed text-slate-705 font-medium">
                  Realize a transferência acima via PIX das suas cotas pendentes nos dados abaixo para confirmar suas reservas:
                </p>
                <div className="space-y-3 bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-xs">
                  <div className="bg-slate-950 border-2 border-amber-400 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-yellow-500/5 pointer-events-none" />
                    <div className="flex-1 min-w-0 w-full relative z-10 select-all text-center sm:text-left">
                      <span className="text-[9px] text-amber-400 font-extrabold block font-sans tracking-widest uppercase">👇 COPIAR ESTA CHAVE PIX 👇</span>
                      <span className="break-all block font-extrabold text-[14px] md:text-[15px] text-yellow-300 font-mono tracking-wide bg-amber-500/10 px-2.5 py-2 rounded-lg border border-amber-500/20 mt-1 select-all">{settings.pixKey}</span>
                    </div>
                    <button
                      onClick={handleCopyPix}
                      className={`w-full sm:w-auto px-5 py-3.5 rounded-xl font-black cursor-pointer transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-lg border-2 shrink-0 group/pill ${
                        copiedPix
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 border-amber-400 active:scale-95 animate-pulse"
                      }`}
                      title="Copiar chave PIX"
                    >
                      {copiedPix ? (
                        <>
                          <Check className="w-4 h-4 text-white stroke-[3px] animate-bounce" />
                          <span>Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-slate-900 stroke-[3px] transition-transform duration-300 group-hover/pill:scale-125 group-hover/pill:rotate-12 animate-pulse" />
                          <span>Copiar Chave</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="space-y-2 text-xs">
                    {settings.receiverName && (
                      <div className="text-[11px] text-slate-650 bg-white/80 border border-slate-100/50 p-2 rounded-lg flex justify-between items-center font-sans">
                        <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Favorecido:</span>
                        <strong className="text-slate-905 font-black text-sm">{settings.receiverName}</strong>
                      </div>
                    )}
                    {settings.bankName && (
                      <div className="text-[11px] text-slate-650 bg-white/80 border border-slate-100/50 p-2 rounded-lg flex justify-between items-center font-sans">
                        <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Banco:</span>
                        <strong className="text-slate-905 font-black text-sm">{settings.bankName}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-505 leading-normal bg-white/40 p-1.5 rounded-lg border border-slate-200/10">
                  💡 Realize o pagamento em até <strong>{settings.expirationHours} horas</strong>. Buscaremos no extrato pelo seu CPF <strong>{userProfile.cpf}</strong> para validar os números!
                </p>
                <button
                  onClick={() => handleWhatsAppRedirect()}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm border border-emerald-500/15"
                >
                  <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.978L2 22l5.133-1.343a9.894 9.894 0 0 0 4.873 1.344h.004c5.507 0 9.99-4.478 9.99-9.984a9.97 9.97 0 0 0-2.926-7.064A9.923 9.923 0 0 0 12.012 2zm5.794 13.978c-.244.685-1.22 1.258-1.685 1.31-.415.048-.954.072-1.554-.12a14.2 14.2 0 0 1-5.323-3.26c-1.423-1.416-2.5-3.155-2.775-3.626-.275-.471-.03-.725.207-.962.214-.213.473-.553.71-.83.235-.276.314-.471.472-.786.158-.314.079-.588-.04-.844-.118-.256-.944-2.274-1.298-3.125-.347-.831-.699-.718-.959-.731-.248-.013-.532-.016-.816-.016-.284 0-.749.106-1.14.53-.393.424-1.5 1.464-1.5 3.568 0 2.102 1.533 4.133 1.747 4.419.215.285 3.018 4.606 7.311 6.467 1.02.443 1.815.707 2.437.904 1.025.326 1.958.28 2.696.17.822-.123 2.533-1.035 2.89-2.035.356-1 .356-1.857.248-2.035-.108-.178-.396-.285-.84-.508z" />
                  </svg>
                  <span>Confirmar no WhatsApp (Comissão)</span>
                </button>
              </div>
            )}

            {/* FLOAT CHECKOUT POP-IN ON MOBILE SCENARIOS */}
            {selectedCampaign && selectedNumbers.length > 0 && (
              <div className="fixed bottom-16 left-0 right-0 z-45 px-4 py-3 bg-indigo-950 text-white shadow-[0_-8px_24px_rgba(0,0,0,0.22)] flex lg:hidden items-center justify-between animate-slideUp select-none rounded-t-2xl border-t border-indigo-800">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-indigo-200 font-extrabold uppercase tracking-widest block">TOTAL DO PEDIDO</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-xs font-black text-indigo-100 bg-indigo-850 border border-indigo-700/50 px-1.5 py-0.5 rounded">
                      {selectedNumbers.length} {selectedNumbers.length === 1 ? "cota" : "cotas"}
                    </strong>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      R$ {(() => {
                        const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts);
                        return calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </span>
                    {(() => {
                      const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts);
                      if (calc.appliedDiscount) {
                        return (
                          <span className="text-[8px] bg-emerald-600 text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
                            Desconto!
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedNumbers([])}
                    className="px-3 py-1.5 bg-slate-105 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200/45 cursor-pointer active:scale-95"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={handleReserveTickets}
                    disabled={reserving}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-500/10 cursor-pointer flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
                  >
                    {reserving ? "Reservando..." : "Confirmar 🚀"}
                  </button>
                </div>
              </div>
            )}

            {/* OFFICIAL CONTACT SUPPORT FOOTER */}
            <footer className="mt-12 mb-8 text-center px-4 max-w-xl mx-auto space-y-2.5 select-text relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-250/50 text-[11px] text-slate-600 font-bold shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Suporte Ativo por E-mail</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Dúvidas sobre reservas, comprovantes ou sorteios? Entre em contato pelo e-mail oficial:
              </p>
              <div className="font-mono text-xs md:text-sm font-black text-indigo-950 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl w-fit mx-auto shadow-sm hover:scale-[1.01] transition-all">
                <a href={`mailto:${settings.supportEmail || "contato@rifadochiquinho.com.br"}`} className="text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1.5 break-all">
                  <span>✉️</span>
                  <span>{settings.supportEmail || "contato@rifadochiquinho.com.br"}</span>
                </a>
              </div>
              <span className="text-[10px] text-slate-400 font-extrabold block uppercase tracking-widest pt-2">
                © {new Date().getFullYear()} - Rifa do Chiquinho - Todos os direitos reservados
              </span>
            </footer>

            {/* FIXED FLOATING FOOTER NAVIGATION TABS FOR HEALTHY MOBILE THUMB CONTROL */}
            <div className="fixed bottom-0 left-0 right-0 z-45 bg-white/95 backdrop-blur-md border-t border-slate-200/75 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-2 py-1.5 flex justify-around items-center lg:hidden select-none">
              <button
                onClick={() => {
                  setActiveTab("rifas");
                  setSuccessReserved(null);
                }}
                className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all cursor-pointer ${
                  activeTab === "rifas" ? "text-indigo-650 font-black scale-105" : "text-slate-450 hover:text-slate-755"
                }`}
              >
                <TicketIcon className={`w-4.5 h-4.5 mb-1 ${activeTab === "rifas" ? "text-indigo-600 animate-pulse" : "text-slate-400"}`} />
                <span className="text-[9.5px]">Rifas</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("compras");
                  setSuccessReserved(null);
                }}
                className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all cursor-pointer relative ${
                  activeTab === "compras" ? "text-indigo-650 font-black scale-105" : "text-slate-450 hover:text-slate-755"
                }`}
              >
                <ShoppingBag className={`w-4.5 h-4.5 mb-1 ${activeTab === "compras" ? "text-indigo-600" : "text-slate-400"}`} />
                <span className="text-[9.5px]">Reservas</span>
                {myTotalTicketsCount > 0 && (
                  <span className="absolute top-1 right-2.5 bg-indigo-650 border border-white text-white font-extrabold text-[8.5px] min-w-[14px] h-[14px] rounded-full flex items-center justify-center px-0.5 shadow-sm">
                    {myTotalTicketsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab("ranking");
                  setSuccessReserved(null);
                }}
                className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all cursor-pointer ${
                  activeTab === "ranking" ? "text-indigo-650 font-black scale-105" : "text-slate-450 hover:text-slate-755"
                }`}
              >
                <Trophy className={`w-4.5 h-4.5 mb-1 ${activeTab === "ranking" ? "text-amber-500" : "text-slate-400"}`} />
                <span className="text-[9.5px]">Ranking</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL RULES / REGULAMENTO MODAL */}
      <AnimatePresence>
        {showRulesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="font-extrabold text-base tracking-tight">Instruções e Regulamento</h3>
                    <span className="text-[10px] text-slate-400 block -mt-0.5 font-bold uppercase tracking-wide">Rifas de Formatura Oficial</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Content body */}
              <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-4">
                <div 
                  className="text-slate-705 text-sm leading-relaxed rich-text-content"
                  dangerouslySetInnerHTML={{ __html: settings.rulesText || "Nenhum regulamento cadastrado no momento." }}
                />
              </div>

              {/* Footer buttons */}
              <div className="bg-slate-50 border-t border-slate-150 p-4 flex justify-end">
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                >
                  Entendi, Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LGPD USER COMPLIANCE / PRIVACY RIGHTS CENTER MODAL */}
      {showLgpdModal && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs select-none">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-fadeIn">
            {/* Header */}
            <div className="bg-emerald-900 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 animate-pulse" />
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Privacidade & Meus Dados (LGPD)</h3>
                  <span className="text-[10px] text-emerald-300 block -mt-0.5 font-bold uppercase tracking-wide">Direitos do Titular (Brasil - Lei 13.709/18)</span>
                </div>
              </div>
              <button
                onClick={() => setShowLgpdModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 select-text space-y-6">
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-150 text-xs md:text-sm text-emerald-850 leading-relaxed">
                <span className="font-bold text-emerald-900 block mb-1">🛡️ Seus Dados estão Protegidos de acordo com a LGPD</span>
                Você possui total controle sobre as informações coletadas. Conforme a regulação, veja abaixo o diagnóstico completo de como tratamos e quais informações estão armazenadas.
              </div>

              {/* Data Diagnosis Grid */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wide">1. Transparência: Dados Pessoais Armazenados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Nome Cadastrado</span>
                    <span className="text-sm font-bold text-slate-800">{userProfile.name}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">E-mail de Autenticação</span>
                    <span className="text-sm font-semibold text-slate-705 font-mono">{userProfile.email}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">CPF (Tratado p/ antifraude)</span>
                    <span className="text-sm font-mono text-slate-805 font-bold">{userProfile.cpf}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">WhatsApp / Celular</span>
                    <span className="text-sm font-semibold text-slate-805 font-mono">{userProfile.phone}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl md:col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Cidade do Usuário</span>
                    <span className="text-xs font-semibold text-slate-750">{userProfile.city}</span>
                  </div>
                </div>
              </div>

              {/* Legal Base explanations */}
              <div className="space-y-3.5">
                <h4 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wide">2. Finalidade e Bases Legais aplicadas</h4>
                <div className="text-xs text-slate-600 space-y-3">
                  <p>
                    <strong>Art. 7º, I da LGPD (Consentimento):</strong> Você consentiu explicitamente ao preencher este cadastro no momento do seu primeiro acesso à plataforma formal.
                  </p>
                  <p>
                    <strong>Art. 11, II, "g" da LGPD (Prevenção à Fraude):</strong> Tratamos o seu CPF com a única finalidade técnica de resguardar a integridade dos sorteios, garantir que cada ganhador corresponda a uma identidade civil única, mitigar cadastros fantasmas e evitar fraudes beneficentes.
                  </p>
                  <p>
                    <strong>Hospedagem & Segurança:</strong> Seus dados são salvos com segurança de ponta-a-ponta nos servidores em nuvem do Google Firebase operando em infraestrutura redundante e vigiado por regras de acesso à prova de vazamento.
                  </p>
                </div>
              </div>

              {/* Exercises / Rights buttons container */}
              <div className="bg-slate-100 rounded-2xl p-5 border border-slate-200 flex flex-col gap-4">
                <h4 className="font-black text-slate-805 text-xs uppercase tracking-wider">3. Exerça seus Direitos de Titular</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Portabilidade */}
                  <button
                    type="button"
                    onClick={handleExportMyData}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl border border-slate-250 transition cursor-pointer shadow-xs active:scale-95"
                  >
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Baixar Relatório (Portabilidade)</span>
                  </button>

                  {/* Direito ao Esquecimento */}
                  <button
                    type="button"
                    onClick={handleDeleteMyDataAndAccount}
                    disabled={isDeletingAccount}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                  >
                    {isDeletingAccount ? (
                      <div className="w-3.5 h-3.5 border-2 border-rose-750 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    <span>Excluir Cadastro (Esquecimento)</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 italic leading-snug">
                  *A exclusão do cadastro cancelará na mesma hora todos os seus números de bilhetes que estejam atualmente pré-reservados.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-150 p-4 flex justify-end">
              <button
                onClick={() => setShowLgpdModal(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
              >
                Concluir Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TICKET EMISSION AND VISUALIZATION DIALOG MODAL */}
      {ticketModalConfig && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          {/* Custom style injection for print support */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              /* Hide everything in the page */
              body * {
                visibility: hidden !important;
                background: none !important;
              }
              /* Show ONLY the printable ticket area */
              #printable-tickets-area, #printable-tickets-area * {
                visibility: visible !important;
              }
              #printable-tickets-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .print-ticket-card {
                page-break-inside: avoid !important;
                margin-bottom: 1.5rem !important;
                border: 2px dashed #10b981 !important;
                box-shadow: none !important;
                background-color: #fdfdf4 !important;
                color: #064e3b !important;
              }
            }
          `}} />

          <div className="bg-slate-900 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] text-white animate-fadeIn">
            {/* Header */}
            <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TicketIcon className="w-5 h-5 text-emerald-400 rotate-12" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">Comprovante de Volante de Loteria</h3>
                  <span className="text-[10px] text-emerald-400 block -mt-0.5 font-bold uppercase tracking-wider">
                    {ticketModalConfig.tickets.length === 1 ? "1 Volante Emitido" : `${ticketModalConfig.tickets.length} Volantes Emitidos`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setTicketModalConfig(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 transition flex items-center justify-center text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable list of vouchers */}
            <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6 select-text bg-slate-950">
              <p className="text-[11px] text-slate-400 text-center -mt-1 leading-relaxed">
                🎟️ Este é o seu volante único oficial. O pagamento foi homologado e a aposta confirmada na plataforma. Você pode imprimir ou salvar em arquivo.
              </p>

              {/* Printable area wrapper */}
              <div id="printable-tickets-area">
                {(() => {
                  const purchasedNumbers = ticketModalConfig.tickets.map((t) => t.number);
                  const combinedAuth = `${ticketModalConfig.campaign.id.slice(0, 6)}-LOTE-${purchasedNumbers.slice(0, 3).join("-")}-${userProfile.uid.slice(0, 5)}`.toUpperCase();

                  return (
                    <div className="print-ticket-card bg-[#fefdf0] rounded-2xl border-t-[12px] border-emerald-600 border-l border-r border-b border-emerald-250 p-5 md:p-6 overflow-hidden relative shadow-lg text-slate-900 font-sans">
                      {/* Watermark Logo */}
                      <div className="absolute right-6 bottom-16 text-emerald-650 opacity-5 select-none pointer-events-none text-8xl font-black font-mono">
                        LOTERIA
                      </div>

                      {/* Header resembling Caixa Mega Sena card */}
                      <div className="border-b-2 border-dashed border-emerald-300 pb-3 mb-3">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[9px] bg-emerald-600 text-white font-extrabold uppercase px-2 py-0.5 rounded-sm tracking-widest text-[8px]">
                              MEGA SORTEIO BRASIL
                            </span>
                            <h4 className="font-extrabold text-base text-emerald-950 mt-1 leading-tight tracking-tight">
                              {ticketModalConfig.campaign.title}
                            </h4>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold tracking-wider">COTAS ADQUIRIDAS</span>
                            <span className="font-mono text-xs font-bold text-slate-500 block">
                              Total de {ticketModalConfig.tickets.length} cotas
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Visual list of all purchased quotas */}
                      <div className="mb-4">
                        <span className="text-[9px] text-emerald-800 font-bold block uppercase tracking-wider mb-1.5 text-center sm:text-left">
                          🎟️ Suas Dezenas Oficiais Confirmadas
                        </span>
                        <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                          {purchasedNumbers.map((num) => (
                            <span
                              key={num}
                              className="font-mono text-[13px] font-black bg-black text-white border border-neutral-900 px-2.5 py-0.5 rounded-md shadow-md shrink-0 animate-pulse"
                            >
                              #{num}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Ticket metadata in columns (thermal printer receipts style) */}
                      <div className="space-y-1.5 text-[10px] border-b border-dashed border-emerald-200 pb-3 mb-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-emerald-900 font-mono">
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">COMPRADOR INTEGRAL</span>
                            <span className="font-sans font-extrabold truncate block text-emerald-950 text-xs">{userProfile.name}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">DOCUMENTO / CPF</span>
                            <span className="block truncate text-xs font-bold">{userProfile.cpf || "Tratado"}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">WHATSAPP / CONTATO</span>
                            <span className="block text-xs">{userProfile.phone || "Informado"}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">CHAVE DO LOTE</span>
                            <span className="block text-xs text-slate-650 font-bold break-all select-all">{combinedAuth}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Footer block - Barcode layout and certification */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-600">
                        <div className="text-[8px] font-mono text-slate-500 space-y-0.5 text-center sm:text-left">
                          <div>DATA RESERVADA: {ticketModalConfig.tickets[0]?.reservedAt ? new Date(ticketModalConfig.tickets[0].reservedAt).toLocaleString("pt-BR") : "N/A"}</div>
                          <div>DATA HOMOLOGAÇÃO: {ticketModalConfig.tickets[0]?.confirmedAt ? new Date(ticketModalConfig.tickets[0].confirmedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}</div>
                        </div>

                        {/* Barcode representation */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="font-mono text-xs leading-none font-bold text-slate-900 tracking-tighter opacity-80 mb-0.5">
                            |||| ||| ||||| || |||| ||| |||||
                          </div>
                          <span className="text-[7px] text-emerald-700 font-mono tracking-widest font-extrabold uppercase">
                            LOTE-CONSOLIDADO-PAGO
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer with actions */}
            <div className="bg-slate-950 border-t border-slate-800 p-4 md:p-5 flex flex-col sm:flex-row gap-3 justify-between items-center">
              <span className="text-[10px] text-slate-500 text-center sm:text-left max-w-[55%] leading-relaxed">
                🛡️ Transações confirmadas na blockchain interna com auditoria do Pix. Utilize o código validador em caso de premiação física.
              </span>
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const purchasedNumbers = ticketModalConfig.tickets.map((t) => t.number);
                    const itemsText = purchasedNumbers.map((num) => `#${num}`).join(", ");
                    const keyList = ticketModalConfig.tickets.map((t) => `[Cota #${t.number}: ${ticketModalConfig.campaign.id.slice(0, 6).toUpperCase()}-${t.number}-${userProfile.uid.slice(0, 6).toUpperCase()}-APOSTADO]`).join("\n");
                    const txtContent = `
========================================
       COMPROVANTE OFICIAL DE VOLANTE       
       ESTILO VOLANTE DA MEGA-SENA
========================================
CAMPANHA: ${ticketModalConfig.campaign.title.toUpperCase()}
ID DA CAMPANHA: ${ticketModalConfig.campaign.id}

COTAS ADQUIRIDAS EM LOTE: ${itemsText}
TOTAL DE COTAS: ${ticketModalConfig.tickets.length}
STATUS DE PAGAMENTO: APORTADO / PAGO / HOMOLOGADO
DATA CONFIRMAÇÃO: ${ticketModalConfig.tickets[0]?.confirmedAt ? new Date(ticketModalConfig.tickets[0].confirmedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}

----------------------------------------
DADOS DO PARTICIPANTE:
NOME: ${userProfile.name}
E-MAIL: ${userProfile.email}
CPF: ${userProfile.cpf || "Tratado"}
----------------------------------------
CHAVES CRIPTOGRAFICAS DE VALIDAÇÃO:
${keyList}
========================================
Boa Sorte!
Acompanhe os resultados no link de nossa plataforma.
========================================
`;
                    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `volante_consolidado_${ticketModalConfig.campaign.title.replace(/\s+/g, "_").toLowerCase()}.txt`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-705 font-bold text-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Salvar Recibo</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-sm shadow-emerald-600/10"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Volante</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ranking" && (
        <RankingView
          campaigns={campaigns}
          allReservations={allReservations}
          loading={loadingAllReservations}
        />
      )}

      {/* Floating Toast Notification system */}
      <div id="toast-notifications-root" className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          let bgColor = "bg-slate-900 border-slate-800 text-slate-100";
          let iconColor = "text-indigo-400";
          let icon = <Sparkles className="w-4 h-4" />;

          if (toast.type === "success") {
            bgColor = "bg-emerald-950/95 border-emerald-800 text-emerald-100";
            iconColor = "text-emerald-400";
            icon = <Check className="w-4 h-4" />;
          } else if (toast.type === "warning") {
            bgColor = "bg-amber-950/95 border-amber-800 text-amber-100";
            iconColor = "text-amber-400";
            icon = <AlertCircle className="w-4 h-4" />;
          } else if (toast.type === "error") {
            bgColor = "bg-rose-950/95 border-rose-800 text-rose-100";
            iconColor = "text-rose-400";
            icon = <AlertCircle className="w-4 h-4" />;
          } else if (toast.type === "info") {
            bgColor = "bg-slate-900/95 border-slate-800 text-slate-100";
            iconColor = "text-indigo-400";
            icon = <Sparkles className="w-4 h-4" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-xl transition-all duration-300 animate-slideIn ${bgColor}`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-xl bg-black/25 ${iconColor} flex items-center justify-center`}>
                  {icon}
                </div>
                <span className="text-[12px] font-semibold leading-snug">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-white text-[11px] p-1 cursor-pointer transition"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Custom icons to dodge unneeded package imports
function GraduationCapIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={props.className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.26 10.147L12 6.5l7.74 3.647M12 6.5v11.5M4.26 10.147L12 13.5l7.74-3.353m-15.48 0L12 13.5v5.5m7.74-8.853V15.5"
      />
    </svg>
  );
}
