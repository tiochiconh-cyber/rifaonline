import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Trophy, PencilLine, Check, TrendingUp, Sparkles, Coins, Landmark } from "lucide-react";
import { Campaign, Ticket } from "../types";

interface GraduationGoalWidgetProps {
  campaigns: Campaign[];
  allReservations: { [campaignId: string]: Ticket[] };
}

function GraduationGoalWidget({ campaigns, allReservations }: GraduationGoalWidgetProps) {
  const [goalAmount, setGoalAmount] = useState<number>(30000);
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(true);

  // Listen to Firestore for graduationGoalAmount
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (typeof data.graduationGoalAmount === "number") {
          setGoalAmount(data.graduationGoalAmount);
          setInputVal(data.graduationGoalAmount.toString());
        } else {
          // If not configured, set/initialize it safely
          setGoalAmount(30000); // R$ 30.000 default
          setInputVal("30000");
        }
      }
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar meta de formatura:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Compute live revenue statistics from props
  const stats = useMemo(() => {
    let confirmed = 0;
    let pending = 0;

    campaigns.forEach((camp) => {
      const tickets = allReservations[camp.id] || [];
      tickets.forEach((t) => {
        if (t.status === "confirmed") {
          confirmed += camp.ticketPrice;
        } else if (t.status === "reserved") {
          pending += camp.ticketPrice;
        }
      });
    });

    return { confirmed, pending };
  }, [campaigns, allReservations]);

  const handleSaveGoal = async () => {
    const parsed = parseFloat(inputVal.replace(/[^\d.,]/g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      alert("Por favor, digite um valor de meta válido e maior que zero.");
      return;
    }

    try {
      await updateDoc(doc(db, "settings", "global"), {
        graduationGoalAmount: parsed
      });
      setGoalAmount(parsed);
      setIsEditing(false);
    } catch (err) {
      console.error("Erro ao salvar meta:", err);
      alert("Não foi possível salvar a meta de formatura no banco.");
    }
  };

  const totalRevenue = stats.confirmed;
  const potentialRevenue = stats.confirmed + stats.pending;

  const paidPercent = goalAmount > 0 ? (totalRevenue / goalAmount) * 100 : 0;
  const pendingPercent = goalAmount > 0 ? (stats.pending / goalAmount) * 100 : 0;
  const totalPercent = Math.min(100, paidPercent + pendingPercent);

  // Milestones markers
  const milestones = [
    { percent: 25, label: "Primeiras Cotas" },
    { percent: 50, label: "Reserva do Salão" },
    { percent: 75, label: "Atração e Som" },
    { percent: 100, label: "Formatura 100%! 🎉" }
  ];

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-6 flex items-center justify-center h-48 animate-pulse text-slate-400">
        Carregando meta de formatura...
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-150 p-6 rounded-2xl shadow-xs relative overflow-hidden group">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 -z-10 group-hover:opacity-75 transition-opacity" />

      {/* Header Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 flex items-center justify-center shadow-3xs">
            <Trophy className="w-5 h-5 animate-bounce-slow" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-1.5 pt-0.5">
              Meta da Formatura
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Oficial
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">Acompanhamento em tempo real da arrecadação com base nos bilhetes vendidos.</p>
          </div>
        </div>

        {/* Interactive Goal adjustment */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-3xs">
              <span className="text-xs text-slate-400 font-bold px-1.5 font-mono">R$</span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="w-24 text-xs font-bold text-slate-850 outline-none font-mono py-1 rounded bg-slate-50 px-2 text-center"
                placeholder="Meta"
              />
              <button
                onClick={handleSaveGoal}
                className="p-1 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" /> Salvar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Meta configurada:</span>
              <strong className="text-sm font-mono text-slate-850 bg-slate-100/75 border border-slate-200/50 px-2.5 py-1 rounded-xl">
                R$ {goalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-150 rounded-xl text-slate-500 hover:text-indigo-600 transition shadow-3xs cursor-pointer"
                title="Ajustar Meta da Formatura"
              >
                <PencilLine className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main visualization grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left Stats card */}
        <div className="md:col-span-4 space-y-4">
          <div className="bg-white border text-xs rounded-xl p-4 shadow-3xs space-y-3.5">
            <div>
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">
                Total Confirmado (PIX Pago)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-extrabold font-mono text-lg text-slate-800">
                  R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold font-mono">
                  ({paidPercent.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-100 pt-3">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-450 block mb-1">
                Potencial unificado (Pago + Pendente)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-bold font-mono text-sm text-slate-700">
                  R$ {potentialRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold font-mono">
                  ({(paidPercent + pendingPercent).toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 items-center bg-indigo-50/40 p-3 rounded-xl border border-indigo-100/30 text-[10px] text-slate-650">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-550 shrink-0" />
            <span>
              {paidPercent >= 100 ? (
                <strong className="text-indigo-700 font-bold">Incrível! Meta concluída com sucesso! 🚀</strong>
              ) : (
                <>Faltam <strong className="font-semibold text-indigo-700 font-mono">R$ {Math.max(0, goalAmount - totalRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong> confirmados para o objetivo.</>
              )}
            </span>
          </div>
        </div>

        {/* Right chart visualizer */}
        <div className="md:col-span-8 space-y-6">
          <div className="relative pt-3 pb-8">
            {/* The multi-layered progress bar */}
            <div className="h-6 w-full bg-slate-200/60 border border-slate-200/30 rounded-full overflow-hidden relative shadow-inner">
              {/* Confirmed / paid progress bar */}
              <div
                style={{ width: `${Math.min(100, paidPercent)}%` }}
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 absolute top-0 left-0 transition-all duration-1000 ease-out flex items-center justify-end pr-2 shadow-[inset_-3px_0_8px_rgba(0,0,0,0.15)]"
              >
                {paidPercent > 12 && (
                  <span className="text-[9px] font-mono font-bold text-white drop-shadow-xs animate-fadeIn whitespace-nowrap">
                    {paidPercent.toFixed(1)}% Pago
                  </span>
                )}
              </div>

              {/* Pending / reserved progress bar overlapping right after paid */}
              <div
                style={{
                  left: `${Math.min(100, paidPercent)}%`,
                  width: `${Math.min(100 - Math.min(100, paidPercent), pendingPercent)}%`
                }}
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 absolute top-0 transition-all duration-1000 ease-out animate-pulse opacity-90 border-l border-white/20 flex items-center justify-end pr-1 text-white text-[8px] font-bold shadow-sm"
              >
                {pendingPercent > 8 && (
                  <span className="text-[8px] font-mono drop-shadow-xs whitespace-nowrap tracking-tighter">
                    +{pendingPercent.toFixed(1)}% pendente
                  </span>
                )}
              </div>

              {/* Subtle shining light sweep */}
              <div className="absolute top-0 inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-30 animate-shimmer pointer-events-none" />
            </div>

            {/* Render Milestones dots and indicators */}
            <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none mt-2">
              {milestones.map((m) => {
                const isReached = paidPercent >= m.percent;
                const isPartiallyReached = (paidPercent + pendingPercent) >= m.percent;
                return (
                  <div
                    key={m.percent}
                    style={{ left: `${m.percent}%` }}
                    className="absolute -top-1 transform -translate-x-1/2 flex flex-col items-center z-10"
                  >
                    {/* The landmark dot */}
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                        isReached
                          ? "bg-indigo-600 border-white shadow-md ring-2 ring-indigo-100 scale-110"
                          : isPartiallyReached
                          ? "bg-amber-400 border-white shadow-xs"
                          : "bg-white border-slate-300"
                      }`}
                    >
                      {isReached && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                    </div>

                    {/* Milestone label/annotation */}
                    <span
                      className={`text-[9px] mt-6 font-bold whitespace-nowrap transition-colors duration-300 ${
                        isReached
                          ? "text-indigo-650"
                          : isPartiallyReached
                          ? "text-amber-700"
                          : "text-slate-400"
                      }`}
                    >
                      {m.percent}% ({m.label})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sparkly positive state callout cards when goal meets criteria */}
          {paidPercent >= 100 ? (
            <div className="bg-emerald-50 border border-emerald-150 p-3.5 rounded-xl flex items-center gap-3 animate-fadeIn text-slate-700 shadow-3xs">
              <div className="p-2 bg-emerald-500 text-white rounded-lg">
                <Sparkles className="w-4 h-4 animate-spin-slow" />
              </div>
              <div>
                <strong className="text-emerald-800 text-xs block font-extrabold">Parabéns! 100% Arrecadado!</strong>
                <p className="text-[10px] text-emerald-600 font-medium">O Chiquinho atingiu a meta estipulada para a formatura. Todos os pagamentos foram devidamente validados!</p>
              </div>
            </div>
          ) : paidPercent + pendingPercent >= 100 ? (
            <div className="bg-amber-50 border border-amber-100/75 p-3.5 rounded-xl flex items-center gap-3 animate-fadeIn text-slate-700 shadow-3xs">
              <div className="p-2 bg-amber-400 text-white rounded-lg">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <strong className="text-amber-800 text-xs block font-bold">Quase lá com as reservas pendentes!</strong>
                <p className="text-[10px] text-amber-600 font-medium">Confirmando as reservas e depósitos PIX pendentes na fila, a meta de formatura será 100% vencida com sucesso!</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default React.memo(GraduationGoalWidget);

