import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { Campaign, Ticket, UserProfile } from "../types";
import { AlertCircle, Coins, CheckCircle2, Percent, Users, TrendingUp, TrendingDown } from "lucide-react";
import RankingView from "./RankingView";
import GraduationGoalWidget from "./GraduationGoalWidget";
import { getDiscountedPrice } from "./ClientDashboard";

interface DashboardOverviewProps {
  campaigns: Campaign[];
  allReservations: { [campaignId: string]: Ticket[] };
  clientsCount: number;
  clients?: UserProfile[];
  vipDiscountPct?: number;
}

function DashboardOverview({ campaigns, allReservations, clientsCount, clients = [], vipDiscountPct }: DashboardOverviewProps) {
  // Stats summary calculation
  const stats = useMemo(() => {
    let totalTickets = 0;
    let totalConfirmedCount = 0;
    let totalReservedCount = 0;
    let totalRevenue = 0;
    let pendingPixRevenue = 0;
    let totalExpenses = 0;

    campaigns.forEach((camp) => {
      totalTickets += camp.totalTickets;
      totalExpenses += camp.prizeExpenses || 0;

      const tickets = allReservations[camp.id] || [];
      const confirmedTickets = tickets.filter((t) => t.status === "confirmed");
      const reservedTickets = tickets.filter((t) => t.status === "reserved");

      // Group confirmed tickets by buyer contact (CPF or Phone)
      const confirmedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
      confirmedTickets.forEach((t) => {
        const buyerKey = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
        if (!confirmedGroups[buyerKey]) {
          confirmedGroups[buyerKey] = { count: 0, tickets: [] };
        }
        confirmedGroups[buyerKey].count++;
        confirmedGroups[buyerKey].tickets.push(t);
      });

      let campConfirmedRevenue = 0;
      Object.entries(confirmedGroups).forEach(([_, group]) => {
        const isVip = clients && group.tickets.length > 0 && clients.some((cl) => {
          if (!cl.isVip) return false;
          const cleanClPhone = cl.phone?.replace(/\D/g, "");
          const cleanTkPhone = group.tickets[0].buyerPhone?.replace(/\D/g, "");
          const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
          const cpfMatch = cl.cpf && group.tickets[0].buyerCpf && cl.cpf.replace(/\D/g, "") === group.tickets[0].buyerCpf.replace(/\D/g, "");
          const emailMatch = cl.email && group.tickets[0].buyerEmail && cl.email.trim().toLowerCase() === group.tickets[0].buyerEmail.trim().toLowerCase();
          const uidMatch = cl.uid && group.tickets[0].buyerUid && cl.uid === group.tickets[0].buyerUid;
          return phoneMatch || cpfMatch || emailMatch || uidMatch;
        });

        const { totalPrice } = getDiscountedPrice(
          group.count,
          camp.ticketPrice,
          camp.progressiveDiscounts || [],
          isVip,
          vipDiscountPct
        );
        campConfirmedRevenue += totalPrice;
      });

      // Group reserved tickets by buyer contact (CPF or Phone)
      const reservedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
      reservedTickets.forEach((t) => {
        const buyerKey = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
        if (!reservedGroups[buyerKey]) {
          reservedGroups[buyerKey] = { count: 0, tickets: [] };
        }
        reservedGroups[buyerKey].count++;
        reservedGroups[buyerKey].tickets.push(t);
      });

      let campPendingRevenue = 0;
      Object.entries(reservedGroups).forEach(([_, group]) => {
        const isVip = clients && group.tickets.length > 0 && clients.some((cl) => {
          if (!cl.isVip) return false;
          const cleanClPhone = cl.phone?.replace(/\D/g, "");
          const cleanTkPhone = group.tickets[0].buyerPhone?.replace(/\D/g, "");
          const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
          const cpfMatch = cl.cpf && group.tickets[0].buyerCpf && cl.cpf.replace(/\D/g, "") === group.tickets[0].buyerCpf.replace(/\D/g, "");
          const emailMatch = cl.email && group.tickets[0].buyerEmail && cl.email.trim().toLowerCase() === group.tickets[0].buyerEmail.trim().toLowerCase();
          const uidMatch = cl.uid && group.tickets[0].buyerUid && cl.uid === group.tickets[0].buyerUid;
          return phoneMatch || cpfMatch || emailMatch || uidMatch;
        });

        const { totalPrice } = getDiscountedPrice(
          group.count,
          camp.ticketPrice,
          camp.progressiveDiscounts || [],
          isVip,
          vipDiscountPct
        );
        campPendingRevenue += totalPrice;
      });

      totalConfirmedCount += confirmedTickets.length;
      totalReservedCount += reservedTickets.length;
      totalRevenue += campConfirmedRevenue;
      pendingPixRevenue += campPendingRevenue;
    });

    const totalSold = totalConfirmedCount + totalReservedCount;
    const totalAvailable = Math.max(0, totalTickets - totalSold);
    const occupancyRate = totalTickets > 0 ? (totalSold / totalTickets) * 100 : 0;
    const netProfit = totalRevenue - totalExpenses;

    return {
      totalTickets,
      totalConfirmedCount,
      totalReservedCount,
      totalSold,
      totalAvailable,
      totalRevenue,
      pendingPixRevenue,
      occupancyRate,
      totalExpenses,
      netProfit
    };
  }, [campaigns, allReservations, clients, vipDiscountPct]);

  // Transform data for charts
  const donutData = useMemo(() => {
    return [
      { label: "Confirmados (PIX)", count: stats.totalConfirmedCount, color: "#6366f1", labelPt: "Confirmado" }, // indigo-500
      { label: "Pendente (PIX)", count: stats.totalReservedCount, color: "#f59e0b", labelPt: "Pendente" }, // amber-500
      { label: "Disponíveis", count: stats.totalAvailable, color: "#e2e8f0", labelPt: "Disponível" }, // slate-200
    ];
  }, [stats]);

  const campaignFinancials = useMemo(() => {
    return campaigns.map((camp) => {
      const tickets = allReservations[camp.id] || [];
      const confirmedTickets = tickets.filter((t) => t.status === "confirmed");
      const reservedTickets = tickets.filter((t) => t.status === "reserved");

      // Group confirmed
      const confirmedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
      confirmedTickets.forEach((t) => {
        const buyerKey = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
        if (!confirmedGroups[buyerKey]) {
          confirmedGroups[buyerKey] = { count: 0, tickets: [] };
        }
        confirmedGroups[buyerKey].count++;
        confirmedGroups[buyerKey].tickets.push(t);
      });

      let confirmedAmount = 0;
      Object.entries(confirmedGroups).forEach(([_, group]) => {
        const isVip = clients && group.tickets.length > 0 && clients.some((cl) => {
          if (!cl.isVip) return false;
          const cleanClPhone = cl.phone?.replace(/\D/g, "");
          const cleanTkPhone = group.tickets[0].buyerPhone?.replace(/\D/g, "");
          const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
          const cpfMatch = cl.cpf && group.tickets[0].buyerCpf && cl.cpf.replace(/\D/g, "") === group.tickets[0].buyerCpf.replace(/\D/g, "");
          const emailMatch = cl.email && group.tickets[0].buyerEmail && cl.email.trim().toLowerCase() === group.tickets[0].buyerEmail.trim().toLowerCase();
          const uidMatch = cl.uid && group.tickets[0].buyerUid && cl.uid === group.tickets[0].buyerUid;
          return phoneMatch || cpfMatch || emailMatch || uidMatch;
        });

        const { totalPrice } = getDiscountedPrice(
          group.count,
          camp.ticketPrice,
          camp.progressiveDiscounts || [],
          isVip,
          vipDiscountPct
        );
        confirmedAmount += totalPrice;
      });

      // Group reserved
      const reservedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
      reservedTickets.forEach((t) => {
        const buyerKey = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
        if (!reservedGroups[buyerKey]) {
          reservedGroups[buyerKey] = { count: 0, tickets: [] };
        }
        reservedGroups[buyerKey].count++;
        reservedGroups[buyerKey].tickets.push(t);
      });

      let pendingAmount = 0;
      Object.entries(reservedGroups).forEach(([_, group]) => {
        const isVip = clients && group.tickets.length > 0 && clients.some((cl) => {
          if (!cl.isVip) return false;
          const cleanClPhone = cl.phone?.replace(/\D/g, "");
          const cleanTkPhone = group.tickets[0].buyerPhone?.replace(/\D/g, "");
          const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
          const cpfMatch = cl.cpf && group.tickets[0].buyerCpf && cl.cpf.replace(/\D/g, "") === group.tickets[0].buyerCpf.replace(/\D/g, "");
          const emailMatch = cl.email && group.tickets[0].buyerEmail && cl.email.trim().toLowerCase() === group.tickets[0].buyerEmail.trim().toLowerCase();
          const uidMatch = cl.uid && group.tickets[0].buyerUid && cl.uid === group.tickets[0].buyerUid;
          return phoneMatch || cpfMatch || emailMatch || uidMatch;
        });

        const { totalPrice } = getDiscountedPrice(
          group.count,
          camp.ticketPrice,
          camp.progressiveDiscounts || [],
          isVip,
          vipDiscountPct
        );
        pendingAmount += totalPrice;
      });

      const expenses = camp.prizeExpenses || 0;
      const profit = confirmedAmount - expenses;

      return {
        id: camp.id,
        title: camp.title,
        confirmed: confirmedAmount,
        pending: pendingAmount,
        expenses,
        profit,
        totalPotential: camp.totalTickets * camp.ticketPrice,
      };
    });
  }, [campaigns, allReservations, clients, vipDiscountPct]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Upper header segment */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-slate-100 pb-5">
        <div>
          <h2 className="font-extrabold text-slate-800 text-xl tracking-tight">Dashboard de Visão Geral</h2>
          <p className="text-xs text-slate-400">Analíticos visuais e financeiros em tempo real alimentados por gráficos D3.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50/70 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100 text-xs font-semibold">
          <TrendingUp className="w-4 h-4 animate-pulse" />
          <span>Status: Ao Vivo</span>
        </div>
      </div>

      {/* Grid boxes for numerical high levels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* TOTAL SOLD WIDGET */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: "#6366f1" }} />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Cotas Vendidas</span>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Percent className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <div>
            <p className="font-extrabold font-mono text-xl sm:text-2xl text-slate-800">
              {stats.totalSold} <span className="text-xs text-slate-400 font-sans font-medium">/ {stats.totalTickets}</span>
            </p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
              <span className="font-bold text-indigo-600">{stats.occupancyRate.toFixed(1)}%</span>
              <span>taxa de ocupação</span>
            </div>
          </div>
        </div>

        {/* REVENUE CONFIRMED */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider font-sans">Faturamento Confirmado</span>
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Coins className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div>
            <p className="font-extrabold font-mono text-xl sm:text-2xl text-slate-800">
              R$ {stats.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 font-semibold bg-emerald-50 w-fit px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3" />
              <span>{stats.totalConfirmedCount} pagas</span>
            </div>
          </div>
        </div>

        {/* EXPENSES / CUSTO COM PREMIOS */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Custo de Prêmios</span>
            <div className="p-2 bg-rose-50 rounded-xl">
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
          </div>
          <div>
            <p className="font-extrabold font-mono text-xl sm:text-2xl text-rose-700">
              R$ {stats.totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center mt-1 text-[10px] text-rose-700 font-semibold bg-rose-50 w-fit px-2 py-0.5 rounded-md">
              <span>Despesas lançadas</span>
            </div>
          </div>
        </div>

        {/* NET PROFIT / LUCRO REAL */}
        <div className="bg-violet-50/50 border border-violet-100 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-violet-600" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-violet-600 tracking-wider">Lucro Real Líquido</span>
            <div className="p-2 bg-violet-100 rounded-xl">
              <TrendingUp className="w-4 h-4 text-violet-700 animate-bounce" />
            </div>
          </div>
          <div>
            <p className={`font-black font-mono text-xl sm:text-2xl ${stats.netProfit >= 0 ? "text-violet-800" : "text-rose-700"}`}>
              R$ {stats.netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <div className={`flex items-center mt-1 text-[10px] font-semibold w-fit px-2 py-0.5 rounded-md ${stats.netProfit >= 0 ? "text-violet-700 bg-violet-100" : "text-rose-700 bg-rose-50"}`}>
              <span>
                {stats.totalRevenue > 0 
                  ? `${((stats.netProfit / stats.totalRevenue) * 100).toFixed(1)}% Margem` 
                  : "0.0% Margem"}
              </span>
            </div>
          </div>
        </div>

        {/* PENDING PIX MANUAL CHECKS */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Pendente PIX</span>
            <div className="p-2 bg-amber-50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div>
            <p className="font-extrabold font-mono text-xl sm:text-2xl text-slate-800">
              R$ {stats.pendingPixRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-700 font-semibold bg-amber-50 w-fit px-2 py-0.5 rounded-md">
              <span className="animate-ping w-1.5 h-1.5 bg-amber-500 rounded-full inline-block mr-1" />
              <span>{stats.totalReservedCount} na fila</span>
            </div>
          </div>
        </div>

        {/* CLIENTS BASE */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-3 shadow-xs hover:shadow-sm transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-400" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Clientes Unificados</span>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
          </div>
          <div>
            <p className="font-extrabold font-mono text-xl sm:text-2xl text-slate-800">
              {clientsCount} <span className="text-xs text-slate-400 font-sans font-medium">cadastros</span>
            </p>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
              <span>Acesso instantâneo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Meta da Formatura Progress Widget */}
      <GraduationGoalWidget
        campaigns={campaigns}
        allReservations={allReservations}
      />

      {/* Visual Chart Rows powered by SVG & D3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* DONUT CHART STATUS DISTRIBUTION */}
        <div className="lg:col-span-4 bg-white p-5 md:p-6 rounded-2xl border border-slate-150 flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">Distribuição das Cotas</h3>
            <p className="text-[10px] text-slate-450">Proporção atualizada de reservas com e sem confirmação.</p>
          </div>

          <div className="flex justify-center py-4">
            <DonutChartComponent data={donutData} occupancyRate={stats.occupancyRate} />
          </div>

          <div className="space-y-2.5">
            {donutData.map((d) => (
              <div key={d.label} className="flex justify-between items-center text-xs border-b border-dashed border-slate-100 pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="font-medium text-slate-600">{d.labelPt}</span>
                </div>
                <span className="font-mono font-bold text-slate-800">
                  {d.count} <span className="text-[10px] text-slate-400 font-medium">({stats.totalTickets > 0 ? ((d.count / stats.totalTickets) * 100).toFixed(1) : "0.0"}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* COMPARATIVE CAMPAIGN BAR CHART */}
        <div className="lg:col-span-8 bg-white p-5 md:p-6 rounded-2xl border border-slate-150 flex flex-col justify-between h-full">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">Desempenho Financeiro por Rifa</h3>
            <p className="text-[10px] text-slate-450">Comparativos entre arrecadação consolidada e potencial de metas das campanhas.</p>
          </div>

          <div className="flex-1 min-h-[280px] w-full flex items-center justify-center">
            <GroupedBarChartComponent data={campaignFinancials} />
          </div>

          {/* Chart Legends */}
          <div className="flex flex-wrap justify-center gap-5 mt-4 pt-4 border-t border-slate-100 text-[10px] font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-indigo-500 rounded-xs" />
              <span>Concluído (Confirmado PIX)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-500 rounded-xs" />
              <span>Pendente (Aguardando Verificação)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-slate-200 rounded-xs" />
              <span>Disponível Restante (Meta Total)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Top Buyers Ranking under Metrics tab */}
      <div className="pt-8 border-t border-slate-100">
        <RankingView
          campaigns={campaigns}
          allReservations={allReservations}
          loading={false}
          isAdmin={true}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// DonutChartComponent - Pure responsive D3 Donut with central text
// -------------------------------------------------------------
interface DonutItem {
  label: string;
  count: number;
  color: string;
  labelPt: string;
}

function DonutChartComponent({ data, occupancyRate }: { data: DonutItem[]; occupancyRate: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Responsive sizing logic with ResizeObserver
    const handleResize = (entries: ResizeObserverEntry[]) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;

      window.requestAnimationFrame(() => {
        if (!svgRef.current || !containerRef.current) return;

        const size = Math.min(width, 210);
        const margin = 10;
        const radius = size / 2 - margin;

        // Clean SVG first
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        svg
          .attr("width", size)
          .attr("height", size);

        const g = svg
          .append("g")
          .attr("transform", `translate(${size / 2}, ${size / 2})`);

        const pie = d3
          .pie<DonutItem>()
          .value((d) => d.count || 0.1) // fallback to slightly visible if zero
          .sort(null);

        const arc = d3
          .arc<d3.PieArcDatum<DonutItem>>()
          .innerRadius(radius * 0.6)
          .outerRadius(radius);

        const arcHover = d3
          .arc<d3.PieArcDatum<DonutItem>>()
          .innerRadius(radius * 0.58)
          .outerRadius(radius + 4);

        // Render chart
        const path = g
          .selectAll("path")
          .data(pie(data))
          .enter()
          .append("path")
          .attr("d", arc)
          .attr("fill", (d) => d.data.color)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", "2px")
          .style("cursor", "pointer")
          .attr("opacity", 0.95);

        // Enter transitions animation
        path
          .transition()
          .duration(750)
          .attrTween("d", function (d) {
            const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function (t) {
              return arc(interpolate(t)) as string;
            };
          });

        // Tooltip/Hover behavior
        path.on("mouseover", function (event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr("d", arcHover)
            .attr("opacity", 1);
        }).on("mouseout", function (event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr("d", arc)
            .attr("opacity", 0.95);
        });

        // Central indicator percentage
        const totalCount = d3.sum(data, (d) => d.count);
        g.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "-3px")
          .attr("class", "font-mono font-extrabold text-slate-800")
          .style("font-size", "18px")
          .text(`${occupancyRate.toFixed(1)}%`);

        g.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "12px")
          .attr("class", "font-sans uppercase font-extrabold text-slate-400 tracking-wider")
          .style("font-size", "8px")
          .text(totalCount > 0 ? "OCUPADO" : "VAZIO");
      });
    };

    const target = containerRef.current;
    const observer = new ResizeObserver(handleResize);
    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [data, occupancyRate]);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <svg ref={svgRef}></svg>
    </div>
  );
}

// -------------------------------------------------------------
// GroupedBarChartComponent - D3 Grouped Chart for Campaign metrics (Revenue vs Goal)
// -------------------------------------------------------------
interface CampaignFin {
  id: string;
  title: string;
  confirmed: number;
  pending: number;
  totalPotential: number;
}

function GroupedBarChartComponent({ data }: { data: CampaignFin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;

      window.requestAnimationFrame(() => {
        if (!svgRef.current || !containerRef.current) return;

        const cardWidth = Math.max(340, width);
        const cardHeight = 280;

        // Reset DOM
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        // Clear previous tooltips to avoid accumulation and loop triggers
        d3.select(containerRef.current).selectAll(".chart-tooltip").remove();

        if (data.length === 0) {
          // Draw empty message inside SVG if no data available
          svg
            .attr("width", cardWidth)
            .attr("height", cardHeight);
          svg
            .append("text")
            .attr("x", cardWidth / 2)
            .attr("y", cardHeight / 2)
            .attr("text-anchor", "middle")
            .attr("class", "fill-slate-400 text-xs font-semibold")
            .text("Nenhuma campanha ativa para analisar.");
          return;
        }

        const margin = { top: 20, right: 20, bottom: 45, left: 55 };
        const chartWidth = cardWidth - margin.left - margin.right;
        const chartHeight = cardHeight - margin.top - margin.bottom;

        svg
          .attr("width", cardWidth)
          .attr("height", cardHeight);

        const g = svg
          .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`);

        // X Scale representing each Campaign
        const x0 = d3
          .scaleBand()
          .domain(data.map((d) => d.title))
          .rangeRound([0, chartWidth])
          .paddingInner(0.2);

        // Financial properties sub-columns
        const keys = ["confirmed", "pending", "available"];
        const x1 = d3
          .scaleBand()
          .domain(keys)
          .rangeRound([0, x0.bandwidth()])
          .padding(0.05);

        // Max scale range selection based on high total potential
        const maxVal = d3.max(data, (d) => Math.max(d.totalPotential, d.confirmed + d.pending)) || 500;
        const y = d3
          .scaleLinear()
          .domain([0, maxVal * 1.05])
          .rangeRound([chartHeight, 0]);

        // Soft coloring specs
        const colors = d3
          .scaleOrdinal<string>()
          .domain(keys)
          .range(["#6366f1", "#f59e0b", "#e2e8f0"]); // indigo, amber, slate-200

        // Tooltip node on hover
        const tooltip = d3
          .select(containerRef.current)
          .append("div")
          .attr("class", "chart-tooltip")
          .style("position", "absolute")
          .style("visibility", "hidden")
          .style("background-color", "rgba(15, 23, 42, 0.95)")
          .style("color", "#fff")
          .style("padding", "6px 10px")
          .style("border-radius", "8px")
          .style("font-size", "10px")
          .style("pointer-events", "none")
          .style("z-index", "100")
          .style("font-family", "monospace");

        // Draw Axes
        const xAxis = g
          .append("g")
          .attr("transform", `translate(0, ${chartHeight})`)
          .call(d3.axisBottom(x0));

        xAxis
          .selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-18)")
          .attr("class", "text-slate-500 font-sans font-medium text-[9px]")
          .text((d: any) => (d.length > 15 ? d.substring(0, 13) + "..." : d));

        xAxis.select(".domain").attr("stroke", "#e2e8f0");
        xAxis.selectAll("line").attr("stroke", "#e2e8f0");

        const yAxis = g
          .append("g")
          .call(
            d3.axisLeft(y)
              .ticks(5)
              .tickFormat((d) => `R$ ${Number(d).toFixed(0)}`)
          );

        yAxis.select(".domain").attr("stroke", "#e2e8f0");
        yAxis.selectAll("line").attr("stroke", "#f1f5f9");
        yAxis.selectAll("text").attr("class", "fill-slate-400 font-mono text-[9px]");

        // Add Grid lines
        g.append("g")
          .attr("class", "grid")
          .attr("opacity", 0.05)
          .call(
            d3.axisLeft(y)
              .ticks(5)
              .tickSize(-chartWidth)
              .tickFormat(() => "")
          )
          .select(".domain")
          .remove();

        // Render Bar Groups
        const barGroups = g
          .selectAll(".campaign-group")
          .data(data)
          .enter()
          .append("g")
          .attr("class", "campaign-group")
          .attr("transform", (d) => `translate(${x0(d.title)}, 0)`);

        barGroups
          .selectAll("rect")
          .data((d) => {
            const rest = Math.max(0, d.totalPotential - (d.confirmed + d.pending));
            return [
              { key: "confirmed", value: d.confirmed, label: "Arrecadado", original: d },
              { key: "pending", value: d.pending, label: "Pendente PIX", original: d },
              { key: "available", value: rest, label: "Livre Restante", original: d },
            ];
          })
          .enter()
          .append("rect")
          .attr("x", (d) => x1(d.key) || 0)
          .attr("y", chartHeight) // Animation start position
          .attr("width", x1.bandwidth())
          .attr("height", 0) // Animation start position
          .attr("fill", (d) => colors(d.key))
          .attr("rx", 3)
          .style("cursor", "pointer")
          .attr("opacity", 0.9)
          .on("mouseover", function (event, d) {
            d3.select(this).attr("opacity", 1);
            tooltip
              .html(
                `<strong>${d.original.title}</strong><br/>` +
                `<span style="color:#a5b4fc">⬤</span> ${d.label}: R$ ${d.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              )
              .style("visibility", "visible");
          })
          .on("mousemove", function (event) {
            const containerOffset = containerRef.current?.getBoundingClientRect();
            if (!containerOffset) return;
            const xPos = event.clientX - containerOffset.left + 15;
            const yPos = event.clientY - containerOffset.top - 35;
            tooltip.style("top", `${yPos}px`).style("left", `${xPos}px`);
          })
          .on("mouseout", function () {
            d3.select(this).attr("opacity", 0.9);
            tooltip.style("visibility", "hidden");
          })
          // Grow Animation
          .transition()
          .duration(800)
          .delay((d, i) => i * 100)
          .attr("y", (d) => y(d.value))
          .attr("height", (d) => chartHeight - y(d.value));
      });
    };

    const target = containerRef.current;
    const observer = new ResizeObserver(handleResize);
    observer.observe(target);

    return () => {
      observer.unobserve(target);
      d3.select(target).selectAll(".chart-tooltip").remove();
    };
  }, [data]);

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      <svg ref={svgRef}></svg>
    </div>
  );
}

export default React.memo(DashboardOverview);

