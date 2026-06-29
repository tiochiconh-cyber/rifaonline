import React, { useState, useEffect } from "react";
import { Campaign } from "../types";
import { Calculator, HelpCircle, ArrowRight, DollarSign, Percent, TrendingUp, AlertCircle, ShieldCheck, ShoppingCart } from "lucide-react";

interface PricingDashboardProps {
  campaigns: Campaign[];
}

function PricingDashboard({ campaigns }: PricingDashboardProps) {
  // Simulation raw states
  const [prizeCost, setPrizeCost] = useState<number>(1500);
  const [marketingCost, setMarketingCost] = useState<number>(300);
  const [ticketCount, setTicketCount] = useState<number>(1000);
  const [ticketPrice, setTicketPrice] = useState<number>(5.00);
  const [avgDiscountShare, setAvgDiscountShare] = useState<number>(20); // % of tickets sold with discount
  const [avgDiscountPerc, setAvgDiscountPerc] = useState<number>(15); // Average discount on promotional purchases %
  
  // Goal and target states
  const [targetProfit, setTargetProfit] = useState<number>(3000);
  
  // Selected Campaign to import values
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");

  // Load imported values from campaigns
  useEffect(() => {
    if (selectedCampaignId) {
      const camp = campaigns.find(c => c.id === selectedCampaignId);
      if (camp) {
        setTicketCount(camp.totalTickets);
        setTicketPrice(camp.ticketPrice);
        // Estimate progressive discount impact if discount rules exist
        if (camp.progressiveDiscounts && camp.progressiveDiscounts.length > 0) {
          setAvgDiscountShare(30); // default guess for promo behavior
          // estimate a discount pct based on progressive rates
          const maxDisc = camp.progressiveDiscounts[0].discountPercentage || 10;
          setAvgDiscountPerc(maxDisc);
        } else {
          setAvgDiscountShare(0);
        }
      }
    }
  }, [selectedCampaignId, campaigns]);

  // Load simulated inputs from localStorage if existing
  useEffect(() => {
    try {
      const cached = localStorage.getItem("pricing_simulation_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.prizeCost) setPrizeCost(parsed.prizeCost);
        if (parsed.marketingCost) setMarketingCost(parsed.marketingCost);
        if (parsed.ticketCount) setTicketCount(parsed.ticketCount);
        if (parsed.ticketPrice) setTicketPrice(parsed.ticketPrice);
        if (parsed.targetProfit) setTargetProfit(parsed.targetProfit);
        if (parsed.avgDiscountShare !== undefined) setAvgDiscountShare(parsed.avgDiscountShare);
        if (parsed.avgDiscountPerc !== undefined) setAvgDiscountPerc(parsed.avgDiscountPerc);
      }
    } catch (e) {
      console.warn("Could not parse simulation cached values", e);
    }
  }, []);

  // Save inputs to cache whenever they change
  const saveToCache = (updated: any) => {
    try {
      localStorage.setItem("pricing_simulation_v1", JSON.stringify({
        prizeCost,
        marketingCost,
        ticketCount,
        ticketPrice,
        targetProfit,
        avgDiscountShare,
        avgDiscountPerc,
        ...updated
      }));
    } catch (e) {}
  };

  // Calculations
  const totalCost = prizeCost + marketingCost;
  
  // Standard theoretical gross revenue
  const maxGrossRevenue = ticketCount * ticketPrice;
  
  // Impact of progressive discounts
  const discountedTicketsCount = Math.floor((ticketCount * avgDiscountShare) / 100);
  const standardTicketsCount = ticketCount - discountedTicketsCount;
  
  const avgDiscountedPrice = ticketPrice * (1 - avgDiscountPerc / 100);
  const realGrossRevenue = (standardTicketsCount * ticketPrice) + (discountedTicketsCount * avgDiscountedPrice);
  const realAvgPrice = ticketCount > 0 ? realGrossRevenue / ticketCount : 0;

  // Realized Net Profit & margins assuming 100% sales
  const netProfit = Math.max(0, realGrossRevenue - totalCost);
  const profitMarginPercent = realGrossRevenue > 0 ? (netProfit / realGrossRevenue) * 100 : 0;
  const netProfitPerTicket = ticketCount > 0 ? netProfit / ticketCount : 0;

  // Break-even points (Ponto de Equilíbrio)
  // How many tickets do we need to sell to pay the cost of prize + marketing
  // We use standard price vs real weighted average price depending on promotion simulation
  const breakevenTickets = realAvgPrice > 0 ? Math.ceil(totalCost / realAvgPrice) : 0;
  const breakevenPercent = ticketCount > 0 ? Math.min(100, (breakevenTickets / ticketCount) * 100) : 0;

  // Goal-based calculation
  // How many tickets at current average price to earn totalCost + targetProfit
  const targetRequiredRevenues = totalCost + targetProfit;
  const targetRequiredTickets = realAvgPrice > 0 ? Math.ceil(targetRequiredRevenues / realAvgPrice) : 0;
  const targetRequiredPricePerCota = ticketCount > 0 ? targetRequiredRevenues / ticketCount : 0;

  // Preset triggers
  const applyPreset = (count: number, price: number, prize: number, marketing: number) => {
    setTicketCount(count);
    setTicketPrice(price);
    setPrizeCost(prize);
    setMarketingCost(marketing);
    saveToCache({ ticketCount: count, ticketPrice: price, prizeCost: prize, marketingCost: marketing });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Calculator className="w-5 h-5" />
            </div>
            <span className="bg-indigo-100 text-indigo-800 text-[10px] uppercase font-black px-2.5 py-1 rounded-full">
              Planejamento Financeiro
            </span>
          </div>
          <h2 className="font-black text-slate-800 text-2xl mt-1.5 leading-tight">
            Dashboard de Precificação & Viabilidade
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Projete cenários realistas de faturamento, simule descontos promocionais, entenda o ponto de equilíbrio e garanta a lucratividade máxima das suas ações.
          </p>
        </div>

        {/* Campaign Data Importer dropdown */}
        {campaigns.length > 0 && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 min-w-[240px]">
            <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">
              Importar de Campanha Ativa
            </label>
            <select
              value={selectedCampaignId}
              onChange={(e) => {
                setSelectedCampaignId(e.target.value);
                saveToCache({ selectedCampaignId: e.target.value });
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-250 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">-- Escolher Campanha --</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.totalTickets} cotas)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick Simulated Presets Panel */}
      <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wide block mb-2.5">
          📈 Modelos Rápidos de Simulação (Sugestões de Rifas Comuns)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset(1000, 10.00, 3000, 400)}
            className="p-3 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-indigo-200 rounded-xl text-left transition cursor-pointer"
          >
            <div className="font-bold text-xs text-slate-800">Intermédio Popular</div>
            <p className="text-[10px] text-slate-400 mt-0.5">1.000 cotas a R$ 10,00</p>
            <div className="text-[10px] font-mono text-indigo-600 mt-1 font-semibold">Prêmio Médio (Ex: R$ 3.000)</div>
          </button>
          
          <button
            type="button"
            onClick={() => applyPreset(10000, 2.50, 5000, 800)}
            className="p-3 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-indigo-200 rounded-xl text-left transition cursor-pointer"
          >
            <div className="font-bold text-xs text-slate-800">Volume Digital</div>
            <p className="text-[10px] text-slate-400 mt-0.5">10.000 cotas a R$ 2,50</p>
            <div className="text-[10px] font-mono text-indigo-600 mt-1 font-semibold">Cenário Redes Sociais / Influenciador</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset(100, 50.00, 1500, 200)}
            className="p-3 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-indigo-200 rounded-xl text-left transition cursor-pointer"
          >
            <div className="font-bold text-xs text-slate-800">Rifa Premium Exclusiva</div>
            <p className="text-[10px] text-slate-400 mt-0.5">100 cotas de R$ 50,00</p>
            <div className="text-[10px] font-mono text-indigo-600 mt-1 font-semibold">Alta conversão em grupos fechados</div>
          </button>
        </div>
      </div>

      {/* Main Grid: Inputs and Visual Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN (Inputs/Sliders) - spans 5 */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-150 rounded-3xl p-5 space-y-5">
            <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              Parâmetros da Ação
            </h3>

            {/* Input 1: Prize Cost */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  Custo do Prêmio / Recompensa (R$)
                  <span className="group relative">
                    <HelpCircle className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-help" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 bg-slate-900 text-[10px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 font-normal">
                      Valor investido para comprar o prêmio ou enviar via PIX ao vencedor.
                    </span>
                  </span>
                </label>
                <span className="font-mono text-xs font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-md">
                  R$ {prizeCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <input
                type="number"
                value={prizeCost}
                onChange={(e) => {
                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                  setPrizeCost(val);
                  saveToCache({ prizeCost: val });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex prime: R$ 1500"
              />
              <input
                type="range"
                min="0"
                max="15000"
                step="100"
                value={Math.min(15000, prizeCost)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPrizeCost(val);
                  saveToCache({ prizeCost: val });
                }}
                className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg"
              />
            </div>

            {/* Input 2: Marketing & Extras Cost */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  Outras Despesas / Marketing (R$)
                  <span className="group relative">
                    <HelpCircle className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-help" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 bg-slate-900 text-[10px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 font-normal">
                      Investimento com anúncios, design, combustível ou taxas da plataforma.
                    </span>
                  </span>
                </label>
                <span className="font-mono text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md">
                  R$ {marketingCost.toLocaleString("pt-BR")}
                </span>
              </div>
              <input
                type="number"
                value={marketingCost}
                onChange={(e) => {
                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                  setMarketingCost(val);
                  saveToCache({ marketingCost: val });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex: R$ 300"
              />
            </div>

            {/* Input 3: Ticket Count */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Quantidade Total de Cotas
                </label>
                <span className="font-mono text-xs font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {ticketCount.toLocaleString("pt-BR")} cotas
                </span>
              </div>
              <input
                type="number"
                value={ticketCount}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 1);
                  setTicketCount(val);
                  saveToCache({ ticketCount: val });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex: 1000"
              />
              <input
                type="range"
                min="100"
                max="50000"
                step="100"
                value={Math.min(50000, ticketCount)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setTicketCount(val);
                  saveToCache({ ticketCount: val });
                }}
                className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg"
              />
            </div>

            {/* Input 4: Ticket Price */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Valor Normal por Cota (R$)
                </label>
                <span className="font-mono text-xs font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-md">
                  R$ {ticketPrice.toFixed(2)}
                </span>
              </div>
              <input
                type="number"
                step="0.05"
                value={ticketPrice}
                onChange={(e) => {
                  const val = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                  setTicketPrice(val);
                  saveToCache({ ticketPrice: val });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                placeholder="Ex: 5"
              />
              <input
                type="range"
                min="0.10"
                max="100"
                step="0.10"
                value={Math.min(100, ticketPrice)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTicketPrice(val);
                  saveToCache({ ticketPrice: val });
                }}
                className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg"
              />
            </div>
          </div>

          {/* Progressive Discounts Simulator Sub-card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-extrabold uppercase text-slate-200 tracking-wider">
                Simulador de Descontos Progressivos
              </h4>
            </div>
            
            <p className="text-[10px] text-slate-300 leading-relaxed">
              Vendas de pacotes com desconto (Ex: "Leve 10 cotas e pague 15% a menos") diminuem o preço médio praticado por cota, mas aumentam drásticamente a velocidade de encerramento da ação.
            </p>

            <div className="space-y-3 pt-1 border-t border-white/10">
              {/* Discount Share Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-bold">% de Cotas Promocionais</span>
                  <span className="font-mono font-black text-emerald-400">{avgDiscountShare}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={avgDiscountShare}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setAvgDiscountShare(val);
                    saveToCache({ avgDiscountShare: val });
                  }}
                  className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                />
              </div>

              {/* Avg Discount rate */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-bold">Desconto médio sobre elas</span>
                  <span className="font-mono font-black text-emerald-400">{avgDiscountPerc}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={avgDiscountPerc}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setAvgDiscountPerc(val);
                    saveToCache({ avgDiscountPerc: val });
                  }}
                  className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-white/15 rounded-lg"
                />
              </div>

              {/* Dynamic feedback on discount */}
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/10 text-[9.5px] text-slate-300 flex justify-between">
                <span>Preço Médio Ajustado:</span>
                <span className="font-bold text-white font-mono">
                  R$ {realAvgPrice.toFixed(2)} / cota
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (Outputs & Metrics dashboard) - spans 7 */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Net Results & Health Index Card */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Resultado Projetado (Venda de 100%)
            </h3>

            {/* Financial health metric */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wide">
                  Índice de Lucratividade Global
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-800 tracking-tight">
                    {profitMarginPercent.toFixed(1)}%
                  </span>
                  <span className="text-sm text-slate-400 font-bold">da receita total</span>
                </div>
              </div>

              {/* Margin level badge */}
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[10px] text-slate-400 font-bold">Status do Projeto</span>
                <span className={`px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase mt-1 ${
                  profitMarginPercent > 70 ? "bg-emerald-100 text-emerald-800" :
                  profitMarginPercent > 40 ? "bg-indigo-100 text-indigo-800" :
                  profitMarginPercent > 20 ? "bg-amber-100 text-amber-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  {profitMarginPercent > 70 ? "🔥 Lucratividade Extrema" :
                   profitMarginPercent > 40 ? "✨ Excelente Viabilidade" :
                   profitMarginPercent > 20 ? "⚠️ Margem Segura" :
                   "🚨 Alerta de Risco / Margem Baixa"}
                </span>
              </div>
            </div>

            {/* Horizontal custom visual scale cost vs profit */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-bold text-slate-500">
                <span>Divisão do Faturamento</span>
                <span className="font-mono">Total Máx: R$ {realGrossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {/* Costs segment */}
                <div
                  className="bg-red-500 transition-all duration-300"
                  style={{ width: `${realGrossRevenue > 0 ? Math.min(100, (totalCost / realGrossRevenue) * 100) : 0}%` }}
                  title={`Soma de Custos: R$ ${totalCost.toFixed(2)}`}
                />
                {/* Net profits segment */}
                <div
                  className="bg-emerald-505 bg-emerald-500 transition-all duration-300 flex-1"
                  title={`Lucro Líquido Esperado: R$ ${netProfit.toFixed(2)}`}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 pt-1 font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                  <span>Soma de Custos: R$ {totalCost.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                  <span>Lucro Estimado: R$ {netProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 4 Stats Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Card 1: Faturamento Bruto */}
              <div className="p-3.5 border border-slate-150 rounded-2xl space-y-1 bg-slate-50/30">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Receita Bruta Esperada</span>
                <div className="text-lg font-black text-slate-800 font-mono">
                  R$ {realGrossRevenue.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Preço padrão praticado: R$ {ticketPrice.toFixed(2)} por bilhete.
                </p>
              </div>

              {/* Card 2: Margem Pura por cota */}
              <div className="p-3.5 border border-slate-150 rounded-2xl space-y-1 bg-slate-50/30">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Lucro Líquido por Cota</span>
                <div className="text-lg font-black text-emerald-650 font-mono">
                  R$ {netProfitPerTicket.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Retorno livre aproximado por bilhete vendido.
                </p>
              </div>

              {/* Card 3: Ponto de Equilíbrio (Breakeven) */}
              <div className="p-3.5 border border-slate-150 rounded-2xl bg-indigo-50/30 border-indigo-100 space-y-1">
                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest block">Ponto de Equilíbrio</span>
                <div className="text-lg font-black text-indigo-900 font-mono">
                  {breakevenTickets} cotas
                </div>
                <div className="text-[10px] text-indigo-700 font-bold">
                  {breakevenPercent.toFixed(1)}% das cotas da campanha
                </div>
              </div>

              {/* Card 4: Faturamento Líquido Máximo */}
              <div className="p-3.5 border border-slate-150 rounded-2xl bg-emerald-50/20 border-emerald-100 space-y-1 animate-pulse">
                <span className="text-[9px] font-bold text-emerald-650 uppercase tracking-widest block">Lucro Líquido Esperado</span>
                <div className="text-lg font-black text-emerald-800 font-mono">
                  R$ {netProfit.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Sobra em caixa livre após pagamento de todos os prêmios.
                </p>
              </div>

            </div>
          </div>

          {/* Breakeven Detail Card with banking ledger style */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-700 tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Preste atenção às cotas necessárias (Break-even):
            </h4>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Para pagar o custo da recompensa (R$ {prizeCost.toFixed(2)}) e despesas operacionais (R$ {marketingCost.toFixed(2)}), você precisa obrigatoriamente vender as primeiras <strong className="text-slate-800 font-extrabold font-mono text-xs">{breakevenTickets} cotas</strong>.
            </p>

            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-[11px] leading-relaxed font-medium">
              💡 <strong>Regra de Viabilidade:</strong> A partir da venda da cota de número <strong>{breakevenTickets + 1}</strong> você atinge margem de contribuição de 100% livre. Ou seja, todo valor arrecadado depois desse ponto entra integralmente como lucro líquido direto no seu bolso!
            </div>
          </div>

          {/* Target Profit Planner (Simulador de Metas Ativas) */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-emerald-500 rounded-full" />
              Planejador Dinâmico de Metas
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">
                  Custo Alvo de Sobra Livre (R$)
                </label>
                <input
                  type="number"
                  value={targetProfit}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setTargetProfit(val);
                    saveToCache({ targetProfit: val });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ex: R$ 5000 de lucro"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-150 flex flex-col justify-center">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">Receita Requerida Total</span>
                <span className="text-sm font-black text-slate-800 font-mono">
                  R$ {targetRequiredRevenues.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Calculations results */}
            <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Cotas vendidas no ticket atual para alcançar a meta:</span>
                <span className="font-black text-slate-900 font-mono">{targetRequiredTickets} de {ticketCount}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Preço alternativo por cota ideal (se quiser vender as {ticketCount} cotas):</span>
                <span className="font-black text-indigo-650 font-mono">R$ {targetRequiredPricePerCota.toFixed(2)} por cota</span>
              </div>
              
              {targetRequiredTickets > ticketCount ? (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-800 rounded-xl text-[10.5px]">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>
                    Atenção: A sua meta de lucro exige a venda de <strong>{targetRequiredTickets} cotas</strong>, excedendo a quantidade total disponível ({ticketCount}). Sugerimos elevar o preço por cota para no mínimo <strong>R$ {targetRequiredPricePerCota.toFixed(2)}</strong> para viabilizar.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-indigo-50 text-indigo-800 rounded-xl text-[10.5px]">
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                  <span>
                    Meta realista! Com apenas <strong>{((targetRequiredTickets / ticketCount) * 100).toFixed(0)}% de cotas comercializadas</strong> ({targetRequiredTickets} un), você já embolsa sua meta líquida de <strong>R$ {targetProfit.toLocaleString("pt-BR")}</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default React.memo(PricingDashboard);

