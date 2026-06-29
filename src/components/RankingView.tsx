import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Campaign, Ticket } from "../types";
import { Trophy, Medal, Crown, Star, ShieldCheck, Ticket as TicketIcon, Search, Sparkles, Filter, ChevronRight, Award, ShoppingBag, Loader2 } from "lucide-react";
import { maskPhoneNumber } from "../utils/validation";

interface RankingViewProps {
  campaigns: Campaign[];
  allReservations: { [campaignId: string]: Ticket[] };
  loading: boolean;
  isAdmin?: boolean;
}

interface BuyerStats {
  buyerUid: string;
  name: string;
  phone: string;
  totalCount: number;
  confirmedCount: number;
  reservedCount: number;
  campaignsCount: number;
}

function RankingView({ campaigns, allReservations, loading, isAdmin = false }: RankingViewProps) {
  const [rankingType, setRankingType] = useState<"global" | "campaign">("global");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize selected campaign ID once campaigns are loaded
  React.useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaignId) {
      const active = campaigns.find((c) => c.status === "active") || campaigns[0];
      setSelectedCampaignId(active.id);
    }
  }, [campaigns, selectedCampaignId]);

  // Helper helper to mask the name (e.g. "João Silva" -> "João S.")
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

  // 1. Process Global Ranking
  const globalLeaderboard = useMemo(() => {
    const buyerMap: { [uid: string]: { name: string; phone: string; campaignIds: Set<string>; tickets: Ticket[] } } = {};

    Object.entries(allReservations).forEach(([campaignId, tickets]) => {
      tickets.forEach((t) => {
        if (!t.buyerUid) return;
        if (t.status === "available") return; // skip if available

        if (!buyerMap[t.buyerUid]) {
          buyerMap[t.buyerUid] = {
            name: t.buyerName || "Participante Anônimo",
            phone: t.buyerPhone || "",
            campaignIds: new Set<string>(),
            tickets: []
          };
        }
        buyerMap[t.buyerUid].campaignIds.add(campaignId);
        buyerMap[t.buyerUid].tickets.push(t);
      });
    });

    return Object.entries(buyerMap)
      .map(([uid, data]) => {
        const confirmedCount = data.tickets.filter((t) => t.status === "confirmed").length;
        const reservedCount = data.tickets.filter((t) => t.status === "reserved").length;
        return {
          buyerUid: uid,
          name: data.name,
          phone: data.phone,
          totalCount: data.tickets.length,
          confirmedCount,
          reservedCount,
          campaignsCount: data.campaignIds.size
        } as BuyerStats;
      })
      .sort((a, b) => {
        // Sort by total count descending, then by confirmed count
        if (b.totalCount !== a.totalCount) {
          return b.totalCount - a.totalCount;
        }
        return b.confirmedCount - a.confirmedCount;
      });
  }, [allReservations]);

  // 2. Process Specific Campaign Ranking
  const campaignLeaderboard = useMemo(() => {
    if (!selectedCampaignId) return [];
    const tickets = allReservations[selectedCampaignId] || [];
    const buyerMap: { [uid: string]: { name: string; phone: string; tickets: Ticket[] } } = {};

    tickets.forEach((t) => {
      if (!t.buyerUid) return;
      if (t.status === "available") return;

      if (!buyerMap[t.buyerUid]) {
        buyerMap[t.buyerUid] = {
          name: t.buyerName || "Participante Anônimo",
          phone: t.buyerPhone || "",
          tickets: []
        };
      }
      buyerMap[t.buyerUid].tickets.push(t);
    });

    return Object.entries(buyerMap)
      .map(([uid, data]) => {
        const confirmedCount = data.tickets.filter((t) => t.status === "confirmed").length;
        const reservedCount = data.tickets.filter((t) => t.status === "reserved").length;
        return {
          buyerUid: uid,
          name: data.name,
          phone: data.phone,
          totalCount: data.tickets.length,
          confirmedCount,
          reservedCount,
          campaignsCount: 1
        } as BuyerStats;
      })
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) {
          return b.totalCount - a.totalCount;
        }
        return b.confirmedCount - a.confirmedCount;
      });
  }, [allReservations, selectedCampaignId]);

  // Choose the active list
  const activeList = rankingType === "global" ? globalLeaderboard : campaignLeaderboard;

  // Filter based on search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return activeList;
    const q = searchQuery.toLowerCase().trim();
    return activeList.filter((b) => b.name.toLowerCase().includes(q));
  }, [activeList, searchQuery]);

  // Split list to Top 3 (Podium) and others (Rest of the board)
  const podium = useMemo(() => {
    return filteredList.slice(0, 3);
  }, [filteredList]);

  const restOfList = useMemo(() => {
    return filteredList.slice(3);
  }, [filteredList]);

  // Get current chosen campaign name or details
  const activeCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === selectedCampaignId);
  }, [campaigns, selectedCampaignId]);

  return (
    <div className="space-y-6 md:space-y-8 animate-fadeIn">
      {/* Intro Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 md:p-6 rounded-3xl border border-slate-200/50 shadow-sm">
        <div>
          <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Trophy className="w-5.5 h-5.5 text-amber-500 shrink-0 animate-bounce" />
            <span>Ranking de Compradores</span>
          </h2>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            Acompanhe em tempo real os maiores apoiadores da minha formatura! Agradeço imensamente o apoio de cada um.
          </p>
        </div>

        {/* Tab selector */}
        <div className="bg-slate-100 border border-slate-200/55 p-1 rounded-2xl flex gap-1.5 w-full md:w-auto shrink-0 select-none text-[11px] font-bold">
          <button
            type="button"
            onClick={() => {
              setRankingType("global");
              setSearchQuery("");
            }}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
              rankingType === "global"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Ranking Global</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRankingType("campaign");
              setSearchQuery("");
            }}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
              rankingType === "campaign"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5 text-emerald-600" />
            <span>Por Ação / Rifa</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/50">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
          <p className="text-slate-500 text-xs font-semibold">Buscando dados de compradores...</p>
        </div>
      ) : (
        <>
          {/* Action-specific selection header if in action-view mode */}
          {rankingType === "campaign" && campaigns.length > 0 && (
            <div className="bg-emerald-50/50 border border-emerald-100/70 p-4 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="space-y-0.5">
                <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-widest block">Ação Selecionada</span>
                <span className="text-xs font-bold text-slate-800">{activeCampaign?.title || "Rifa"}</span>
              </div>
              <div className="relative w-full sm:w-72 shadow-sm rounded-xl">
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full bg-white text-slate-700 text-xs font-bold border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 transition cursor-pointer appearance-none"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.status === "active" ? "Ativa" : "Sorteada"})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Filter className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          )}

          {filteredList.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border border-dashed border-slate-150 animate-fadeIn">
              <Trophy className="w-10 h-10 mx-auto text-slate-300 mb-2.5" />
              <h4 className="text-slate-700 font-bold text-sm">Nenhum comprador registrado ainda</h4>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                {searchQuery ? "Nenhum resultado corresponde à sua busca de nome." : "Os bilhetes desta campanha ainda estão disponíveis para reserva!"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* PODIUM AREA (TOP 3) */}
              {podium.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end justify-center select-none">
                  {/* SECOND PLACE */}
                  {podium[1] && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-white rounded-3xl border border-slate-205 border-t-silver-400 p-5 shadow-xs flex flex-col items-center text-center relative order-2 md:order-1 h-52 self-end"
                    >
                      <div className="absolute -top-4 bg-slate-100 border border-slate-300 text-slate-700 font-black text-xs w-8 h-8 rounded-full flex items-center justify-center shadow-md">
                        2º
                      </div>
                      <div className="w-14 h-14 bg-slate-50 border border-slate-150 rounded-full flex items-center justify-center mt-2 relative">
                        <Medal className="w-7 h-7 text-slate-400" />
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-600 border-2 border-white">2</span>
                      </div>
                      <h4 className="text-xs font-black text-slate-850 mt-3 truncate w-full">
                        {formatMaskedName(podium[1].name)}
                      </h4>
                      <p className="text-indigo-600 font-mono font-black text-sm mt-1.5">
                        {podium[1].totalCount} <span className="text-[10px] text-slate-450 font-sans font-medium">cotas</span>
                      </p>
                      
                      {/* confirmed / pending breakdown micro-pills */}
                      <div className="flex gap-1.5 mt-3 text-[9px] font-bold">
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
                          {podium[1].confirmedCount} Conf.
                        </span>
                        {podium[1].reservedCount > 0 && (
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100">
                            {podium[1].reservedCount} Pend.
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* FIRST PLACE */}
                  {podium[0] && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-b from-amber-50/40 via-white to-white rounded-3xl border-2 border-amber-300 p-6 shadow-md flex flex-col items-center text-center relative order-1 md:order-2 h-60"
                    >
                      <div className="absolute -top-5.5 bg-amber-400 border-2 border-amber-200 text-amber-950 font-black text-sm w-10 h-10 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                        <Crown className="w-5.5 h-5.5 fill-amber-300" />
                      </div>
                      <div className="w-18 h-18 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mt-2 relative shadow-inner">
                        <Trophy className="w-9 h-9 text-amber-500" />
                        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white border-2 border-white">1</span>
                      </div>
                      <h4 className="text-sm font-extrabold text-amber-950 mt-4 truncate w-full flex items-center justify-center gap-1">
                        <span>{formatMaskedName(podium[0].name)}</span>
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      </h4>
                      <p className="text-amber-600 font-mono font-black text-base mt-1.5">
                        {podium[0].totalCount} <span className="text-xs text-amber-800/70 font-sans font-medium">cotas</span>
                      </p>

                      {/* confirmed / pending breakdown micro-pills */}
                      <div className="flex gap-1.5 mt-3 text-[9px] font-bold">
                        <span className="bg-emerald-600 text-white px-2.5 py-0.5 rounded-md shadow-xs">
                          {podium[0].confirmedCount} Conf.
                        </span>
                        {podium[0].reservedCount > 0 && (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                            {podium[0].reservedCount} Pend.
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* THIRD PLACE */}
                  {podium[2] && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-white rounded-3xl border border-slate-205 border-t-amber-150 p-5 shadow-xs flex flex-col items-center text-center relative order-3 h-52 self-end"
                    >
                      <div className="absolute -top-4 bg-slate-50 border border-amber-200 text-amber-800 font-black text-xs w-8 h-8 rounded-full flex items-center justify-center shadow-md">
                        3º
                      </div>
                      <div className="w-14 h-14 bg-amber-50/20 border border-amber-100 rounded-full flex items-center justify-center mt-2 relative">
                        <Award className="w-7 h-7 text-amber-700" />
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-150 text-[10px] font-black text-amber-900 border-2 border-white">3</span>
                      </div>
                      <h4 className="text-xs font-black text-slate-850 mt-3 truncate w-full">
                        {formatMaskedName(podium[2].name)}
                      </h4>
                      <p className="text-indigo-600 font-mono font-black text-sm mt-1.5">
                        {podium[2].totalCount} <span className="text-[10px] text-slate-450 font-sans font-medium">cotas</span>
                      </p>

                      {/* confirmed / pending breakdown micro-pills */}
                      <div className="flex gap-1.5 mt-3 text-[9px] font-bold">
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
                          {podium[2].confirmedCount} Conf.
                        </span>
                        {podium[2].reservedCount > 0 && (
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100">
                            {podium[2].reservedCount} Pend.
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* SEARCH FILTER */}
              <div className="relative max-w-sm ml-auto">
                <input
                  type="text"
                  placeholder="Pesquisar por nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white text-slate-750 text-xs border border-slate-200 rounded-2xl pl-9 pr-3.5 py-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* TABLE BOARD (REST OF THE LIST) */}
              <div className="bg-white rounded-3xl border border-slate-200/50 shadow-sm overflow-hidden select-none">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Apoiadores na Fila</span>
                  <span className="text-[10px] text-slate-400 font-mono font-bold">{filteredList.length} Compradores</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredList.map((buyer, index) => {
                    const position = index + 1;
                    const confirmedPct = buyer.totalCount > 0 ? (buyer.confirmedCount / buyer.totalCount) * 100 : 0;
                    
                    return (
                      <div key={buyer.buyerUid} className="p-4 md:p-5 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                        
                        {/* Position & Names */}
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Position Badge with styling */}
                          <div className={`w-7 h-7 rounded-lg font-mono text-xs font-black flex items-center justify-center shrink-0 ${
                            position === 1 ? "bg-amber-500 text-white shadow-xs" 
                            : position === 2 ? "bg-slate-300 text-slate-800" 
                            : position === 3 ? "bg-amber-200 text-amber-900" 
                            : "bg-slate-100 text-slate-500"
                          }`}>
                            {position}
                          </div>

                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 truncate block">
                              {formatMaskedName(buyer.name)}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-450">
                              <span>{buyer.phone ? `Whats: ${isAdmin ? buyer.phone : maskPhoneNumber(buyer.phone)}` : "Contato seguro"}</span>
                              {rankingType === "global" && (
                                <>
                                  <span className="text-[6px] text-slate-300">•</span>
                                  <span className="text-indigo-650 font-semibold">{buyer.campaignsCount} {buyer.campaignsCount > 1 ? "ações" : "ação"}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Middle Progress bar status (Visible on larger screens) */}
                        <div className="hidden sm:flex flex-col flex-1 max-w-xs mx-auto space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold">
                            <span className="text-emerald-700">{buyer.confirmedCount} Pago(s)</span>
                            <span className="text-slate-400">{buyer.totalCount} Total</span>
                          </div>
                          
                          {/* Segmented bar representation */}
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                            <div 
                              style={{ width: `${confirmedPct}%` }}
                              className="h-full bg-emerald-500"
                            />
                            <div 
                              style={{ width: `${100 - confirmedPct}%` }}
                              className="h-full bg-amber-400/80"
                            />
                          </div>
                        </div>

                        {/* Right stats counters */}
                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div className="space-y-0.5">
                            <span className="text-xs text-slate-800 font-mono font-black block">
                              {buyer.totalCount} <span className="text-[10px] font-sans font-medium text-slate-450">cotas</span>
                            </span>
                            <div className="flex items-center gap-1 bg-emerald-50 text-[9px] text-emerald-700 font-black px-1.5 py-0.5 rounded border border-emerald-100/60 justify-end">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{buyer.confirmedCount} Pago</span>
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mini regulatory details below */}
      <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-center gap-2 text-[11px] text-slate-500 leading-relaxed max-w-xl mx-auto">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Garantia de Privacidade (LGPD):</strong> Os sobrenomes e contatos dos compradores estão devidamente ocultados por padrão para manter a total integridade de imagem e conformidade nacional.
        </span>
      </div>
    </div>
  );
}

export default React.memo(RankingView);
