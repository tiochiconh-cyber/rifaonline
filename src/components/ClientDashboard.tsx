import React, { useState, useEffect } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDoc, runTransaction } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Ticket, UserProfile } from "../types";
import { isLotterySalesSuspended, getCampaignDrawProjection, maskWinnerName, splitTicketsIntoBatches } from "../utils/validation";
import RankingView from "./RankingView";
import CelebrationConfetti from "./CelebrationConfetti";
import { Ticket as TicketIcon, Search, Landmark, Copy, Check, Calendar, Trophy, AlertCircle, ShoppingBag, User as UserIcon, LogOut, LogIn, ArrowRight, HelpCircle, Sparkles, ShieldCheck, Download, Printer, ArrowLeft, Clock, Smartphone, X, Crown, Medal, Gift, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AppLogo from "./AppLogo";

export function getDiscountedPrice(
  quantity: number,
  ticketPrice: number,
  discounts?: { minQuantity: number; discountPrice: number; discountPercentage?: number }[],
  isVip?: boolean,
  vipDiscountPct?: number
) {
  let baseCalc = { unitPrice: ticketPrice, totalPrice: ticketPrice * quantity, appliedDiscount: false, discountPercentage: 0 };

  if (discounts && discounts.length > 0) {
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

      baseCalc = {
        unitPrice: finalUnitPrice,
        totalPrice: finalUnitPrice * quantity,
        appliedDiscount: true,
        discountPercentage: finalPct
      };
    }
  }

  if (isVip && vipDiscountPct && vipDiscountPct > 0) {
    if (vipDiscountPct > baseCalc.discountPercentage) {
      const vipUnitPrice = ticketPrice * (1 - vipDiscountPct / 100);
      return {
        unitPrice: vipUnitPrice,
        totalPrice: vipUnitPrice * quantity,
        appliedDiscount: true,
        discountPercentage: vipDiscountPct
      };
    }
  }

  return baseCalc;
}

export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCampaignPlaceholderImage(title: string, id: string): string {
  const normTitle = (title || "").toLowerCase();
  
  // Categorized curated premium visual assets
  if (normTitle.includes("formatura") || normTitle.includes("formand") || normTitle.includes("baile") || normTitle.includes("colação") || normTitle.includes("comissão") || normTitle.includes("diploma")) {
    const grads = [
      "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1525921429571-473f9d0c6471?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % grads.length;
    return grads[index];
  }
  
  if (normTitle.includes("carro") || normTitle.includes("veiculo") || normTitle.includes("moto") || normTitle.includes("bmw") || normTitle.includes("honda") || normTitle.includes("yamaha") || normTitle.includes("auto") || normTitle.includes("rodas")) {
    const vehicles = [
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % vehicles.length;
    return vehicles[index];
  }
  
  if (normTitle.includes("pix") || normTitle.includes("dinheiro") || normTitle.includes("grana") || normTitle.includes("reais") || normTitle.includes("mil") || normTitle.includes("gold") || normTitle.includes("ouro")) {
    const money = [
      "https://images.unsplash.com/photo-1616077168079-7e09a677fb2c?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1563013544-824ae1d704d3?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1502920514313-52581002a659?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % money.length;
    return money[index];
  }

  if (normTitle.includes("iphone") || normTitle.includes("celular") || normTitle.includes("macbook") || normTitle.includes("playstation") || normTitle.includes("ps5") || normTitle.includes("eletronico") || normTitle.includes("fone") || normTitle.includes("tech")) {
    const tech = [
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1565849320607-45e0c52fec3b?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % tech.length;
    return tech[index];
  }

  if (normTitle.includes("festa") || normTitle.includes("balada") || normTitle.includes("churras") || normTitle.includes("cerveja") || normTitle.includes("show") || normTitle.includes("ingresso")) {
    const entertainment = [
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % entertainment.length;
    return entertainment[index];
  }

  if (normTitle.includes("viagem") || normTitle.includes("resort") || normTitle.includes("praia") || normTitle.includes("passagem") || normTitle.includes("hotel") || normTitle.includes("ferias")) {
    const travel = [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop"
    ];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % travel.length;
    return travel[index];
  }

  // Fallbacks: beautiful general raffle celebration items
  const fallbacks = [
    "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=600&auto=format&fit=crop"
  ];
  const itemIndex = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % fallbacks.length;
  return fallbacks[itemIndex];
}

export function CampaignCountdown({ campaign, tickets }: { campaign: Campaign; tickets: Ticket[] }) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isFinished: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isFinished: false });

  useEffect(() => {
    let targetDate: Date;

    if (campaign.drawDate) {
      const dateParts = campaign.drawDate.split("-");
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1;
      const day = parseInt(dateParts[2]);

      let hour = 19;
      let minute = 0;
      if (campaign.drawHour) {
        const hourParts = campaign.drawHour.split(":");
        hour = parseInt(hourParts[0]) || 19;
        minute = parseInt(hourParts[1]) || 0;
      }
      
      // Target in Brasilia Time (UTC-3)
      targetDate = new Date(Date.UTC(year, month, day, hour + 3, minute));
    } else {
      const projection = getCampaignDrawProjection(campaign, tickets);
      targetDate = projection.probableDrawDateBr; 
    }

    const calculateTimeLeft = () => {
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isFinished: true });
        return;
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diffMs / 1000 / 60) % 60);
      const seconds = Math.floor((diffMs / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isFinished: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [campaign, tickets]);

  if (timeLeft.isFinished) {
    return (
      <div className="flex items-center justify-center gap-1 px-2.5 py-1 bg-amber-500 text-white rounded-lg md:rounded-xl text-[9px] md:text-xs font-black uppercase tracking-wider shadow-sm animate-pulse">
        <Clock className="w-3 h-3 text-white shrink-0" />
        <span>Sorteio Hoje!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2 md:px-2.5 py-1 md:py-1.5 bg-slate-900/80 backdrop-blur-md rounded-xl md:rounded-2xl border border-white/10 shadow-lg text-white font-mono select-none w-full max-w-[240px]">
      <div className="flex items-center gap-1 shrink-0">
        <Clock className="w-2.5 h-2.5 md:w-3 md:h-3 text-rose-400 animate-pulse shrink-0" />
        <span className="text-[7.5px] md:text-[9.5px] uppercase font-bold text-slate-300 tracking-wider">Restam:</span>
      </div>
      <div className="flex items-center gap-0.5 text-[9px] md:text-[11px] font-black">
        {timeLeft.days > 0 && (
          <>
            <span className="text-amber-400">{timeLeft.days}</span>
            <span className="text-[7.5px] md:text-[9px] font-bold text-slate-400 mr-0.5">d</span>
          </>
        )}
        <span>{String(timeLeft.hours).padStart(2, "0")}</span>
        <span className="text-[7.5px] md:text-[9px] font-bold text-slate-400 mr-0.5">h</span>
        <span>{String(timeLeft.minutes).padStart(2, "0")}</span>
        <span className="text-[7.5px] md:text-[9px] font-bold text-slate-400 mr-0.5">m</span>
        <span className="text-rose-400">{String(timeLeft.seconds).padStart(2, "0")}</span>
        <span className="text-[7.5px] md:text-[9px] font-bold text-rose-450">s</span>
      </div>
    </div>
  );
}

interface WinnerHighlightProps {
  campaigns: Campaign[];
  allReservations: { [campaignId: string]: Ticket[] };
  userProfile: any;
  onSelectCampaign: (camp: Campaign) => void;
  selectedCampaignId?: string;
  maskWinnerName: (name: string) => string;
}

export function WinnerHighlight({
  campaigns,
  allReservations,
  userProfile,
  onSelectCampaign,
  selectedCampaignId,
  maskWinnerName,
}: WinnerHighlightProps) {
  // Find all drawn campaigns with a validated, confirmed winning ticket
  const validatedWinners = campaigns
    .filter((camp) => camp.status === "drawn" && camp.winningNumber)
    .map((camp) => {
      const campTickets = allReservations[camp.id] || [];
      const winnerTicket = campTickets.find(
        (t) => t.number === camp.winningNumber && t.status === "confirmed"
      );
      return {
        campaign: camp,
        winnerTicket,
      };
    })
    .filter((item) => item.winnerTicket !== undefined) as {
      campaign: Campaign;
      winnerTicket: Ticket;
    }[];

  if (validatedWinners.length === 0) return null;

  // Showcase the latest finalized campaign with validated winner
  const latestWinner = validatedWinners[0];
  const { campaign, winnerTicket } = latestWinner;

  const displayName = userProfile?.role === "admin"
    ? winnerTicket.buyerName
    : maskWinnerName(winnerTicket.buyerName || "");

  const displayCpf = winnerTicket.buyerCpf
    ? (userProfile?.role === "admin"
        ? winnerTicket.buyerCpf
        : `${winnerTicket.buyerCpf.slice(0, 3)}.***.***-**`)
    : "CPF Validado";

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-amber-500/30 rounded-3xl p-5 md:p-6 shadow-xl mb-6">
      {/* Glow decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header featuring ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg animate-pulse">
            <Crown className="w-5 h-5 font-black" />
          </div>
          <div>
            <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-400 font-sans">Ganhador em Destaque</h4>
            <p className="text-[10px] text-slate-400 leading-none">Resultado 100% validado no sistema 🛡️</p>
          </div>
        </div>
      </div>

      {/* Main card grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Campaign thumbnail */}
        <div className="md:col-span-3 flex justify-center md:justify-start">
          <div className="relative aspect-square w-24 md:w-full max-w-[120px] rounded-2xl overflow-hidden border border-white/10 bg-slate-800 shrink-0">
            <img
              src={campaign.imageUrl || getCampaignPlaceholderImage(campaign.title, campaign.id)}
              alt={campaign.title}
              className="w-full h-full object-cover grayscale brightness-90 animate-fadeIn"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent flex items-end justify-center p-1.5">
              <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wider font-mono">Encerrada</span>
            </div>
          </div>
        </div>

        {/* Award details */}
        <div className="md:col-span-6 space-y-2 text-center md:text-left">
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold text-slate-450 uppercase tracking-widest">Ação Premiada</span>
            <h3 className="text-sm md:text-base font-black text-white/95 leading-snug line-clamp-1">{campaign.title}</h3>
          </div>

          <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 text-xs">
            <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 font-black px-3 py-1.5 rounded-xl flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Nº Contemplado: <strong className="font-mono text-sm tracking-widest">{campaign.winningNumber}</strong></span>
            </div>
            
            <div className="text-[11px] text-slate-400 font-medium">
              Sorteio: {campaign.drawDate ? (campaign.drawDate.includes("-") ? campaign.drawDate.split("-").reverse().join("/") : campaign.drawDate) : "Oficial"}
            </div>
          </div>
        </div>

        {/* Winner display panel */}
        <div className="md:col-span-3 flex flex-col justify-center items-center md:items-end w-full">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center md:text-right w-full max-w-[260px] relative overflow-hidden shadow-inner">
            <span className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider">Nome do Ganhador</span>
            <div className="text-base font-black text-amber-300 tracking-tight mt-0.5 truncate uppercase">
              {displayName}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 font-bold">
              CPF: {displayCpf}
            </div>
            
            {/* Background trophy seal */}
            <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 pointer-events-none select-none">
              <Trophy className="w-16 h-16 text-white" />
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => onSelectCampaign(campaign)}
            className="mt-3 text-amber-400 hover:text-amber-300 text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-all hover:gap-1.5 group cursor-pointer"
          >
            <span>Ver Detalhes da Ação</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ClientDashboardProps {
  userProfile: UserProfile | null;
  onLogout: () => void;
  onPromptLogin?: () => void;
}

const UpcomingCampaignCountdown = ({ campaign, onTimeReached }: { campaign: Campaign; onTimeReached?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!campaign.startDate) return;
    const startStr = campaign.startTime ? `${campaign.startDate}T${campaign.startTime}` : `${campaign.startDate}T00:00:00`;
    const targetMs = Date.parse(startStr);
    if (isNaN(targetMs)) return;

    const calcTime = () => {
      const now = Date.now();
      const diff = targetMs - now;
      if (diff <= 0) {
        setTimeLeft(null);
        if (onTimeReached) onTimeReached();
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calcTime();
    const interval = setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, [campaign, onTimeReached]);

  if (!timeLeft) {
    return (
      <span className="text-emerald-600 font-extrabold text-xs animate-pulse bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
        🚀 Lançamento em andamento! Atualize a página.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-sm font-black text-rose-500 font-mono select-none animate-fadeIn">
      <div className="flex flex-col items-center bg-indigo-950/80 border border-indigo-900/40 text-indigo-100 rounded-2xl px-3 py-2 min-w-[50px] shadow-sm">
        <span className="text-xl md:text-2xl font-black text-indigo-300">{String(timeLeft.days).padStart(2, "0")}</span>
        <span className="text-[8px] font-sans font-extrabold uppercase text-indigo-400 tracking-wider">Dias</span>
      </div>
      <span className="text-indigo-400 font-sans text-xl">:</span>
      <div className="flex flex-col items-center bg-indigo-950/80 border border-indigo-900/40 text-indigo-100 rounded-2xl px-3 py-2 min-w-[50px] shadow-sm">
        <span className="text-xl md:text-2xl font-black text-indigo-300">{String(timeLeft.hours).padStart(2, "0")}</span>
        <span className="text-[8px] font-sans font-extrabold uppercase text-indigo-400 tracking-wider">Horas</span>
      </div>
      <span className="text-indigo-400 font-sans text-xl">:</span>
      <div className="flex flex-col items-center bg-indigo-950/80 border border-indigo-900/40 text-indigo-100 rounded-2xl px-3 py-2 min-w-[50px] shadow-sm">
        <span className="text-xl md:text-2xl font-black text-indigo-300">{String(timeLeft.minutes).padStart(2, "0")}</span>
        <span className="text-[8px] font-sans font-extrabold uppercase text-indigo-400 tracking-wider">Minutos</span>
      </div>
      <span className="text-indigo-400 font-sans text-xl">:</span>
      <div className="flex flex-col items-center bg-rose-950/85 border border-rose-900/40 text-rose-100 rounded-2xl px-3 py-2 min-w-[50px] shadow-sm animate-pulse">
        <span className="text-xl md:text-2xl font-black text-rose-350">{String(timeLeft.seconds).padStart(2, "0")}</span>
        <span className="text-[8px] font-sans font-extrabold uppercase text-rose-450 tracking-wider">Segundos</span>
      </div>
    </div>
  );
};

interface EmptyReservationsStateProps {
  onExploreClick?: () => void;
  compact?: boolean;
}

const EmptyReservationsState: React.FC<EmptyReservationsStateProps> = ({ onExploreClick, compact = false }) => {
  if (compact) {
    return (
      <div id="empty-res-compact" className="text-center p-6 bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-3.5 select-none animate-fadeIn">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100/50 shadow-3xs relative">
          <TicketIcon className="w-6 h-6 text-indigo-600" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-450 animate-ping" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h4 className="text-slate-800 font-extrabold text-[12px] uppercase tracking-wider">Nenhuma reserva ativa</h4>
          <p className="text-slate-500 text-[10.5px] leading-relaxed">
            Você ainda não garantiu suas cotas na campanha atual. Escolha uma rifa e tente a sorte!
          </p>
        </div>
        {onExploreClick && (
          <button
            type="button"
            onClick={onExploreClick}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg transition-all duration-200 cursor-pointer shadow-sm shadow-indigo-600/15 uppercase tracking-wider flex items-center gap-1 active:scale-95"
          >
            <span>Ver Campanhas 🍀</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="empty-res-full" className="text-center p-10 md:p-14 bg-gradient-to-b from-white to-slate-50/40 border border-slate-150 rounded-3xl flex flex-col items-center justify-center space-y-5 shadow-2xs select-none animate-fadeIn max-w-2xl mx-auto">
      {/* Visual illustration of tickets floating */}
      <div className="relative group">
        <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all duration-300 pointer-events-none" />
        <div className="p-5 bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-600 rounded-3xl border border-indigo-200/40 shadow-xs relative z-10 flex items-center justify-center">
          <ShoppingBag className="w-9 h-9 text-indigo-650 animate-bounce" />
          <div className="absolute -top-1.5 -right-1.5 p-1 bg-amber-100 text-amber-600 rounded-lg border border-amber-200/50 shadow-3xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-slate-800 font-black text-sm sm:text-base tracking-tight leading-snug">
          O seu Painel de Compras está vazio 🛍️
        </h3>
        <p className="text-slate-500 text-xs leading-relaxed max-w-xs sm:max-w-sm mx-auto">
          Você não possui nenhuma cota reservada ou pagamento confirmado neste momento. Apoie a nossa comissão de formatura e concorra a prêmios incríveis!
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 items-center w-full max-w-xs justify-center pt-2">
        {onExploreClick && (
          <button
            type="button"
            onClick={onExploreClick}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition duration-200 cursor-pointer shadow-md shadow-indigo-600/10 tracking-wide flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-350" />
            <span>Explorar Campanhas Ativas</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default function ClientDashboard({ userProfile, onLogout, onPromptLogin }: ClientDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  const isCampaignUpcoming = (camp: Campaign): boolean => {
    if (camp.status === "drawn") return false;
    if (camp.status === "paused") return true;
    if (camp.status === "active" && camp.startDate) {
      const startStr = camp.startTime ? `${camp.startDate}T${camp.startTime}` : `${camp.startDate}T00:00:00`;
      try {
        const startMs = Date.parse(startStr);
        if (!isNaN(startMs)) {
          let targetMs = startMs;
          if (userProfile?.isVip) {
            const advanceHours = settings?.vipAdvanceHours || 24;
            targetMs = startMs - (advanceHours * 60 * 60 * 1000);
          }
          return Date.now() < targetMs;
        }
      } catch (err) {
        console.error("Error parsing campaign launch time:", err);
      }
    }
    return false;
  };
  
  const isCurrentlyInVipEarlyAccess = (camp: Campaign): boolean => {
    if (camp.status !== "active" || !camp.startDate) return false;
    const startStr = camp.startTime ? `${camp.startDate}T${camp.startTime}` : `${camp.startDate}T00:00:00`;
    try {
      const startMs = Date.parse(startStr);
      if (!isNaN(startMs)) {
        const now = Date.now();
        if (now < startMs) {
          const advanceHours = settings?.vipAdvanceHours || 24;
          const vipStartMs = startMs - (advanceHours * 60 * 60 * 1000);
          return now >= vipStartMs;
        }
      }
    } catch (_) {}
    return false;
  };

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
  const [activeTab, setActiveTab] = useState<"rifas" | "compras" | "ranking" | "ganhadores">("rifas");
  const [campaignShowingTab, setCampaignShowingTab] = useState<"active" | "drawn" | "paused">("active");

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
  const [mobileColumns, setMobileColumns] = useState<number>(5);
  const [customQuantity, setCustomQuantity] = useState<number>(10);

  // LGPD Privacy hooks
  const [showLgpdModal, setShowLgpdModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Derived state for the selected campaign sold out status
  const selectedCampaignTickets = selectedCampaign ? (allReservations[selectedCampaign.id] || []) : [];
  const selectedCampaignRestantes = selectedCampaign ? Math.max(0, selectedCampaign.totalTickets - selectedCampaignTickets.length) : 0;
  const selectedCampaignIsSoldOut = selectedCampaign ? (selectedCampaignRestantes === 0) : false;

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
            const isMe = buyer.uid === userProfile?.uid;
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
    if (!userProfile) return;
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
    if (!userProfile) return;
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

  // Load all campaigns (optimized with stable empty dependencies snapshot listener)
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
      },
      (error) => {
        console.error("Error watching campaigns:", error);
        setLoadingCampaigns(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Separate effect to handle selectedCampaign auto-selection and dynamic updates
  useEffect(() => {
    if (campaigns.length > 0) {
      setSelectedCampaign((prev) => {
        if (!prev) {
          const active = campaigns.find(c => c.status === "active") || campaigns[0];
          return active;
        }
        // Keep selected campaign details in sync with the live list database updates
        const updated = campaigns.find(c => c.id === prev.id);
        return updated || prev;
      });
    }
  }, [campaigns]);

  // Handle Mercado Pago callback URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp_status");
    const batchId = params.get("batchId");
    
    if (mpStatus) {
      if (mpStatus === "approved") {
        addToast("🎉 Parabéns! Seu pagamento via Mercado Pago foi aprovado e suas cotas foram homologadas automaticamente!", "success");
        setActiveTab("compras");
      } else if (mpStatus === "pending") {
        addToast("⌛ Seu pagamento via Mercado Pago está em processamento. Suas cotas continuarão garantidas até a confirmação.", "info");
        setActiveTab("compras");
      } else if (mpStatus === "rejected") {
        addToast("❌ O pagamento via Mercado Pago não foi concluído ou foi recusado. Por favor, tente novamente ou fale com o suporte.", "error");
        setActiveTab("compras");
      }
      // Clean query parameters from URL gracefully without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Load tickets for selected campaign (only updates when actual selectedCampaign identity changes)
  const selectedCampaignId = selectedCampaign?.id || "";
  useEffect(() => {
    if (!selectedCampaignId) {
      setTickets({});
      return;
    }

    setLoadingTickets(true);
    const ticketsCollectionRef = collection(db, "campaigns", selectedCampaignId, "tickets");

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
  }, [selectedCampaignId]);



  // Real-time automatic deselect to prevent duplicate in-flight selection between concurrent users
  useEffect(() => {
    if (selectedNumbers.length === 0 || !tickets) return;

    const occupiedSelected = selectedNumbers.filter((numStr) => {
      const ticketInfo = tickets[numStr];
      return ticketInfo && ticketInfo.status !== "available" && ticketInfo.buyerUid !== userProfile?.uid;
    });

    if (occupiedSelected.length > 0) {
      setSelectedNumbers((prev) => prev.filter((n) => !occupiedSelected.includes(n)));
      const count = occupiedSelected.length;
      if (count === 1) {
        addToast(`A cota #${occupiedSelected[0]} foi reservada por outro usuário e removida da sua seleção.`, "warning");
      } else {
        addToast(`${count} cotas foram reservadas por outro usuário e removidas da sua seleção.`, "warning");
      }
    }
  }, [tickets, userProfile?.uid, selectedNumbers]);

  const [winningConfettiKey, setWinningConfettiKey] = useState(0);

  // Identify if any user-owned ticket matches the drawn results of any campaign
  const winningSessions = React.useMemo(() => {
    const list: { campaign: Campaign; ticket: Ticket }[] = [];
    campaigns.forEach((camp) => {
      const winNo = camp.winningNumber;
      if (!winNo) return;
      const userTickets = myTickets[camp.id] || [];
      const winningTicket = userTickets.find((t) => t.number === winNo && t.status === "confirmed");
      if (winningTicket) {
        list.push({ campaign: camp, ticket: winningTicket });
      }
    });
    return list;
  }, [campaigns, myTickets]);

  // Serialized campaign IDs string to stabilize query re-registrations
  const campaignIds = campaigns.map((c) => c.id).join(",");

  // Listen to active user's tickets across all registered campaigns (optimized via campaignIds dependency)
  useEffect(() => {
    if (!userProfile?.uid || !campaignIds) return;

    const idsList = campaignIds.split(",").filter(Boolean);
    const unsubscribes = idsList.map((id) => {
      const ticketsRef = collection(db, "campaigns", id, "tickets");
      const userTicketsQuery = query(ticketsRef, where("buyerUid", "==", userProfile.uid));

      return onSnapshot(userTicketsQuery, (snapshot) => {
        const userTicketList: Ticket[] = [];
        snapshot.forEach((docSnap) => {
          userTicketList.push(docSnap.data() as Ticket);
        });
        setMyTickets((prev) => ({
          ...prev,
          [id]: userTicketList,
        }));
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [userProfile?.uid, campaignIds]);

  // Listen to tickets across all campaigns for real-time buyer rankings (optimized via campaignIds dependency)
  useEffect(() => {
    if (!campaignIds) {
      setLoadingAllReservations(false);
      return;
    }

    setLoadingAllReservations(true);
    const idsList = campaignIds.split(",").filter(Boolean);
    const totalCampaigns = idsList.length;
    let loadedCount = 0;

    const unsubscribes = idsList.map((id) => {
      const ref = collection(db, "campaigns", id, "tickets");
      return onSnapshot(
        ref,
        (snapshot) => {
          const ticketList: Ticket[] = [];
          snapshot.forEach((d) => {
            ticketList.push(d.data() as Ticket);
          });

          setAllReservations((prev) => ({
            ...prev,
            [id]: ticketList,
          }));

          loadedCount++;
          if (loadedCount >= totalCampaigns) {
            setLoadingAllReservations(false);
          }
        },
        (error) => {
          console.error(`Error loading ranking tickets for ${id}:`, error);
          loadedCount++;
          if (loadedCount >= totalCampaigns) {
            setLoadingAllReservations(false);
          }
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [campaignIds]);

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
    vipAdvanceHours: 24,
    vipDiscountPercentage: 10,
    vipWhatsAppUrl: "",
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        setSettings(d.data() as any);
      }
    });
    return () => unsub();
  }, []);

  // Exclusive checkout / payment overlay for selected reservation on mobile
  const [exclusiveMobilePayment, setExclusiveMobilePayment] = useState<{ campaign: Campaign; tickets: Ticket[] } | null>(null);
  const [paymentCountdown, setPaymentCountdown] = useState<string>("02:00:00");
  const [mpLoadingBatchId, setMpLoadingBatchId] = useState<string | null>(null);

  const handlePayWithMercadoPago = async (campaign: Campaign, ticketsList: Ticket[], batchId: string) => {
    if (!batchId) {
      addToast("Erro: Identificador do lote de reservas não encontrado.", "error");
      return;
    }
    setMpLoadingBatchId(batchId);
    try {
      const calc = getDiscountedPrice(ticketsList.length, campaign.ticketPrice, campaign.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
      const totalPrice = calc.totalPrice;
      const itemPrice = totalPrice / ticketsList.length;

      const response = await fetch("/api/payment/create-preference", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          batchId: batchId,
          title: campaign.title,
          unitPrice: itemPrice,
          quantity: ticketsList.length,
          userName: userProfile?.name,
          userEmail: userProfile?.email,
          userPhone: userProfile?.phone
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erro de rede / servidor" }));
        throw new Error(err.error || "Erro ao conectar com a API de pagamento.");
      }

      const data = await response.json();
      if (data.init_point) {
        addToast("Redirecionando para o Mercado Pago Checkout Seguro...", "success");
        // Open the preference link in a new container tab
        window.open(data.init_point, "_blank");
      } else {
        throw new Error("Link do checkout não recebido do servidor Mercado Pago.");
      }
    } catch (error: any) {
      console.error("Erro Mercado Pago Checkout Client:", error);
      addToast(error.message || "Erro para faturar reserva online no Mercado Pago.", "error");
    } finally {
      setMpLoadingBatchId(null);
    }
  };

  useEffect(() => {
    if (!exclusiveMobilePayment) return;
    const list = exclusiveMobilePayment.tickets;
    const reservedAtTime = list[0]?.reservedAt ? new Date(list[0].reservedAt).getTime() : Date.now();
    const expHours = settings.expirationHours || 24;
    const expirationTime = reservedAtTime + expHours * 60 * 60 * 1000;

    const updateTimer = () => {
      const now = Date.now();
      const diff = expirationTime - now;
      if (diff <= 0) {
        setPaymentCountdown("Tempo Esgotado ❌");
        return;
      }
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setPaymentCountdown(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [exclusiveMobilePayment, settings.expirationHours]);

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
      const calc = getDiscountedPrice(targetTickets.length, camp.ticketPrice, camp.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
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
          const calc = getDiscountedPrice(tickets.length, campaign.ticketPrice, campaign.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
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
    
    if (!userProfile) {
      addToast("Falta pouco! Por favor, entre ou cadastre-se para confirmar a sua reserva e garantir seus números! 😉", "info");
      onPromptLogin?.();
      return;
    }
    
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

        const nowBatchId = `batch_${Date.now()}`;
        const nowIso = new Date().toISOString();

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
            reservedAt: nowIso,
            batchId: nowBatchId,
          };
          transaction.set(t.ticketRef, ticketData);
        });
      });

      const reservedCopy = [...selectedNumbers];
      setSuccessReserved(reservedCopy);

      const nowBatchId = `batch_${Date.now()}`;
      const nowIso = new Date().toISOString();

      const newlyReservedTickets: Ticket[] = reservedCopy.map(num => ({
        id: num,
        number: num,
        status: "reserved",
        buyerUid: userProfile.uid,
        buyerName: userProfile.name,
        buyerPhone: userProfile.phone || "",
        buyerCpf: userProfile.cpf,
        buyerEmail: userProfile.email,
        reservedAt: nowIso,
        batchId: nowBatchId
      }));
      setExclusiveMobilePayment({ campaign: selectedCampaign, tickets: newlyReservedTickets });

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

    // Prevention of duplicate selection: check if this cota was recently booked in memory state
    const tInfo = tickets[numberStr];
    if (tInfo && tInfo.status !== "available" && tInfo.buyerUid !== userProfile?.uid) {
      addToast(`A cota #${numberStr} acabou de ser reservada por outro participante!`, "error");
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
    const isExpress = selectedCampaign?.drawMode === "express";
    const actualNum = isExpress ? num + 1 : num;
    const padLength = limit > 1000 ? 4 : limit > 100 ? 3 : 2;
    return actualNum.toString().padStart(padLength, "0");
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
      if (!tickets[numStr] || tickets[numStr].status === "available") {
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
    const padLength = total > 1000 ? 4 : total > 100 ? 3 : 2;

    const indices: number[] = [];
    const cleanSearch = ticketSearch.trim();
    const hasSearch = !!cleanSearch;
    const hasSelectedNumbers = selectedNumbers.length > 0;

    for (let idx = 0; idx < total; idx++) {
      const numStr = padNumber(idx, total);

      // Filter by status gridFilter criteria
      if (gridFilter === "available") {
        if (tickets[numStr]) continue;
      } else if (gridFilter === "mine") {
        if (tickets[numStr]?.buyerUid !== userProfile?.uid) continue;
      } else if (gridFilter === "selected") {
        if (!hasSelectedNumbers || !selectedNumbers.includes(numStr)) continue;
      }

      // Filter by search criteria
      if (hasSearch && !numStr.includes(cleanSearch)) {
        continue;
      }

      indices.push(idx);
    }

    return indices;
  }, [selectedCampaign, ticketSearch, gridFilter, tickets, selectedNumbers, userProfile?.uid]);

  const paginatedIndices = React.useMemo(() => {
    const start = ticketPage * TICKETS_PER_PAGE;
    return filteredIndices.slice(start, start + TICKETS_PER_PAGE);
  }, [filteredIndices, ticketPage, TICKETS_PER_PAGE]);

  const totalPages = Math.ceil(filteredIndices.length / TICKETS_PER_PAGE);

  // Helper calculating total reserved and confirmed count
  const myTotalTicketsCount = Object.values(myTickets).flat().length;

  return (
    <div className="space-y-6 md:space-y-8 pb-16 pt-safe">
      {/* EXCLUSIVE MOBILE PAYMENT OVERLAY */}
      {exclusiveMobilePayment && (() => {
        const { campaign: camp, tickets: list } = exclusiveMobilePayment;
        const calc = getDiscountedPrice(list.length, camp.ticketPrice, camp.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[99999] overflow-y-auto font-sans flex items-center justify-center p-2 sm:p-4 select-text animate-fadeIn">
            {/* Modal Dialog container mimicking the screenshot */}
            <div className="relative w-full max-w-4xl bg-white border border-slate-200 text-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-fadeIn">
              
              {/* Header block with title and total price */}
              <div className="bg-slate-50 border-b border-slate-200/80 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 relative">
                <button
                  onClick={() => {
                    setExclusiveMobilePayment(null);
                    setSuccessReserved(null);
                  }}
                  className="absolute top-4 sm:top-5 right-4 sm:right-5 p-1 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 pr-8 select-none">
                  <Landmark className="w-5 h-5 text-indigo-600 animate-bounce" />
                  <span className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">🏦 DADOS DE PAGAMENTO VIA PIX</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 select-text pr-8 sm:pr-0">
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-slate-500 block leading-none mb-1">Total a Transferir:</span>
                    <span className="text-lg sm:text-xl font-black text-emerald-650 font-mono leading-none">
                      R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="bg-amber-400/10 border border-amber-300/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                    <div className="leading-none">
                      <span className="text-[7.5px] text-amber-800 font-extrabold uppercase tracking-widest block mb-0.5">Expira em</span>
                      <span className="text-xs font-mono font-black text-amber-900 leading-none">{paymentCountdown}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Content (Responsive 2 Columns) */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column (PIX Copy options and recipient details) */}
                  <div className="md:col-span-7 space-y-4">
                    
                    {list.length >= 10 && settings?.vipWhatsAppUrl && (
                      <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-emerald-600/15 border border-amber-300/30 p-4.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="bg-amber-500 text-slate-950 p-2 rounded-xl shadow-md shrink-0">
                            <Crown className="w-5 h-5 fill-slate-900 text-slate-950" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1">
                              Grupo VIP Liberado! 👑
                            </h4>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Por comprar {list.length} cotas de uma vez, você tem acesso ao nosso grupo exclusivo do WhatsApp!
                            </p>
                          </div>
                        </div>
                        <a
                          href={settings.vipWhatsAppUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 whitespace-nowrap active:scale-95 cursor-pointer uppercase tracking-wider"
                        >
                          Entrar no Grupo 🟢
                        </a>
                      </div>
                    )}

                    {/* Option 1: Copy Key */}
                    <div className="bg-emerald-500/5 border border-emerald-500/15 p-5 rounded-2xl space-y-3.5 relative overflow-hidden shadow-xs">
                      <span className="absolute top-3 right-3 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>

                      <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-widest block leading-none">
                        🚀 Opção 1: Copiar Chave (Pix Copia e Cola)
                      </span>

                      <div className="space-y-3">
                        <div className="bg-slate-950 border-2 border-amber-400 p-4 rounded-xl text-center select-all shrink-0 transition-all shadow-md relative overflow-hidden group">
                          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 opacity-40 pointer-events-none" />
                          <div className="relative z-10 flex flex-col items-center justify-center space-y-1">
                            <span className="text-[8px] text-amber-400 font-black tracking-widest uppercase mb-0.5">
                              ⚡ COPIE ESTA CHAVE EXATA ⚡
                            </span>
                            <span className="font-mono font-black text-sm sm:text-base text-yellow-300 break-all block leading-tight tracking-widest select-all">
                              {settings.pixKey}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleCopyPix}
                          className={`w-full py-4 px-6 rounded-2xl font-black cursor-pointer transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md border-2 uppercase tracking-wider relative overflow-hidden group/btn ${
                            copiedPix 
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-700 text-white border-emerald-400 shadow-emerald-500/25 scale-[1.02]" 
                              : "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-600 hover:via-yellow-500 hover:to-amber-700 text-slate-950 border-yellow-300 shadow-amber-500/30 hover:scale-[1.02]"
                          }`}
                        >
                          {copiedPix ? (
                            <div className="flex items-center gap-2">
                              <Check className="w-5 h-5 text-white stroke-[3px] animate-bounce" />
                              <span>CHAVE PIX COPIADA! ✓</span>
                            </div>
                          ) : (
                            <>
                              <Copy className="w-5 h-5 text-slate-900 stroke-[3px] transition-transform duration-300 group-hover/btn:scale-110" />
                              <span>CLIQUE PARA COPIAR A CHAVE PIX 📋</span>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-normal font-medium text-center">
                        Toque no botão acima para copiar. Abra o app do seu banco, escolha <strong>Pix Copia e Cola</strong> (or chave de transferência) e cole o código.
                      </p>
                    </div>

                    {/* Option 2: Mercado Pago Online Credit Card / Pix Integration */}
                    <div className="bg-indigo-500/5 border border-indigo-500/15 p-5 rounded-2xl space-y-3.5 relative overflow-hidden shadow-xs">
                      <span className="absolute top-3 right-3 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>

                      <span className="text-[10px] text-indigo-800 font-extrabold uppercase tracking-widest block leading-none">
                        ⚡ Opção 2: Pagar Online via Mercado Pago Pro (Aprovação Automática)
                      </span>

                      <p className="text-[10.5px] text-slate-500 leading-normal font-medium">
                        Aprovado Instantaneamente! Pague no Pix Automatizado, Cartão de Crédito em até 12x, Saldo do Mercado Pago ou Boleto Bancário com toda a segurança garantida.
                      </p>

                      <button
                        type="button"
                        onClick={() => handlePayWithMercadoPago(camp, list, list[0]?.batchId || "")}
                        disabled={mpLoadingBatchId === (list[0]?.batchId || "")}
                        className="w-full py-4 px-6 rounded-2xl bg-indigo-650 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold transition-all duration-200 flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md shadow-indigo-600/15 border border-indigo-500/20 uppercase tracking-wider relative overflow-hidden group/mp cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed"
                      >
                        {mpLoadingBatchId === (list[0]?.batchId || "") ? (
                          <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CreditCard className="w-5 h-5 text-indigo-200 stroke-[2px]" />
                            <span>Pagar Online via Mercado Pago ✨</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Recipient breakdown details */}
                    <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl space-y-2.5">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Dados do Favorecido</span>
                      <div className="space-y-2">
                        {settings.receiverName && (
                          <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100">
                            <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Favorecido:</span>
                            <span className="font-extrabold text-slate-800 text-xs text-right truncate max-w-[205px] select-all">{settings.receiverName}</span>
                          </div>
                        )}
                        {settings.bankName && (
                          <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100">
                            <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Banco / Instituição:</span>
                            <span className="font-extrabold text-slate-800 text-xs text-right select-all">{settings.bankName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column (Steps and Tickets Reservation information list) */}
                  <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                    {/* Passos importantes steps element mimicking screenshot exactly */}
                    <div className="bg-indigo-950 text-indigo-50 p-5 rounded-2xl space-y-3 border border-indigo-900 shadow-sm grow flex flex-col justify-center">
                      <span className="text-[11px] text-indigo-300 font-black uppercase tracking-wider block">⚠️ PASSOS IMPORTANTES:</span>
                      <ul className="text-[11px] space-y-2.5 leading-relaxed text-indigo-200">
                        <li className="flex items-start gap-1.5">
                          <span className="bg-indigo-800 text-white w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <span>Realize a transferência no valor exato de <strong>R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.</span>
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

                    {/* Compact reserved list visualizer */}
                    <div className="bg-slate-50 border border-slate-200/85 p-3.5 rounded-2xl text-xs space-y-2">
                      <span className="text-[9px] text-slate-450 font-black uppercase tracking-wide block leading-none">Cotas em Processo de Reserva ({list.length})</span>
                      <div className="flex flex-wrap gap-1 p-2 rounded-xl bg-white border border-slate-150 max-h-[70px] overflow-y-auto">
                        {list.map(t => (
                          <span key={t.id} className="font-mono text-xs bg-indigo-50 border border-indigo-100 text-indigo-750 px-1.5 py-0.5 rounded font-extrabold select-all">
                            #{t.number}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Action feet buttons mimicking screenshot exactly */}
              <div className="bg-slate-50 border-t border-slate-150 p-4 sm:px-6 flex flex-col sm:flex-row justify-end gap-3 shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => {
                    handleWhatsAppRedirect(list, camp);
                    setConfettiKey((prev) => prev + 1);
                  }}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/10 border border-emerald-500/20 uppercase tracking-wider active:scale-[0.98]"
                >
                  <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.978L2 22l5.133-1.343a9.894 9.894 0 0 0 4.873 1.344h.004c5.507 0 9.99-4.478 9.99-9.984a9.97 9.97 0 0 0-2.926-7.064A9.923 9.923 0 0 0 12.012 2zm5.794 13.978c-.244.685-1.22 1.258-1.685 1.31-.415.048-.954.072-1.554-.12a14.2 14.2 0 0 1-5.323-3.26c-1.423-1.416-2.5-3.155-2.775-3.626-.275-.471-.03-.725.207-.962.214-.213.473-.553.71-.83.235-.276.314-.471.472-.786.158-.314.079-.588-.04-.844-.118-.256-.944-2.274-1.298-3.125-.347-.831-.699-.718-.959-.731-.248-.013-.016-.284 0-.749.106-1.14.53-.393.424-1.5 1.464-1.5 3.568 0 2.102 1.533 4.133 1.747 4.419.215.285 3.018 4.606 7.311 6.467 1.02.443 1.815.707 2.437.904 1.025.326 1.958.28 2.696.17.822-.123 2.533-1.035 2.89-2.035.356-1 .356-1.857.248-2.035-.108-.178-.396-.285-.84-.508z" />
                  </svg>
                  <span>Confirmar no WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExclusiveMobilePayment(null);
                    setSuccessReserved(null);
                  }}
                  className="px-6 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-300 font-extrabold text-xs sm:text-sm rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center"
                >
                  Concluir e Voltar
                </button>
              </div>

            </div>
          </div>
        );
      })()}


      {/* Redundant header banners removed by user request to keep UI extremely clean */}


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
          <span>Minhas Compras 🛍️</span>
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

        <button
          onClick={() => {
            setActiveTab("ganhadores");
            setSuccessReserved(null);
          }}
          className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === "ganhadores" 
              ? "bg-white text-slate-900 shadow-sm" 
              : "text-slate-500 hover:text-slate-850"
          }`}
        >
          <Crown className="w-4 h-4 text-amber-500" />
          <span>Ganhadores</span>
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
                  <span>Campanhas</span>
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-3 md:p-5 flex flex-col space-y-3.5 w-full select-none"
                  >
                    {/* Thumbnail Skeleton */}
                    <div className="relative aspect-[4/3] sm:aspect-square w-full overflow-hidden bg-slate-100 rounded-xl md:rounded-2xl border border-slate-100/50 shrink-0 mb-1 flex items-center justify-center animate-pulse">
                      {/* Floating Price Tag Skeleton */}
                      <div className="absolute top-1.5 left-1.5 md:top-2.5 md:left-2.5 w-16 md:w-24 h-5 md:h-8 bg-slate-200/80 rounded-lg md:rounded-xl"></div>
                      {/* Floating Status Badge Skeleton */}
                      <div className="absolute top-1.5 right-1.5 md:top-2.5 md:right-2.5 w-12 md:w-16 h-5 md:h-6 bg-slate-200/80 rounded-full"></div>
                      {/* Sub-center icon hint container */}
                      <TicketIcon className="w-8 h-8 text-slate-200" />
                    </div>

                    {/* Countdown Skeleton */}
                    <div className="h-4 bg-slate-100/80 rounded-full w-2/3 mx-auto animate-pulse"></div>

                    {/* Title and Description Skeletons */}
                    <div className="space-y-2 flex-grow mt-1 select-none animate-pulse">
                      <div className="h-4.5 bg-slate-200 rounded-md w-full"></div>
                      <div className="h-3 bg-slate-150 rounded-md w-5/6 hidden md:block"></div>
                      <div className="h-3 bg-slate-150 rounded-md w-1/2 hidden md:block"></div>
                    </div>

                    {/* Compact stats for mobile */}
                    <div className="flex sm:hidden justify-between items-center bg-slate-50 border border-slate-100 rounded-xl px-2 py-2 h-6 animate-pulse w-full"></div>

                    {/* The Trio of Info Boxes Skeletons */}
                    <div className="hidden sm:grid grid-cols-3 gap-1.5 md:gap-2.5 w-full animate-pulse mt-1">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 h-12 flex flex-col gap-1 items-center justify-center">
                        <div className="h-2.5 bg-slate-200 rounded w-8"></div>
                        <div className="h-3 bg-slate-200 rounded w-5"></div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 h-12 flex flex-col gap-1 items-center justify-center">
                        <div className="h-2.5 bg-slate-200 rounded w-8"></div>
                        <div className="h-3 bg-slate-200 rounded w-5"></div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 h-12 flex flex-col gap-1 items-center justify-center">
                        <div className="h-2.5 bg-slate-200 rounded w-8"></div>
                        <div className="h-3 bg-slate-200 rounded w-5"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <TicketIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <h4 className="text-slate-700 font-bold text-sm">Nenhuma rifa cadastrada</h4>
                <p className="text-slate-400 text-xs mt-1">Nenhum prêmio ou rifa ativa no momento.</p>
              </div>
            ) : (() => {
              const liveCampaigns = campaigns.filter(c => c.status === "active" && !isCampaignUpcoming(c));
              const closedCampaigns = campaigns.filter(c => c.status === "drawn");
              const upcomingCampaigns = campaigns.filter(c => c.status === "paused" || isCampaignUpcoming(c));

              return (
                <div className="space-y-6">
                  {/* Visual Filters / Segment Control for Campaigns with Live Counts */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 select-none">
                    <button
                      type="button"
                      onClick={() => setCampaignShowingTab("active")}
                      className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
                        campaignShowingTab === "active"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/15"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                      }`}
                    >
                      <Sparkles className={`w-4 h-4 ${campaignShowingTab === 'active' ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
                      <span>Ativas</span>
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${
                        campaignShowingTab === 'active' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {liveCampaigns.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCampaignShowingTab("drawn")}
                      className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
                        campaignShowingTab === "drawn"
                          ? "bg-amber-500 text-white shadow-md shadow-amber-500/15"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                      }`}
                    >
                      <Trophy className={`w-4 h-4 ${campaignShowingTab === 'drawn' ? 'text-white animate-bounce' : 'text-slate-400'}`} />
                      <span>Finalizadas</span>
                      <span className={`px-1.5 py-0.1 rounded-md text-[10px] font-extrabold ${
                        campaignShowingTab === 'drawn' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {closedCampaigns.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCampaignShowingTab("paused")}
                      className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer ${
                        campaignShowingTab === "paused"
                          ? "bg-slate-800 text-white shadow-md shadow-slate-800/15"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                      }`}
                    >
                      <Calendar className={`w-4 h-4 ${campaignShowingTab === 'paused' ? 'text-cyan-300 animate-pulse' : 'text-slate-400'}`} />
                      <span>Em Breve</span>
                      <span className={`px-1.5 py-0.1 rounded-md text-[10px] font-extrabold ${
                        campaignShowingTab === 'paused' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {upcomingCampaigns.length}
                      </span>
                    </button>
                  </div>

                  {campaignShowingTab === "active" && (
                    <div className="space-y-4 animate-fadeIn">
                      {liveCampaigns.length === 0 ? (
                        <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200/80">
                          <TicketIcon className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
                          <h4 className="text-slate-650 font-bold text-xs">Nenhuma rifa ativa no momento</h4>
                          <p className="text-slate-400 text-[10px] mt-0.5">Em breve teremos novas oportunidades! Fique de olho.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                          {liveCampaigns.map((camp) => {
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
                                className={`group relative flex flex-col text-left bg-white rounded-2xl md:rounded-3xl border overflow-hidden p-3 md:p-5 transition-all duration-300 cursor-pointer w-full ${
                                  isSelected
                                    ? "border-emerald-500 ring-4 ring-emerald-500/15 shadow-lg transform scale-[1.01]"
                                    : "border-slate-200 hover:border-slate-350 hover:shadow-lg hover:-translate-y-0.5"
                                }`}
                              >
                                {/* Thumbnail Image Container ("Foto da Campanha") */}
                                <div className="relative aspect-[4/3] sm:aspect-square w-full overflow-hidden bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100 shrink-0 mb-3">
                                  <img
                                    src={camp.imageUrl || getCampaignPlaceholderImage(camp.title, camp.id)}
                                    alt={camp.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />

                                  {/* Diagonal Sold Out Banner */}
                                  {restantes === 0 && (
                                    <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                                      <div className="bg-gradient-to-r from-red-700 via-rose-500 to-red-700 text-white font-extrabold text-[8px] md:text-xs py-1.5 w-[160%] text-center uppercase tracking-widest rotate-[-25deg] shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-y border-yellow-400 animate-pulse select-none">
                                        ESGOTADO
                                      </div>
                                    </div>
                                  )}

                                  {/* Floating Price Tag ("Valor Cota") */}
                                  <div className="absolute top-1.5 left-1.5 md:top-2.5 md:left-2.5 bg-[#82C943] text-white font-black text-[9px] sm:text-xs md:text-sm px-2 py-0.5 md:px-3.5 md:py-1.5 rounded-lg md:rounded-xl shadow-lg border border-white/10 flex items-center justify-center font-mono">
                                    R$ {camp.ticketPrice.toFixed(2)}
                                  </div>

                                  {/* Floating status badges */}
                                  <div className="absolute top-1.5 right-1.5 md:top-2.5 md:right-2.5 flex items-center gap-1.5 flex-wrap justify-end">
                                    {isCurrentlyInVipEarlyAccess(camp) && (
                                      <span className="bg-amber-500 text-slate-950 px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[9px] font-black rounded-lg flex items-center gap-0.5 border border-amber-300 shadow-md animate-pulse">
                                        <Crown className="w-2.5 h-2.5 fill-slate-900 shrink-0 text-slate-950" />
                                        VIP
                                      </span>
                                    )}
                                    {userTicketsCount > 0 && (
                                      <span className="bg-indigo-600 text-white text-[7px] md:text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md">
                                        {userTicketsCount} Reservado
                                      </span>
                                    )}
                                    <span className="bg-slate-950/75 backdrop-blur-sm text-white px-1.5 py-0.5 md:px-2.5 md:py-1 text-[7px] md:text-[9.5px] font-bold rounded-full flex items-center gap-1 border border-white/10">
                                      <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      {isCurrentlyInVipEarlyAccess(camp) ? "VIP Ativo" : "Ativa"}
                                    </span>
                                  </div>
                                </div>

                                {/* Countdown below the image, above the title */}
                                <div className="mt-2.5 mb-1 flex justify-center w-full">
                                  <CampaignCountdown campaign={camp} tickets={campTickets} />
                                </div>

                                {/* Title and Description */}
                                <div className="space-y-1 mb-2 flex-1 flex flex-col justify-start">
                                  <h3 className="font-extrabold text-slate-800 text-[11px] xs:text-xs sm:text-sm md:text-base leading-snug group-hover:text-emerald-600 transition-colors line-clamp-2">
                                    {camp.title}
                                  </h3>
                                  <p className="hidden md:block text-slate-450 text-[10px] md:text-xs line-clamp-2 leading-relaxed">
                                    {camp.description ? stripHtml(camp.description) : "Participe desta rifa e garanta sua chance de ganhar prêmios incríveis enquanto apoia nossa comissão de formatura."}
                                  </p>
                                </div>

                                {/* Compact horizontal stats for mobile */}
                                <div className="flex sm:hidden justify-between items-center bg-slate-50 border border-slate-100 rounded-xl px-2 py-1 select-none text-[9px] font-bold text-slate-600 w-full mb-2 font-mono">
                                  <span>{camp.totalTickets} <span className="font-medium text-slate-400">cotas</span></span>
                                  <span className="text-slate-200">|</span>
                                  <span>{restantes} <span className="font-medium text-slate-400">restam</span></span>
                                </div>

                                {/* The Trio of Info Boxes (Cotas, Vendidas, Restantes) */}
                                <div className="hidden sm:grid grid-cols-3 gap-1.5 md:gap-2.5 mb-3 w-full">
                                  <div className="bg-[#f0f8db]/80 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-emerald-700 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Cotas</span>
                                    <span className="text-emerald-800 font-black text-xs md:text-sm mt-0.5">{camp.totalTickets}</span>
                                  </div>
                                  <div className="bg-[#f1f9db]/85 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-amber-700 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider font-semibold">Vendidas</span>
                                    <span className="text-amber-800 font-black text-xs md:text-sm mt-0.5">{vendidas}</span>
                                  </div>
                                  <div className="bg-[#f1f9db]/85 border border-lime-200/60 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-red-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider font-semibold">Restantes</span>
                                    <span className="text-red-700 font-black text-xs md:text-sm mt-0.5">{restantes}</span>
                                  </div>
                                </div>

                                {/* Dynamic Projection Box based on sales velocity */}
                                <div className="hidden sm:block w-full">
                                  {(() => {
                                    const proj = getCampaignDrawProjection(camp, campTickets);
                                    return (
                                      <div className="mb-4 bg-indigo-50/50 border border-indigo-100/60 rounded-2xl p-2.5 flex flex-col justify-center space-y-1 w-full text-left">
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="text-indigo-950 font-extrabold uppercase tracking-wider flex items-center gap-1 font-semibold">
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
                                </div>

                                {/* Comprar Bilhetes Button */}
                                <div className={`w-full text-center text-[10px] sm:text-xs md:text-sm font-black py-1.5 sm:py-2.5 md:py-3 px-3 rounded-lg sm:rounded-2xl transition-all duration-200 border mt-auto ${
                                  restantes === 0
                                    ? "bg-slate-400 text-white border-slate-400 select-none cursor-not-allowed opacity-95 shadow-none"
                                    : isSelected
                                      ? "bg-green-600 text-white border-green-600 shadow-md"
                                      : "bg-[#82C943] text-white border-[#82C943] hover:bg-[#72b834] hover:border-[#72b834]"
                                }`}>
                                  {restantes === 0 ? "Esgotado ❌" : isSelected ? "Comprar ✓" : "Ver Cotas 🎫"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {campaignShowingTab === "drawn" && (
                    <div className="space-y-4 animate-fadeIn">
                      <WinnerHighlight
                        campaigns={campaigns}
                        allReservations={allReservations}
                        userProfile={userProfile}
                        onSelectCampaign={(camp) => {
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
                        selectedCampaignId={selectedCampaign?.id}
                        maskWinnerName={maskWinnerName}
                      />

                      {closedCampaigns.length === 0 ? (
                        <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200/80">
                          <Trophy className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
                          <h4 className="text-slate-650 font-bold text-xs">Nenhum sorteio realizado ainda</h4>
                          <p className="text-slate-400 text-[10px] mt-0.5">As rifas encerradas e seus ganhadores aparecerão listados aqui.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 animate-fadeIn">
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
                                className={`group relative flex flex-col text-left bg-white rounded-2xl md:rounded-3xl border overflow-hidden p-3 md:p-5 transition-all duration-300 cursor-pointer w-full opacity-90 hover:opacity-100 ${
                                  isSelected
                                    ? "border-amber-500 ring-4 ring-amber-500/15 shadow-lg transform scale-[1.01]"
                                    : "border-slate-200 hover:border-amber-350 hover:shadow-lg hover:-translate-y-0.5"
                                }`}
                              >
                                {/* Thumbnail Image Container ("Foto da Campanha" - Concluido) */}
                                <div className="relative aspect-[4/3] sm:aspect-square w-full overflow-hidden bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100 shrink-0 mb-3 grayscale group-hover:grayscale-0 transition-all duration-350">
                                  <img
                                    src={camp.imageUrl || getCampaignPlaceholderImage(camp.title, camp.id)}
                                    alt={camp.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />

                                  {/* Diagonal Sold Out Banner */}
                                  {restantes === 0 && (
                                    <div className="absolute inset-0 bg-black/30 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
                                      <div className="bg-gradient-to-r from-red-700 via-rose-500 to-red-700 text-white font-extrabold text-[8px] md:text-xs py-1.5 w-[160%] text-center uppercase tracking-widest rotate-[-25deg] shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-y border-yellow-400 animate-pulse select-none">
                                        ESGOTADO
                                      </div>
                                    </div>
                                  )}

                                  {/* Floating Winner Number Tag */}
                                  <div className="absolute top-1.5 left-1.5 md:top-2.5 md:left-2.5 bg-amber-500 text-white font-black text-[9px] sm:text-xs md:text-sm px-2 py-0.5 md:px-3.5 md:py-1.5 rounded-lg md:rounded-xl shadow-lg border border-white/10 flex items-center justify-center gap-1 font-mono">
                                    🏆 Nº {camp.winningNumber || "Sorteado"}
                                  </div>

                                  {/* Floating status badge (right side) */}
                                  <div className="absolute top-1.5 right-1.5 md:top-2.5 md:right-2.5 flex items-center gap-1">
                                    {userTicketsCount > 0 && (
                                      <span className="bg-slate-600 text-white text-[7px] md:text-[9.5px] font-black px-1.5 py-0.5 rounded-full shadow-md">
                                        {userTicketsCount} Adquirido
                                      </span>
                                    )}
                                    <span className="bg-slate-900/85 backdrop-blur-sm text-white px-1.5 py-0.5 md:px-2.5 md:py-1 text-[7px] md:text-[9.5px] font-bold rounded-full flex items-center gap-1 border border-white/10">
                                      <Trophy className="w-2 h-2 text-amber-450 animate-bounce" />
                                      Encerrada
                                    </span>
                                  </div>
                                </div>

                                {/* Title and Description */}
                                <div className="space-y-1 mb-2 flex-1 flex flex-col justify-start">
                                  <h3 className="font-extrabold text-slate-800 text-[11px] xs:text-xs sm:text-sm md:text-base leading-snug group-hover:text-amber-600 transition-colors line-clamp-2">
                                    {camp.title}
                                  </h3>
                                  <p className="hidden md:block text-slate-450 text-[10px] md:text-xs line-clamp-2 leading-relaxed">
                                    {camp.description ? stripHtml(camp.description) : "Confira os detalhes e o bilhete contemplado para este sorteio encerrado de formatura."}
                                  </p>
                                </div>

                                {/* Compact horizontal stats for mobile */}
                                <div className="flex sm:hidden justify-between items-center bg-slate-50 border border-slate-100 rounded-xl px-2 py-1.5 text-[9px] text-slate-600 font-bold w-full mb-2.5 select-none font-mono">
                                  <span>{camp.totalTickets} <span className="font-medium text-slate-400">cotas</span></span>
                                  <span className="text-slate-200">|</span>
                                  <span>{restantes} <span className="font-medium text-slate-400">sobra</span></span>
                                </div>

                                {/* The Trio of Info Boxes (Cotas, Vendidas, Restantes) */}
                                <div className="hidden sm:grid grid-cols-3 gap-1.5 md:gap-2.5 mb-4 w-full">
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Cotas</span>
                                    <span className="text-slate-700 font-black text-xs md:text-sm mt-0.5">{camp.totalTickets}</span>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider font-semibold">Vendidas</span>
                                    <span className="text-slate-700 font-black text-xs md:text-sm mt-0.5">{vendidas}</span>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-450 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider font-semibold">Sobra</span>
                                    <span className="text-slate-600 font-black text-xs md:text-sm mt-0.5">{restantes}</span>
                                  </div>
                                </div>

                                {/* Resultado / Ver Ganhador Button */}
                                <div className={`w-full text-center text-[10px] sm:text-xs md:text-sm font-black py-1.5 sm:py-2.5 md:py-3 px-3 rounded-lg sm:rounded-2xl transition-all duration-200 border mt-auto ${
                                  isSelected
                                    ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10"
                                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-200 shadow-sm"
                                }`}>
                                  {isSelected ? "Ganhador ✓" : "Ganhador 🏆"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {campaignShowingTab === "paused" && (
                    <div className="space-y-4 animate-fadeIn">
                      {upcomingCampaigns.length === 0 ? (
                        <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200/80">
                          <Clock className="w-8 h-8 mx-auto text-slate-350 mb-1.5 animate-pulse" />
                          <h4 className="text-slate-650 font-bold text-xs">Nenhuma campanha em breve</h4>
                          <p className="text-slate-400 text-[10px] mt-0.5">Por hora não há novas ofertas listadas. Fique de olho!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 animate-fadeIn">
                          {upcomingCampaigns.map((camp) => {
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
                                className={`group relative flex flex-col text-left bg-white rounded-2xl md:rounded-3xl border overflow-hidden p-3 md:p-5 transition-all duration-350 cursor-pointer w-full opacity-90 hover:opacity-100 ${
                                  isSelected
                                    ? "border-slate-805 ring-4 ring-slate-800/15 shadow-lg transform scale-[1.01]"
                                    : "border-slate-200 hover:border-slate-350 hover:shadow-lg hover:-translate-y-0.5"
                                }`}
                              >
                                {/* Thumbnail Image Container ("Foto da Campanha" - Em Breve) */}
                                <div className="relative aspect-[4/3] sm:aspect-square w-full overflow-hidden bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100 shrink-0 mb-3 grayscale group-hover:grayscale-0 transition-all duration-350">
                                  <img
                                    src={camp.imageUrl || getCampaignPlaceholderImage(camp.title, camp.id)}
                                    alt={camp.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />

                                  {/* Floating Price Tag */}
                                  <div className="absolute top-1.5 left-1.5 md:top-2.5 md:left-2.5 bg-slate-700 text-white font-black text-[9px] sm:text-xs md:text-sm px-2 py-0.5 md:px-3.5 md:py-1.5 rounded-lg md:rounded-xl shadow-lg border border-white/10 flex items-center justify-center font-mono font-bold">
                                    R$ {camp.ticketPrice.toFixed(2)}
                                  </div>

                                  {/* Floating status badge (right side) */}
                                  <div className="absolute top-1.5 right-1.5 md:top-2.5 md:right-2.5 flex flex-col items-end gap-1">
                                    <span className="bg-slate-900/85 backdrop-blur-sm text-white px-1.5 py-0.5 md:px-2.5 md:py-1 text-[7px] md:text-[9.5px] font-bold rounded-full flex items-center gap-1 border border-white/10">
                                      <Clock className="w-2 h-2 text-amber-450 animate-pulse" />
                                      Em Breve
                                    </span>
                                    <span className="bg-amber-500/90 text-[7px] text-slate-950 font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-sm border border-amber-300">
                                      <Crown className="w-2 h-2 fill-slate-900" /> VIP -{settings?.vipAdvanceHours || 24}h
                                    </span>
                                  </div>
                                </div>

                                {/* Countdown below the image, above the title */}
                                <div className="mt-2.5 mb-1 flex justify-center w-full">
                                  <CampaignCountdown campaign={camp} tickets={campTickets} />
                                </div>

                                {/* Title and Description */}
                                <div className="space-y-1 mb-2 flex-1 flex flex-col justify-start">
                                  <h3 className="font-extrabold text-slate-800 text-[11px] xs:text-xs sm:text-sm md:text-base leading-snug group-hover:text-slate-600 transition-colors line-clamp-2">
                                    {camp.title}
                                  </h3>
                                  <p className="hidden md:block text-slate-450 text-[10px] md:text-xs line-clamp-2 leading-relaxed">
                                    {camp.description ? stripHtml(camp.description) : "Esta rifa está com as reservas pausadas e será lançada em breve. Acompanhe as novidades!"}
                                  </p>
                                </div>

                                {/* Compact horizontal stats for mobile */}
                                <div className="flex sm:hidden justify-between items-center bg-slate-50 border border-slate-100 rounded-xl px-2 py-1.5 text-[9px] text-slate-605 font-bold w-full mb-2.5 select-none font-mono">
                                  <span>{camp.totalTickets} <span className="font-medium text-slate-400">cotas</span></span>
                                  <span className="text-slate-200">|</span>
                                  <span>Pausada</span>
                                </div>

                                {/* The Trio of Info Boxes (Cotas, Vendidas, Restantes) */}
                                <div className="hidden sm:grid grid-cols-3 gap-1.5 md:gap-2.5 mb-4 w-full">
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center font-bold">
                                    <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Cotas</span>
                                    <span className="text-slate-700 font-black text-xs md:text-sm mt-0.5">{camp.totalTickets}</span>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center font-bold font-semibold">
                                    <span className="text-slate-500 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Status</span>
                                    <span className="text-slate-700 font-black text-[10px] md:text-xs mt-0.5">Em Breve</span>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 md:p-2.5 flex flex-col items-center justify-center text-center font-bold font-semibold">
                                    <span className="text-slate-455 font-extrabold text-[9px] md:text-[11px] uppercase tracking-wider">Reservas</span>
                                    <span className="text-rose-600 font-black text-[10px] md:text-xs mt-0.5">Pausadas</span>
                                  </div>
                                </div>

                                {/* Regulamento Button */}
                                <div className={`w-full text-center text-[10px] sm:text-xs md:text-sm font-black py-1.5 sm:py-2.5 md:py-3 px-3 rounded-lg sm:rounded-2xl transition-all duration-200 border mt-auto ${
                                  isSelected
                                    ? "bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-800/10"
                                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:text-slate-800 shadow-sm"
                                }`}>
                                  {isSelected ? "Em Breve ✓" : "Ver Regulamento 📜"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                            Loteria Federal de: {selectedCampaign.drawDate.includes("-") ? selectedCampaign.drawDate.split("-").reverse().join("/") : selectedCampaign.drawDate}{selectedCampaign.drawHour ? ` às ${selectedCampaign.drawHour}` : ""}
                          </span>
                        )}
                        {selectedCampaign.status !== "drawn" && (
                          <div className="inline-flex">
                            <CampaignCountdown campaign={selectedCampaign} tickets={allReservations[selectedCampaign.id] || []} />
                          </div>
                        )}
                      </div>
                      <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-800">{selectedCampaign.title}</h2>
                      <div 
                        className="text-slate-650 text-xs leading-relaxed rich-text-content"
                        dangerouslySetInnerHTML={{ __html: selectedCampaign.description || "" }}
                      />
                      



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
                        {selectedCampaign.drawMode === "express" ? (
                          <>
                            Sorteio automático disparado na venda e confirmação de todas as cotas da ação
                            {selectedCampaign.drawDate && (
                              <> realizado em <strong>{selectedCampaign.drawDate}</strong></>
                            )}
                            {selectedCampaign.drawHour && (
                              <> às <strong>{selectedCampaign.drawHour}</strong></>
                            )}.
                          </>
                        ) : (
                          <>
                            Extração concurso nº <strong>{selectedCampaign.federalLotteryDrawId || "Oficial"}</strong> da Loteria Federal
                            {selectedCampaign.drawDate && (
                              <> realizada em <strong>{selectedCampaign.drawDate.includes("-") ? selectedCampaign.drawDate.split("-").reverse().join("/") : selectedCampaign.drawDate}</strong></>
                            )}
                            {selectedCampaign.drawHour && (
                              <> às <strong>{selectedCampaign.drawHour}</strong></>
                            )}.
                          </>
                        )}
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
                          <strong>
                            {userProfile?.role === "admin"
                              ? tickets[selectedCampaign.winningNumber || ""].buyerName
                              : maskWinnerName(tickets[selectedCampaign.winningNumber || ""].buyerName)}
                          </strong>
                          {userProfile?.role === "admin" ? (
                            <> de <strong>{tickets[selectedCampaign.winningNumber || ""].buyerCpf || "CPF verificado"}</strong></>
                          ) : (
                            <> (CPF verificado)</>
                          )}{" "}
                          comprou este bilhete!
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          O bilhete correspondente não foi vendido ou não teve o pagamento confirmado a tempo.
                        </p>
                      )}
                    </div>
                  )}

                  {/* RESERVATION NOTIFICATIONS */}
                  {selectedCampaign.status === "active" && isCampaignUpcoming(selectedCampaign) && (
                    <div className="p-6 md:p-8 text-center bg-slate-900 text-white rounded-b-2xl flex flex-col items-center py-12 select-none animate-fadeIn border-t border-slate-800">
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full mb-3 shrink-0 animate-bounce">
                        <Calendar className="w-10 h-10" />
                      </div>
                      <h3 className="text-lg md:text-xl font-extrabold tracking-tight uppercase text-indigo-100">Esta Rifa estreia em breve! 🚀</h3>
                      <p className="text-indigo-200/85 text-[11px] md:text-xs mt-1.5 max-w-sm leading-relaxed mb-6 font-semibold">
                        As vendas ainda não começaram, mas você já pode conhecer os prêmios e acompanhar o lançamento. Fique atento ao cronômetro abaixo!
                      </p>
                      
                      <div className="bg-slate-950/80 border border-indigo-950 rounded-3xl p-6 shadow-md max-w-md w-full flex flex-col items-center gap-3">
                        <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Tempo restante para o início:</span>
                        {selectedCampaign.startDate && (
                          <UpcomingCampaignCountdown 
                            campaign={selectedCampaign} 
                            onTimeReached={() => {
                              window.location.reload();
                            }} 
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCampaign.status === "active" && !isCampaignUpcoming(selectedCampaign) && (
                    <div className="p-6 md:p-8 space-y-6">
                      {successReserved && successReserved.length > 0 && (
                        <>
                          <CelebrationConfetti key={confettiKey} />
                          <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl p-5 flex gap-4 text-xs leading-relaxed shadow-sm animate-fadeIn">
                            <Check className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5 bg-emerald-100 rounded-full p-0.5" />
                            <div className="space-y-1.5 flex-1 select-text">
                              <h5 className="font-extrabold text-[14px] text-emerald-950 uppercase tracking-tight flex items-center gap-1.5">
                                Reserva Efetuada com Sucesso! 🎉
                              </h5>
                              <p className="font-semibold text-emerald-800">
                                Seus {successReserved.length} bilhetes (#{successReserved.join(", #")}) foram pré-reservados com sucesso sob o seu CPF.
                              </p>
                              <p className="text-slate-500 font-medium">
                                Um popup exclusivo de pagamento PIX foi iniciado. Se tiver fechado ele acidentalmente, não se preocupe: você pode reabri-lo a qualquer momento na aba <strong className="text-slate-800">Minhas Compras</strong> utilizando o botão <strong className="text-slate-900 bg-amber-100 border border-amber-300 px-1 py-0.5 rounded text-[10px]">Pagar PIX 💵</strong>.
                              </p>
                              <div className="pt-2 flex gap-2">
                                <button
                                  onClick={() => {
                                    setExclusiveMobilePayment({
                                      campaign: selectedCampaign,
                                      tickets: successReserved.map(num => ({
                                        id: num,
                                        number: num,
                                        status: "reserved",
                                        buyerUid: userProfile.uid,
                                        buyerName: userProfile.name,
                                        buyerPhone: userProfile.phone || "",
                                        buyerCpf: userProfile.cpf,
                                        buyerEmail: userProfile.email,
                                        reservedAt: new Date().toISOString()
                                      }))
                                    });
                                  }}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-sm cursor-pointer transition-colors"
                                >
                                  Abrir Tela de Pagamento 💳
                                </button>
                                <button
                                  onClick={() => setSuccessReserved(null)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition-colors animate-fadeIn"
                                >
                                  Entendi
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* ACTIVE RESERVATION SELECTION CARD */}
                      {selectedNumbers.length > 0 && (
                        <div id="checkout-summary-card" className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 text-slate-800 space-y-4 shadow-md animate-fadeIn relative overflow-hidden">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <h4 className="font-extrabold text-slate-900 text-sm md:text-base flex items-center gap-1.5 uppercase tracking-wide">
                              <span className="text-indigo-600">🛒</span>
                              Resumo do Pedido de Reserva
                            </h4>
                            <span className="text-[10.5px] bg-amber-500/10 text-amber-800 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                              ⏳ Reserva garantida por {settings?.expirationHours || 2} horas
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                            <p className="font-medium">
                              Você selecionou <strong className="text-indigo-900 font-black">{selectedNumbers.length} cota{selectedNumbers.length === 1 ? "" : "s"}</strong>. 
                              {selectedNumbers.length > 12 ? " Exibindo uma prévia das cotas:" : " Confira os números escolhidos:"}
                            </p>
                            
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {selectedNumbers.slice(0, 12).map(n => (
                                <span key={n} className="font-mono bg-slate-50 border border-slate-200/80 text-slate-700 rounded px-2 py-0.5 text-xs font-bold shadow-2xs">
                                  #{n}
                                </span>
                              ))}
                              {selectedNumbers.length > 12 && (
                                <span className="font-sans bg-indigo-50 border border-indigo-100 text-indigo-700 rounded px-2.5 py-0.5 text-xs font-black shadow-2xs flex items-center justify-center animate-pulse">
                                  +{selectedNumbers.length - 12} cota{selectedNumbers.length - 12 === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-[11px] text-slate-450 font-bold leading-normal pt-1 flex items-start gap-1">
                              <span className="text-emerald-500 shrink-0 select-none">▶</span>
                              Após a confirmação, estes números ficam de sua posse para realizar o pagamento via PIX imediatamente.
                            </p>
                          </div>

                          {/* VIP WHATSAPP GROUP CONVITE / UPSELL INCENTIVE */}
                          {settings?.vipWhatsAppUrl && (
                            selectedNumbers.length >= 10 ? (
                              <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-emerald-600/15 border border-amber-300/30 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-xs animate-pulse">
                                <div className="flex items-center gap-2.5">
                                  <div className="bg-amber-500 text-slate-950 p-2 rounded-xl shadow-md shrink-0">
                                    <Crown className="w-5 h-5 fill-slate-900 text-slate-950" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1">
                                      Grupo VIP WhatsApp Ativado! 👑
                                    </h4>
                                    <p className="text-[10.5px] text-slate-505 font-medium leading-normal">
                                      Suas {selectedNumbers.length} cotas dão direito a participar hoje mesmo do nosso grupo exclusivo!
                                    </p>
                                  </div>
                                </div>
                                <a
                                  href={settings.vipWhatsAppUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3.5 py-2 rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-emerald-500/10 active:scale-95 cursor-pointer uppercase tracking-wider whitespace-nowrap"
                                >
                                  Entrar no Grupo 🟢
                                </a>
                              </div>
                            ) : (
                              <div className="bg-gradient-to-r from-indigo-500/5 to-amber-500/5 border border-slate-200/60 rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
                                <div className="bg-amber-500/10 text-amber-700 p-1.5 rounded-lg shrink-0">
                                  <Crown className="w-4 h-4 text-amber-600 fill-amber-550/30" />
                                </div>
                                <p className="text-[10.5px] text-slate-600 leading-normal font-semibold">
                                  🔥 <strong>Quer ser VIP?</strong> Reserve <span className="text-indigo-600 font-extrabold">{10 - selectedNumbers.length} cota{10 - selectedNumbers.length === 1 ? "" : "s"}</span> a mais para destravar o <strong>desconto exclusivo</strong> e o link do nosso <strong>Grupo VIP de WhatsApp!</strong>
                                </p>
                              </div>
                            )
                          )}

                          {/* DESTACADO VALOR TOTAL DA RESERVA SELECIONADA */}
                          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md relative overflow-hidden">
                            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                            
                            <div className="space-y-1 z-10">
                              <span className="text-[9px] text-indigo-300 font-black uppercase tracking-widest block leading-none">VALOR TOTAL DO PEDIDO</span>
                              {(() => {
                                const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
                                const isVipDiscountActive = userProfile?.isVip && calc.discountPercentage === settings?.vipDiscountPercentage;
                                return (
                                  <div className="space-y-1.5 mt-1">
                                    <strong className="text-3xl md:text-4xl font-extrabold text-white font-sans block leading-none tracking-tight">
                                      R$ {calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </strong>
                                    <span className="text-[11px] text-indigo-200 font-bold block leading-none">
                                      {selectedNumbers.length} cota(s) • R$ {calc.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cada {isVipDiscountActive ? "👑" : calc.appliedDiscount ? "🏷️" : ""}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>

                            {(() => {
                              const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
                              const isVipDiscountActive = userProfile?.isVip && calc.discountPercentage === settings?.vipDiscountPercentage;
                              return (
                                <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0 z-10">
                                  {isVipDiscountActive ? (
                                    <span className="text-[9.5px] bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm flex items-center gap-1">
                                      👑 VIP Ativo (-{settings?.vipDiscountPercentage}%)
                                    </span>
                                  ) : calc.appliedDiscount ? (
                                    <span className="text-[9.5px] bg-emerald-500 text-slate-950 font-black px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm flex items-center gap-1 animate-pulse">
                                      🏷️ Desconto Ativado!
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="flex gap-2.5 justify-end text-xs pt-1.5 border-t border-slate-100">
                            <button
                              onClick={() => setSelectedNumbers([])}
                              disabled={reserving}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
                            >
                              Limpar Tudo
                            </button>
                            <button
                              onClick={handleReserveTickets}
                              disabled={reserving}
                              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-500/15 cursor-pointer text-center flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-wider"
                            >
                              {reserving ? "Reservando..." : `Confirmar Reserva 💳`}
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

                        {/* HIGH-PERFORMANCE SEARCH & FILTER BAR FOR LARGE-SCALE CAMPAIGNS */}
                        <div className="bg-slate-50/50 border border-slate-100/80 p-3.5 rounded-2xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-subtle animate-fadeIn">
                          {/* Left: Interactive Filter Tabs */}
                          <div id="grid-status-filter" className="flex flex-wrap gap-1.5 scrollbar-none overflow-x-auto pb-1 md:pb-0">
                            {[
                              { key: "all", label: "Todos" },
                              { key: "available", label: "Disponíveis" },
                              { key: "mine", label: "Minhas Cotas" },
                              { key: "selected", label: "Selecionadas" }
                            ].map((tab) => {
                              const isActive = gridFilter === tab.key;
                              return (
                                <button
                                  key={tab.key}
                                  type="button"
                                  onClick={() => {
                                    setGridFilter(tab.key as any);
                                    setTicketPage(0);
                                  }}
                                  className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-150 border cursor-pointer select-none ${
                                    isActive
                                      ? "bg-indigo-650 border-indigo-650 text-white shadow-sm scale-102"
                                      : "bg-white border-slate-200 text-slate-550 hover:text-slate-850 hover:bg-slate-100"
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Right: Real-time Live Search Input */}
                          <div className="relative flex-1 max-w-full md:max-w-[280px]">
                            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-450 pointer-events-none" />
                            <input
                              type="text"
                              value={ticketSearch}
                              onChange={(e) => {
                                setTicketSearch(e.target.value);
                                setTicketPage(0);
                              }}
                              placeholder="Buscar cota por número..."
                              className="w-full text-xs font-mono font-bold pl-9.5 pr-14 py-2 bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-850 shadow-3xs"
                            />
                            {ticketSearch && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTicketSearch("");
                                  setTicketPage(0);
                                }}
                                className="absolute right-2 px-2 py-0.5 rounded-lg text-[9px] bg-slate-100 font-extrabold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                                style={{ top: "7px" }}
                              >
                                Limpar
                              </button>
                            )}
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
                                const isBtnDisabled = selectedCampaignIsSoldOut || selectedCampaignRestantes < count;
                                
                                return (
                                  <button
                                    key={count}
                                    type="button"
                                    disabled={isBtnDisabled}
                                    onClick={() => !isBtnDisabled && handleQuickSelectRandom(count)}
                                    className={`relative py-2.5 px-1 sm:px-3 rounded-xl shadow-xs transition-transform duration-205 text-center flex flex-col items-center justify-center border font-black text-xs cursor-pointer ${
                                      isBtnDisabled
                                        ? "bg-slate-300 border-slate-300 text-slate-500 cursor-not-allowed select-none pointer-events-none opacity-80"
                                        : isSelectedCount
                                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md font-bold"
                                          : "bg-[#82C943] border-[#82C943] hover:bg-[#72b834] hover:border-[#72b834] text-white hover:-translate-y-0.5"
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

                            {/* Seletor Customizado de Quantidade para Mobile */}
                            <div className="pt-3.5 border-t border-dashed border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-emerald-500/5 p-3.5 rounded-2xl">
                              <div className="space-y-0.5 text-center sm:text-left">
                                <span className="text-[10.5px] text-emerald-800 font-extrabold uppercase tracking-wider block">Qualquer Quantidade</span>
                                <p className="text-[9.5px] text-slate-500 font-medium">Defina um lote personalizado com facilidade</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-xs h-10 select-none">
                                  <button
                                    type="button"
                                    disabled={selectedCampaignIsSoldOut}
                                    onClick={() => setCustomQuantity(q => Math.max(1, q - 1))}
                                    className="px-3 bg-slate-50 text-slate-700 font-black text-sm hover:bg-slate-100 h-full border-r border-slate-200 active:bg-slate-200 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max={selectedCampaign.totalTickets}
                                    disabled={selectedCampaignIsSoldOut}
                                    value={customQuantity}
                                    onChange={(e) => {
                                      const val = Math.min(selectedCampaign.totalTickets, Math.max(1, parseInt(e.target.value) || 1));
                                      setCustomQuantity(val);
                                    }}
                                    className="w-12 text-center font-mono font-black text-xs text-slate-800 bg-transparent py-1 h-full outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <button
                                    type="button"
                                    disabled={selectedCampaignIsSoldOut}
                                    onClick={() => setCustomQuantity(q => Math.min(selectedCampaign.totalTickets, q + 1))}
                                    className="px-3 bg-slate-50 text-slate-700 font-black text-sm hover:bg-slate-100 h-full border-l border-slate-200 active:bg-slate-200 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    +
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  disabled={selectedCampaignIsSoldOut || customQuantity > selectedCampaignRestantes}
                                  onClick={() => handleQuickSelectRandom(customQuantity)}
                                  className={`h-10 px-4 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
                                    selectedCampaignIsSoldOut || customQuantity > selectedCampaignRestantes
                                      ? "bg-slate-300 border-slate-300 text-slate-500 cursor-not-allowed select-none pointer-events-none shadow-none opacity-80"
                                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10 active:scale-95"
                                  }`}
                                >
                                  <span>Pegar {customQuantity} Cotas 🎲</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}





                        {loadingTickets ? (
                          <div className={`grid ${mobileColumns === 4 ? "grid-cols-4" : mobileColumns === 6 ? "grid-cols-6" : "grid-cols-5"} sm:grid-cols-10 gap-2`}>
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
                          <>
                            {/* Grid drawing loop based on total size limit */}
                            <div className={`grid ${mobileColumns === 4 ? "grid-cols-4 animate-fadeIn" : mobileColumns === 6 ? "grid-cols-6 animate-fadeIn" : "grid-cols-5"} sm:grid-cols-10 gap-1.5 sm:gap-2 max-h-[450px] overflow-y-auto p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full`}>
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
                                  const isMine = userProfile && tInfo.buyerUid === userProfile.uid;
                                  bgClass = isMine
                                    ? "bg-amber-400 text-slate-900 border-amber-400 hover:bg-amber-500 font-bold"
                                    : "bg-amber-100 text-amber-800 border-amber-200 cursor-not-allowed pointer-events-none opacity-70";
                                  statusLabel = isMine ? "Sua Reserva" : "Já Reservado";
                                }
                              }

                              return (
                                <button
                                  key={numStr}
                                  disabled={tInfo?.status === "confirmed" || (tInfo?.status === "reserved" && (!userProfile || tInfo.buyerUid !== userProfile.uid))}
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

                          {/* HIGHER PERFORMANCE RESPONSIVE PAGINATION CONTROLS */}
                          {totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100/80 mt-4 select-none animate-fadeIn bg-slate-50/20 p-3.5 rounded-2xl border border-slate-100/60 shadow-3xs">
                              <div className="text-[11px] text-slate-500 font-bold">
                                Mostrando <strong className="text-slate-800 font-extrabold">{paginatedIndices.length}</strong> de <strong className="text-slate-800 font-extrabold">{filteredIndices.length}</strong> cotas (Pág. <strong className="text-indigo-650 font-black">{ticketPage + 1}</strong> de <strong className="text-slate-800 font-extrabold">{totalPages}</strong>)
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                                <button
                                  type="button"
                                  onClick={() => setTicketPage(0)}
                                  disabled={ticketPage === 0}
                                  className="p-2 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-black text-xs min-h-[36px] min-w-[36px] flex items-center justify-center shadow-4xs"
                                  title="Primeira Página"
                                >
                                  «
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTicketPage(p => Math.max(0, p - 1))}
                                  disabled={ticketPage === 0}
                                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-black text-xs flex items-center gap-1 min-h-[36px] shadow-4xs"
                                >
                                  ‹ Anterior
                                </button>

                                {/* Mobile compact dropdown selector or nearby pages on Desktop */}
                                <div className="hidden sm:flex items-center gap-1">
                                  {Array.from({ length: totalPages }).map((_, pIdx) => {
                                    // Render only first page, last page, and 1 surrounding requested page
                                    if (pIdx === 0 || pIdx === totalPages - 1 || Math.abs(pIdx - ticketPage) <= 1) {
                                      const isPageActive = ticketPage === pIdx;
                                      return (
                                        <button
                                          key={pIdx}
                                          type="button"
                                          onClick={() => setTicketPage(pIdx)}
                                          className={`w-9 h-9 text-xs font-extrabold rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                                            isPageActive
                                              ? "bg-indigo-650 border-indigo-650 text-white shadow-sm font-black scale-102"
                                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                          }`}
                                        >
                                          {pIdx + 1}
                                        </button>
                                      );
                                    }
                                    // Ellipses rendering
                                    if (pIdx === 1 || pIdx === totalPages - 2) {
                                      return (
                                        <span key={pIdx} className="text-slate-400 px-0.5 text-[10px] font-black">
                                          ...
                                        </span>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>

                                <div className="flex sm:hidden">
                                  <select
                                    value={ticketPage}
                                    onChange={(e) => setTicketPage(Number(e.target.value))}
                                    className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-705 outline-none focus:ring-0 focus:border-indigo-500 h-[36px] shadow-4xs"
                                  >
                                    {Array.from({ length: totalPages }).map((_, pIdx) => (
                                      <option key={pIdx} value={pIdx}>
                                        Pág. {pIdx + 1}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setTicketPage(p => Math.min(totalPages - 1, p + 1))}
                                  disabled={ticketPage === totalPages - 1}
                                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-black text-xs flex items-center gap-1 min-h-[36px] shadow-4xs"
                                >
                                  Próxima ›
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTicketPage(totalPages - 1)}
                                  disabled={ticketPage === totalPages - 1}
                                  className="p-2 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer font-black text-xs min-h-[36px] min-w-[36px] flex items-center justify-center shadow-4xs"
                                  title="Última Página"
                                >
                                  »
                                </button>
                              </div>
                            </div>
                          )}
                          </>
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

              {/* Coluna Direita: Minhas Compras (Desktop-only inside RIFAS view) */}
              <div className="hidden lg:block lg:col-span-4 space-y-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4 font-normal text-slate-705">
                  <h2 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-650 shrink-0" />
                    Minhas Compras & Bilhetes 🛍️
                  </h2>
                  <p className="text-slate-505 text-xs font-normal">
                    Acompanhe o status do pagamento das suas compras e acesse seus bilhetes.
                  </p>
                  
                  {myTotalTicketsCount > 0 && (
                    <button
                      onClick={() => {
                        setActiveTab("compras");
                        setSuccessReserved(null);
                      }}
                      className="w-full bg-gradient-to-r from-indigo-55 to-indigo-100 hover:from-indigo-100 hover:to-indigo-150 text-indigo-900 text-[11px] font-black py-2.5 px-3 rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5 border border-indigo-200/50 shadow-2xs active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-650 animate-pulse" />
                      <span>Ver Acompanhamento Passo a Passo 📈</span>
                    </button>
                  )}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {(() => {
                        const entries = Object.entries(myTickets) as [string, Ticket[]][];
                        const allBatches: { campaign: Campaign; tickets: Ticket[]; key: string }[] = [];

                        entries.forEach(([campaignId, tList]) => {
                          if (tList.length === 0) return;
                          const camp = campaigns.find(c => c.id === campaignId);
                          if (!camp) return;

                          const batches = splitTicketsIntoBatches(tList);
                          batches.forEach((batch, bIdx) => {
                            const batchId = batch[0].batchId || `time_${batch[0].reservedAt || 'legacy'}_${bIdx}`;
                            allBatches.push({
                              campaign: camp,
                              tickets: batch,
                              key: `${campaignId}_${batchId}`
                            });
                          });
                        });

                        if (allBatches.length === 0) {
                          return (
                            <EmptyReservationsState
                              compact={true}
                              onExploreClick={() => {
                                setActiveTab("rifas");
                                setSuccessReserved(null);
                              }}
                            />
                          );
                        }

                        return allBatches.map(({ campaign, tickets, key }) => {
                          const confirmedTickets = tickets.filter(item => item.status === "confirmed");
                          const reservedTickets = tickets.filter(item => item.status === "reserved");

                          return (
                            <div key={key} className="space-y-2 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <strong className="text-slate-800 text-xs block truncate max-w-[55%]" title={campaign.title}>{campaign.title}</strong>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] text-slate-400">{tickets.length} cota(s)</span>
                                  {reservedTickets.length > 0 && (
                                    <div className="flex gap-1 items-center">
                                      <button
                                        onClick={() => setExclusiveMobilePayment({ campaign: campaign, tickets: reservedTickets })}
                                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5 animate-pulse"
                                        title="Abrir página exclusiva de pagamento e PIX da reserva"
                                      >
                                        <span>Pagar PIX 💵</span>
                                      </button>
                                      <button
                                        onClick={() => handleWhatsAppRedirect(reservedTickets, campaign)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                                        title="Enviar comprovante de reserva desta campanha por WhatsApp"
                                      >
                                        <span>WhatsApp 💬</span>
                                      </button>
                                    </div>
                                  )}
                                  {confirmedTickets.length > 0 && (
                                    <button
                                      onClick={() => setTicketModalConfig({ campaign: campaign, tickets: confirmedTickets })}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition flex items-center gap-0.5"
                                      title="Emitir todos os bilhetes confirmados desta campanha"
                                    >
                                      <span>Emitir 🎟️</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {tickets.map((t) => {
                                  const isConfirmed = t.status === "confirmed";
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => {
                                        if (isConfirmed) {
                                          setTicketModalConfig({ campaign: campaign, tickets: [t] });
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
                                            handleCancelReservation(campaign.id, t.id);
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
                        });
                      })()}
                    </div>

                  {/* Quick Copy PIX helper inside reservations list */}
                  {myTotalTicketsCount > 0 && (Object.values(myTickets).flat() as Ticket[]).some(t => t.status === "reserved") && (
                    <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-xs text-slate-700 space-y-1.5 animate-fadeIn">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <Landmark className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Pagamento Pix Pendente</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-normal font-medium">
                        Para visualizar a chave PIX, dados do favorecido ou enviar o comprovante, utilize os botões <strong className="text-slate-900 font-extrabold font-sans">Pagar PIX 💵</strong> e <strong className="text-slate-900 font-extrabold font-sans">WhatsApp 💬</strong> ao lado da sua reserva acima.
                      </p>
                    </div>
                  )}
                </div>
                {renderTopSupportersWidget(true)}
              </div>

            </div>
          )}
        </div>
      )}

      {/* 3. RETRO COMPATIBLE "COMPRAS" TAB SEARCH ON MOBILE & DESKTOP */}
      {activeTab === "compras" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-indigo-650 shrink-0 uppercase tracking-wide animate-bounce" />
                  Painel de Minhas Compras 🛍️
                </h2>
                <p className="text-slate-500 text-xs mt-1">
                  Gerencie todos os seus bilhetes adquiridos, status de pagamento, chaves PIX e emita seus bilhetes oficiais.
                </p>
              </div>

              {myTotalTicketsCount > 0 && (
                <div className="bg-indigo-50 border border-indigo-100/50 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-bold text-indigo-900 shadow-2xs shrink-0 select-none">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span>{myTotalTicketsCount} Cota(s) no Total</span>
                </div>
              )}
            </div>

            {/* STATS OVERVIEW SECTION */}
            {myTotalTicketsCount > 0 && (() => {
              const allMyTicketsList = Object.values(myTickets).flat() as Ticket[];
              const confirmedCount = allMyTicketsList.filter(t => t.status === "confirmed").length;
              const reservedCount = allMyTicketsList.filter(t => t.status === "reserved").length;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100/80 pb-6">
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex items-center justify-between shadow-3xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none">Total Adquirido</span>
                      <strong className="text-2xl font-black text-slate-900 block font-mono mt-1">{allMyTicketsList.length}</strong>
                      <span className="text-[10.5px] text-slate-500 font-semibold block leading-none">Cotas registradas</span>
                    </div>
                    <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl shrink-0 shadow-3xs">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-2xl p-4 flex items-center justify-between shadow-3xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest block leading-none">Pagas & Ativas</span>
                      <strong className="text-2xl font-black text-emerald-600 block font-mono mt-1">{confirmedCount}</strong>
                      <span className="text-[10.5px] text-slate-500 font-semibold block leading-none">Concorrendo a prêmios 🍀</span>
                    </div>
                    <div className="bg-emerald-500/10 text-emerald-600 p-2.5 rounded-xl shrink-0">
                      <Check className="w-5 h-5 font-black text-emerald-600" />
                    </div>
                  </div>

                  <div className="bg-amber-50/40 border border-amber-100/50 rounded-2xl p-4 flex items-center justify-between shadow-3xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest block leading-none">Aguardando Pagamento</span>
                      <strong className="text-2xl font-black text-amber-600 block font-mono mt-1">{reservedCount}</strong>
                      <span className="text-[10.5px] text-slate-500 font-semibold block leading-none font-sans">Pendentes no Pix ⏳</span>
                    </div>
                    <div className="bg-amber-500/10 text-amber-600 p-2.5 rounded-xl shrink-0">
                      <Clock className="w-5 h-5 font-black text-amber-600" />
                    </div>
                  </div>
                </div>
              );
            })()}

            {myTotalTicketsCount === 0 ? (
              <EmptyReservationsState
                onExploreClick={() => {
                  setActiveTab("rifas");
                  setSuccessReserved(null);
                }}
              />
            ) : (
              <div className="space-y-4">
                {(() => {
                  const entries = Object.entries(myTickets) as [string, Ticket[]][];
                  const allBatches: { campaign: Campaign; tickets: Ticket[]; key: string }[] = [];

                  entries.forEach(([campaignId, tList]) => {
                    if (tList.length === 0) return;
                    const camp = campaigns.find(c => c.id === campaignId);
                    if (!camp) return;

                    const batches = splitTicketsIntoBatches(tList);
                    batches.forEach((batch, bIdx) => {
                      const batchId = batch[0].batchId || `time_${batch[0].reservedAt || 'legacy'}_${bIdx}`;
                      allBatches.push({
                        campaign: camp,
                        tickets: batch,
                        key: `${campaignId}_${batchId}`
                      });
                    });
                  });

                  if (allBatches.length === 0) {
                    return (
                      <EmptyReservationsState
                        onExploreClick={() => {
                          setActiveTab("rifas");
                          setSuccessReserved(null);
                        }}
                      />
                    );
                  }

                  return allBatches.map(({ campaign, tickets, key }) => {
                    const confirmedTickets = tickets.filter(item => item.status === "confirmed");
                    const reservedTickets = tickets.filter(item => item.status === "reserved");
                    const isAllConfirmed = reservedTickets.length === 0;
                    const firstTicket = tickets[0] as Ticket | undefined;
                    const totalVal = tickets.length * campaign.ticketPrice;

                    // Compute dynamic tracking steps
                    const steps = [
                      {
                        num: 1,
                        title: "Cotas Reservadas com Sucesso 📝",
                        desc: `Suas cotas foram separadas com segurança sob seu CPF no sistema da comissão de formatura.`,
                        status: "done",
                        sub: firstTicket?.reservedAt 
                          ? `Realizado em ${new Date(firstTicket.reservedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}h`
                          : "Reserva Efetuada",
                      },
                      {
                        num: 2,
                        title: "Pagamento via PIX 💵",
                        desc: isAllConfirmed 
                          ? `Chave identificada, Pix recebido e aprovado pela comissão de formatura.`
                          : `Aguardando a transferência do valor de R$ ${totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via PIX para o administrador.`,
                        status: isAllConfirmed ? "done" : "pending",
                        sub: isAllConfirmed && firstTicket?.confirmedAt
                          ? `Confirmado em ${new Date(firstTicket.confirmedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}h`
                          : isAllConfirmed
                            ? "Compensado e Validado"
                            : "Transferência Pendente",
                        interactive: !isAllConfirmed && (
                          <div className="flex flex-wrap gap-2.5 mt-3 select-none">
                            <button
                              type="button"
                              onClick={() => handlePayWithMercadoPago(campaign, reservedTickets, firstTicket?.batchId || "")}
                              disabled={mpLoadingBatchId === (firstTicket?.batchId || "")}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black px-4 py-2.5 rounded-xl cursor-pointer transition flex items-center gap-1.5 shadow-md shadow-indigo-500/10 active:scale-95 disabled:bg-indigo-400 disabled:cursor-not-allowed"
                            >
                              {mpLoadingBatchId === (firstTicket?.batchId || "") ? (
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <CreditCard className="w-3.5 h-3.5 text-indigo-200 stroke-[2.5px]" />
                              )}
                              <span>Pagar Online (Cartão/PIX/MP) 💳</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExclusiveMobilePayment({ campaign: campaign, tickets: reservedTickets })}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10.5px] font-black px-3.5 py-2.5 rounded-xl cursor-pointer transition flex items-center gap-1 shadow-md shadow-amber-500/10 active:scale-95"
                            >
                              <span>Visualizar Chave PIX 💳</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWhatsAppRedirect(reservedTickets, campaign)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold px-3 py-2.5 rounded-xl cursor-pointer transition flex items-center gap-1 active:scale-95"
                            >
                              <span>WhatsApp 💬</span>
                            </button>
                          </div>
                        )
                      },
                      {
                        num: 3,
                        title: "Homologação & Emissão Oficial 🎟️",
                        desc: isAllConfirmed
                          ? `Seus bilhetes oficiais certificados foram emitidos legalmente para concorrer.`
                          : `Chancela digital em processamento automático. Será liberado assim que o Pix for aprovado pelo administrador.`,
                        status: isAllConfirmed ? "done" : "idle",
                        sub: isAllConfirmed ? "Chancela eletrônica ativa!" : "Aguardando homologação",
                        interactive: isAllConfirmed && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setTicketModalConfig({ campaign: campaign, tickets: confirmedTickets })}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5 shadow-md shadow-indigo-500/15 active:scale-95"
                              title="Emitir bilhetes desta reserva"
                            >
                              <span>Visualizar & Imprimir Bilhetes 🎫</span>
                            </button>
                          </div>
                        )
                      },
                      {
                        num: 4,
                        title: "Status do Sorteio 🔮",
                        desc: campaign.status === "drawn"
                          ? `Apuração realizada de acordo com a extração oficial da Loteria Federal.`
                          : `Disponível em breve. Suas cotas concorrem pela Loteria Federal no concurso de encerramento da campanha.`,
                        status: campaign.status === "drawn" ? "drawn" : "idle",
                        sub: campaign.status === "drawn"
                          ? `Sorteado! Número contemplado: #${campaign.winningNumber}`
                          : campaign.drawDate
                            ? `Previsão: ${campaign.drawDate} ${campaign.drawHour || ""}`
                            : "Aguardando apuração",
                      }
                    ];

                    const winningTicket = tickets.find(t => t.number === campaign.winningNumber);
                    const drawFinished = campaign.status === "drawn";

                    return (
                      <div 
                        key={key} 
                        className="bg-slate-50/40 border border-slate-150 rounded-2xl p-4 sm:p-6 space-y-6 transition-all hover:bg-slate-50 duration-205 shadow-3xs"
                      >
                        {/* Batch Header Context */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/50 pb-4 select-text">
                          <div className="space-y-1">
                            <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                              <TicketIcon className="w-5 h-5 text-indigo-650 shrink-0" />
                              {campaign.title}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              <span>{tickets.length} {tickets.length === 1 ? "cota" : "cotas"} reservada(s)</span>
                              <span>•</span>
                              <span>Total: R$ {totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isAllConfirmed ? (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-1 rounded-xl text-[10px] font-extrabold flex items-center gap-1 shadow-2xs">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Pago & Aprovado 🌟
                              </span>
                            ) : (
                              <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-xl text-[10px] font-extrabold flex items-center gap-1 shadow-2xs animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                Aguardando Pix ⏳
                              </span>
                            )}
                          </div>
                        </div>

                        {/* WhatsApp VIP Group access banner if tickets.length >= 10 and links exists */}
                        {tickets.length >= 10 && settings?.vipWhatsAppUrl && (
                          <div className="bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-3xs">
                            <div className="flex items-center gap-3">
                              <div className="bg-amber-500 text-slate-900 p-2 rounded-xl shadow-md">
                                <Crown className="w-5 h-5 text-yellow-100 fill-slate-950" />
                              </div>
                              <div>
                                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5 leading-none">
                                  Grupo VIP Liberado! 👑
                                </h4>
                                <p className="text-[10.5px] text-slate-500 leading-normal mt-1">
                                  Você comprou {tickets.length} cotas de uma vez! Por isso, seu acesso ao Grupo VIP do WhatsApp está liberado.
                                </p>
                              </div>
                            </div>
                            <a
                              href={settings.vipWhatsAppUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 whitespace-nowrap active:scale-95 cursor-pointer uppercase tracking-wider text-center"
                            >
                              Entrar no Grupo 🟢
                            </a>
                          </div>
                        )}

                        {/* Visual Tickets Row */}
                        <div className="space-y-2">
                          <span className="block text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400">Suas Cotas deste pedido:</span>
                          <div className="flex flex-wrap gap-2">
                            {tickets.map((t) => {
                              const isConfirmed = t.status === "confirmed";
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    if (isConfirmed) {
                                      setTicketModalConfig({ campaign: campaign, tickets: [t] });
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold font-mono flex items-center gap-1.5 transition-all shadow-3xs ${
                                    isConfirmed
                                      ? "bg-indigo-50 border-indigo-200 hover:border-indigo-300 text-indigo-900 hover:scale-[1.03] hover:bg-indigo-100/80 cursor-pointer"
                                      : "bg-amber-50 border-amber-210 text-amber-900 cursor-default"
                                  }`}
                                  title={isConfirmed ? "Clique para emitir seu Bilhete Oficial 🎟️" : "Aguardando confirmação de pagamento"}
                                >
                                  <span>#{t.number}</span>
                                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white border border-slate-100 font-sans font-extrabold shrink-0">
                                    {isConfirmed ? "Ativo 🌟" : "Pend."}
                                  </span>
                                  {t.status === "reserved" && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelReservation(campaign.id, t.id);
                                      }}
                                      className="text-rose-500 hover:text-rose-700 ml-1 font-sans font-black cursor-pointer text-[13px] leading-none px-1 p-0.5 rounded hover:bg-rose-50 transition"
                                      title="Cancelar reserva deste número"
                                    >
                                      ×
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Elegant Stepper Tracker Timeline */}
                        <div className="border-t border-slate-150 pt-5 space-y-4">
                          <span className="block text-[9.5px] uppercase tracking-wider font-extrabold text-indigo-650 flex items-center gap-1">
                            <span>📈 Linha do Tempo e Acompanhamento Passo a Passo</span>
                          </span>

                          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-[11px] sm:before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 select-text">
                            {steps.map((st) => {
                              const isCompleted = st.status === "done";
                              const isPendingStatus = st.status === "pending";
                              const isDrawnStatus = st.status === "drawn";

                              return (
                                <div key={st.num} className="relative group animate-fadeIn">
                                  {/* Marker Circle */}
                                  <div className={`absolute -left-[19px] sm:-left-[23px] top-0.5 w-[14px] h-[14px] sm:w-[18px] sm:h-[18px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                    isCompleted 
                                      ? "bg-indigo-600 border-indigo-700 ring-4 ring-indigo-50"
                                      : isPendingStatus
                                        ? "bg-amber-500 border-amber-600 ring-4 ring-amber-50 animate-pulse"
                                        : isDrawnStatus
                                          ? "bg-emerald-600 border-emerald-700 ring-4 ring-emerald-50"
                                          : "bg-white border-slate-300 ring-4 ring-slate-50"
                                  }`}>
                                    {isCompleted && <Check className="w-2 h-2 text-white" />}
                                  </div>

                                  {/* Content Area */}
                                  <div className="space-y-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                      <h4 className={`font-black text-xs sm:text-[13px] tracking-tight ${
                                        isCompleted 
                                          ? "text-indigo-900" 
                                          : isPendingStatus
                                            ? "text-amber-900"
                                            : isDrawnStatus
                                              ? "text-emerald-950 animate-pulse"
                                              : "text-slate-500"
                                      }`}>
                                        {st.title}
                                      </h4>
                                      <span className="text-[10px] font-sans font-bold text-slate-400 block shrink-0">
                                        {st.sub}
                                      </span>
                                    </div>
                                    <p className="text-[11.5px] text-slate-500 leading-relaxed font-medium">
                                      {st.desc}
                                    </p>

                                    {st.interactive && (
                                      <div>{st.interactive}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Drawn Conclusion Box */}
                        {drawFinished && (
                          <div className="border-t border-slate-150 pt-5 animate-fadeIn">
                            {winningTicket ? (
                              <div className="bg-gradient-to-br from-amber-500 to-yellow-600 border border-amber-500/30 p-5 rounded-2xl text-white space-y-2 relative overflow-hidden shadow-md">
                                <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                                <div className="flex items-center gap-2">
                                  <Trophy className="w-6 h-6 text-yellow-100 animate-bounce" />
                                  <span className="text-sm font-black uppercase tracking-wide">🏆 PARABÉNS! VOCÊ FOI O GANHADOR OFICIAL!</span>
                                </div>
                                <p className="text-xs text-yellow-50 font-normal leading-relaxed">
                                  Sua cota contemplada foi a <strong className="text-white font-extrabold font-mono px-1 bg-[#111827]/35 rounded text-sm">#{winningTicket.number}</strong> na extração oficial da Loteria Federal! Parabéns por garantir o prêmio principal em apoio à nossa colação de grau de formatura.
                                </p>
                                <div className="pt-2 select-none">
                                  <button
                                    type="button"
                                    onClick={() => handleWhatsAppRedirect([winningTicket], campaign)}
                                    className="px-4 py-2 bg-[#111827] hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition shadow-lg active:scale-95 cursor-pointer block sm:inline-block text-center"
                                  >
                                    Reivindicar Prêmio via WhatsApp 💬
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-slate-100/80 border border-slate-200/50 p-4 rounded-xl text-slate-500 space-y-1 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-slate-755">
                                  <HelpCircle className="w-4 h-4 text-slate-500" />
                                  <span>Apuração Concluída</span>
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                  O bilhete contemplado na extração da Loteria Federal foi o número <strong className="font-mono text-slate-900">#{campaign.winningNumber}</strong>. Não foi desta vez que o seu número foi o premiado principal, mas sua ajuda com as cotas financiou a formatura e aproximou toda a turma do sonho de colar grau! Agradecemos cordialmente sua generosidade.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Quick Copy PIX helper inside reservations list for mobile */}
            {myTotalTicketsCount > 0 && (Object.values(myTickets).flat() as Ticket[]).some(t => t.status === "reserved") && (
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-xs text-slate-705 space-y-1.5 animate-fadeIn">
                <div className="flex items-center gap-1.5 font-bold text-amber-850">
                  <Landmark className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pagamento Pix Pendente</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal font-medium">
                  Para visualizar a chave PIX, dados do favorecido ou enviar o comprovante, utilize os botões <strong className="text-slate-900 font-extrabold font-sans">Pagar PIX 💵</strong> e <strong className="text-slate-900 font-extrabold font-sans">WhatsApp 💬</strong> ao lado da sua de reserva acima.
                </p>
              </div>
            )}

            {/* FLOAT CHECKOUT POP-IN ON MOBILE SCENARIOS */}
            {selectedCampaign && selectedNumbers.length > 0 && (
              <div className="fixed bottom-[60px] left-3.5 right-3.5 z-45 p-3.5 bg-slate-900/95 backdrop-blur-md text-white shadow-2xl flex lg:hidden items-center justify-between animate-slideUp select-none rounded-2xl border border-slate-800/80">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none">Total Selecionado</span>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-xs font-black text-white">
                      {selectedNumbers.length} {selectedNumbers.length === 1 ? "cota" : "cotas"}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">•</span>
                    <span className="text-sm font-extrabold text-emerald-400 font-mono">
                      R$ {(() => {
                        const calc = getDiscountedPrice(selectedNumbers.length, selectedCampaign.ticketPrice, selectedCampaign.progressiveDiscounts, userProfile?.isVip, settings?.vipDiscountPercentage);
                        return calc.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedNumbers([])}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold transition active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={handleReserveTickets}
                    disabled={reserving}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11.5px] font-black transition shadow-md shadow-emerald-500/15 cursor-pointer flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50 uppercase tracking-wider whitespace-nowrap"
                  >
                    {reserving ? "Reservando..." : "Confirmar 💳"}
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
                <span className="text-[9.5px]">Minhas Compras</span>
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
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                  activeTab === "ranking" ? "text-indigo-650 font-black scale-105" : "text-slate-450 hover:text-slate-755"
                }`}
              >
                <Trophy className={`w-4.5 h-4.5 mb-1 ${activeTab === "ranking" ? "text-amber-500" : "text-slate-400"}`} />
                <span className="text-[9.5px]">Ranking</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("ganhadores");
                  setSuccessReserved(null);
                }}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                  activeTab === "ganhadores" ? "text-indigo-650 font-black scale-105" : "text-slate-450 hover:text-slate-755"
                }`}
              >
                <Crown className={`w-4.5 h-4.5 mb-1 ${activeTab === "ganhadores" ? "text-amber-500" : "text-slate-400"}`} />
                <span className="text-[9.5px]">Ganhadores</span>
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
                    <span className="text-sm font-bold text-slate-800">{userProfile?.name || ""}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">E-mail de Autenticação</span>
                    <span className="text-sm font-semibold text-slate-705 font-mono">{userProfile?.email || ""}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">CPF (Tratado p/ antifraude)</span>
                    <span className="text-sm font-mono text-slate-805 font-bold">{userProfile?.cpf || ""}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">WhatsApp / Celular</span>
                    <span className="text-sm font-semibold text-slate-805 font-mono">{userProfile?.phone || ""}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl md:col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Cidade do Usuário</span>
                    <span className="text-xs font-semibold text-slate-750">{userProfile?.city || ""}</span>
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
                  const userUidStr = userProfile?.uid || "GUEST";
                  const combinedAuth = `${ticketModalConfig.campaign.id.slice(0, 6)}-LOTE-${purchasedNumbers.slice(0, 3).join("-")}-${userUidStr.slice(0, 5)}`.toUpperCase();

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
                            <span className="font-sans font-extrabold truncate block text-emerald-950 text-xs">{userProfile?.name || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">DOCUMENTO / CPF</span>
                            <span className="block truncate text-xs font-bold">{userProfile?.cpf || "Tratado"}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-emerald-700 block uppercase font-bold text-[7px]">WHATSAPP / CONTATO</span>
                            <span className="block text-xs">{userProfile?.phone || "Informado"}</span>
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
                    const userUidSafe = userProfile?.uid || "GUEST";
                    const keyList = ticketModalConfig.tickets.map((t) => `[Cota #${t.number}: ${ticketModalConfig.campaign.id.slice(0, 6).toUpperCase()}-${t.number}-${userUidSafe.slice(0, 6).toUpperCase()}-APOSTADO]`).join("\n");
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
NOME: ${userProfile?.name || "N/A"}
E-MAIL: ${userProfile?.email || "N/A"}
CPF: ${userProfile?.cpf || "Tratado"}
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
          isAdmin={userProfile?.role === "admin"}
        />
      )}

      {activeTab === "ganhadores" && (
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 animate-fadeIn select-none pb-24 md:pb-12 px-4 sm:px-0 mt-6">
          
          {/* Header Hero Banner */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-xl border border-white/5">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <span className="text-[10px] bg-amber-500 text-slate-950 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                  Galeria de Honra • Transparência 🏆
                </span>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">Galeria de Ganhadores</h2>
                <p className="text-slate-300 text-xs md:text-sm max-w-xl leading-relaxed">
                  Confira os grandes ganhadores de cada edição das rifas da Comissão de Formatura homologados com transparência através dos resultados oficiais da Loteria Federal.
                </p>
              </div>

              {/* Statistics counter box */}
              {(() => {
                const totalFinished = campaigns.filter(c => c.status === "drawn" || c.winningNumber).length;
                return (
                  <div className="flex bg-white/10 backdrop-blur-sm border border-white/10 p-4 rounded-2xl items-center gap-3 shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-2xl font-bold text-slate-900 shadow-md">
                      👑
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">Campanhas Concluídas</span>
                      <strong className="text-2xl font-black text-white">{totalFinished}</strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* List of Closed Campaigns & Winners */}
          <div className="space-y-6">
            {(() => {
              const closed = campaigns.filter(c => c.status === "drawn" || c.winningNumber);

              if (closed.length === 0) {
                return (
                  <div className="bg-white border border-slate-150 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4 shadow-sm animate-fadeIn">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl mx-auto shadow-inner text-slate-400">
                      🏅
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="font-extrabold text-slate-750 text-sm md:text-base">Nenhum sorteio encerrado no momento</h4>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        Que ótimo sinal! Todas as nossas rifas de formatura estão ativas com cotas disponíveis para você concorrer aos prêmios. Adquira seus números e faça parte desta história de vitória!
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab("rifas")}
                      className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 mx-auto"
                    >
                      <TicketIcon className="w-4 h-4 text-white" />
                      <span>Ver Campanhas Ativas</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {closed.map((camp) => {
                    // Try to resolve the winning ticket data
                    const campTickets = allReservations[camp.id] || [];
                    const winnerTicket = camp.winningNumber 
                      ? campTickets.find((t) => t.number === camp.winningNumber)
                      : null;

                    // Calculate total stats
                    const totalCotas = camp.totalTickets;
                    const vendidosCount = campTickets.filter(t => t.status === "confirmed").length;

                    return (
                      <div
                        key={camp.id}
                        className="bg-white rounded-3xl border border-slate-200/80 shadow-md hover:shadow-lg transition-all animate-fadeIn relative overflow-hidden flex flex-col justify-between"
                      >
                        {/* Upper image header and details */}
                        <div>
                          <div className="relative aspect-[16/9] w-full bg-slate-100 border-b border-slate-150 overflow-hidden">
                            <img
                              src={camp.imageUrl || getCampaignPlaceholderImage(camp.title, camp.id)}
                              alt={camp.title}
                              className="w-full h-full object-cover select-none"
                              referrerPolicy="no-referrer"
                            />
                            {/* Floating category badge and concluded tag */}
                            <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-sm text-amber-400 text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1 shadow-md">
                              <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Sorteio Realizado</span>
                            </div>

                            <div className="absolute top-3 right-3 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-white/5">
                              {camp.drawDate ? camp.drawDate.split("-").reverse().join("/") : "Finalizado"}
                            </div>

                            {/* Prominent Golden Cota overlay */}
                            <div className="absolute bottom-3 right-3 bg-slate-950/90 backdrop-blur-md px-3.5 py-2 rounded-xl flex items-center gap-2 border border-white/10">
                              <span className="text-[10px] text-slate-300 font-extrabold uppercase">Cota Sorteada:</span>
                              <strong className="text-lg font-mono text-amber-400 font-black">
                                #{camp.winningNumber || "N/A"}
                              </strong>
                            </div>
                          </div>

                          {/* Content body */}
                          <div className="p-5 md:p-6 space-y-4">
                            <div className="space-y-1">
                              <h3 className="font-extrabold text-slate-800 text-sm md:text-base tracking-tight leading-snug line-clamp-2">
                                {camp.title}
                              </h3>
                              <p className="text-[11px] text-slate-400 line-clamp-2">
                                {camp.description ? stripHtml(camp.description) : "Conclusão e auditoria de premiação beneficente."}
                              </p>
                            </div>

                            {/* Winner Certificate design card */}
                            <div className="bg-gradient-to-br from-amber-500/5 to-yellow-500/10 border border-amber-350/40 rounded-2xl p-4 relative overflow-hidden flex items-center gap-4">
                              {/* Shiny sparkles badge in background */}
                              <div className="absolute right-3 top-3 opacity-15 rotate-12 text-amber-500">
                                <Trophy className="w-14 h-14" />
                              </div>

                              {winnerTicket ? (
                                <div className="flex gap-3.5 items-center w-full relative z-10">
                                  <div className="w-12 h-12 rounded-full bg-amber-400/20 text-xl flex items-center justify-center text-amber-650 shrink-0 select-none animate-pulse">
                                    🎓
                                  </div>
                                  <div className="flex-1 space-y-0.5">
                                    <span className="text-[9.5px] text-amber-800 font-extrabold uppercase tracking-wide flex items-center gap-1">
                                      <Crown className="w-3 h-3 text-amber-650" />
                                      Ganhador(a) Oficial
                                    </span>
                                    <h4 className="text-xs md:text-sm font-black text-slate-850 truncate">
                                      {userProfile?.role === "admin"
                                        ? winnerTicket.buyerName
                                        : maskWinnerName(winnerTicket.buyerName || "")}
                                    </h4>
                                    <p className="text-[10.5px] text-slate-500 flex flex-wrap items-center gap-1.5 font-mono">
                                      <span>Cota #{winnerTicket.number}</span>
                                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                                      <span>Compra: {winnerTicket.confirmedAt ? new Date(winnerTicket.confirmedAt).toLocaleDateString("pt-BR") : "Confirmado"}</span>
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-3.5 items-center w-full relative z-10">
                                  <div className="w-12 h-12 rounded-full bg-slate-100 text-xl flex items-center justify-center text-slate-450 shrink-0">
                                    🔒
                                  </div>
                                  <div className="flex-1 space-y-0.5 mt-0.5">
                                    <span className="text-[9px] text-slate-450 font-black uppercase tracking-wider block">Acumulado</span>
                                    <h4 className="text-xs font-extrabold text-slate-650">Cota Não Adquirida</h4>
                                    <p className="text-[10px] text-slate-500 leading-snug">
                                      Nenhum participante comprou o número <strong>#{camp.winningNumber}</strong> nesta edição.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card bottom details & statistics footer */}
                        <div className="bg-slate-50 px-5 md:px-6 py-4 flex items-center justify-between border-t border-slate-150 rounded-b-3xl select-none">
                          <div className="flex gap-4 text-[9.5px] text-slate-500 font-bold select-none font-mono">
                            <div>
                              <span>Cotas: <strong className="text-slate-800 font-black">{totalCotas}</strong></span>
                            </div>
                            <span className="text-slate-200">|</span>
                            <div>
                              <span>Vendidas: <strong className="text-indigo-650 font-black">{vendidosCount}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-black text-indigo-705">
                            {camp.drawMode === "express" ? (
                              <span className="inline-flex items-center gap-1.5 bg-purple-100/70 text-purple-800 border border-purple-200/50 px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wide font-sans cursor-help" title="O sorteio ocorre instantaneamente no momento em que todas as cotas forem cheias e confirmadas pelo administrador.">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                                <span>Sorteio Express</span>
                              </span>
                            ) : (
                              <>
                                <span>Concurso Loteria Federal:</span>
                                <strong className="text-slate-800 font-mono">#{camp.federalLotteryDrawId || "Oficial"}</strong>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
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
