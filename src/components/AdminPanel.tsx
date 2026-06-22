import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Ticket, UserProfile, TicketStatus } from "../types";
import { validateCPF, formatCPF, formatPhone, validatePhone, getCampaignDrawProjection, splitTicketsIntoBatches } from "../utils/validation";
import RichTextEditor from "./RichTextEditor";
import { getDiscountedPrice } from "./ClientDashboard";
import AppLogo from "./AppLogo";
import DashboardOverview from "./DashboardOverview";
import PricingDashboard from "./PricingDashboard";
import {
  Plus,
  Trash2,
  Trophy,
  Play,
  Pause,
  Users,
  Check,
  X,
  Shield,
  Search,
  Calendar,
  Landmark,
  Info,
  AlertTriangle,
  FileText,
  User as UserIcon,
  Upload,
  Image as ImageIcon,
  BarChart3,
  Settings as SettingsIcon,
  Coins,
  Edit,
  Database,
  Download,
  Calculator,
  Percent,
  Crown,
  Sparkles,
  Zap
} from "lucide-react";

export function getCampaignRevenueStats(campaign: Campaign, tickets: Ticket[], clients?: UserProfile[], vipDiscountPct?: number) {
  const confirmedTickets = tickets.filter(t => t.status === "confirmed");
  const reservedTickets = tickets.filter(t => t.status === "reserved");

  // Group confirmed
  const confirmedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
  confirmedTickets.forEach((t) => {
    const key = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
    if (!confirmedGroups[key]) {
      confirmedGroups[key] = { count: 0, tickets: [] };
    }
    confirmedGroups[key].count++;
    confirmedGroups[key].tickets.push(t);
  });

  let confirmedRevenue = 0;
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
      campaign.ticketPrice,
      campaign.progressiveDiscounts || [],
      isVip,
      vipDiscountPct
    );
    confirmedRevenue += totalPrice;
  });

  // Group reserved
  const reservedGroups: { [key: string]: { count: number; tickets: Ticket[] } } = {};
  reservedTickets.forEach((t) => {
    const key = t.buyerCpf || t.buyerPhone || t.buyerEmail || t.buyerUid || "unknown";
    if (!reservedGroups[key]) {
      reservedGroups[key] = { count: 0, tickets: [] };
    }
    reservedGroups[key].count++;
    reservedGroups[key].tickets.push(t);
  });

  let reservedRevenue = 0;
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
      campaign.ticketPrice,
      campaign.progressiveDiscounts || [],
      isVip,
      vipDiscountPct
    );
    reservedRevenue += totalPrice;
  });

  const expenses = campaign.prizeExpenses || 0;
  const realProfit = confirmedRevenue - expenses;

  return { confirmedRevenue, reservedRevenue, expenses, realProfit };
}

interface AdminPanelProps {
  onLogout: () => void;
}

export default function AdminPanel({ onLogout }: AdminPanelProps) {
  // Navigation tabs: metris, reservations, config, campaigns, winners, clients
  const [activeTab, setActiveTab] = useState<"metrics" | "reservations" | "config" | "campaigns" | "winners" | "clients" | "backup" | "pricing" | "expressDraw">("metrics");

  // Databases States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allReservations, setAllReservations] = useState<{ [campaignId: string]: Ticket[] }>({});

  // Express draw states for high-fidelity interactive simulation
  const [selectedExpressCamp, setSelectedExpressCamp] = useState<Campaign | null>(null);
  const [isExpressSpinning, setIsExpressSpinning] = useState(false);
  const [spinningTicket, setSpinningTicket] = useState<Ticket | null>(null);
  const [expressCelebrationWinner, setExpressCelebrationWinner] = useState<{ ticket: Ticket; name: string } | null>(null);
  const [antiVicioActive, setAntiVicioActive] = useState(true);
  const [clientFilterTab, setClientFilterTab] = useState<"all" | "vip_only" | "eligible_vip">("all");

  // Global dynamically editable settings
  const [settings, setSettings] = useState({
    pixKey: "contato@rifadochiquinho.com.br",
    bankName: "Banco Central",
    receiverName: "Apoio Rifa do Chiquinho",
    expirationHours: 24,
    supportContact: "51999999999",
    supportEmail: "contato@rifadochiquinho.com.br",
    rulesText: "Os bilhetes reservados têm prazo de validade. Caso a transferência via PIX não seja comprovada, a cota retornará à disponibilidade geral automaticamente.",
    autoWhatsAppRedirect: true,
    logoUrl: "",
    logoBase64: "",
    vipAdvanceHours: 24,
    vipDiscountPercentage: 10,
    vipWhatsAppUrl: "",
    vipEnabled: true,
    salesSuspensionBlocked: false
  });

  const [groupReservationsByBuyer, setGroupReservationsByBuyer] = useState(false);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);

  // Filter / Search strings
  const [campaignSearch, setCampaignSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [reservationFilter, setReservationFilter] = useState<"all" | "reserved" | "confirmed">("all");
  const [clientSortBy, setClientSortBy] = useState<"name" | "createdAt">("name");
  const [clientSortOrder, setClientSortOrder] = useState<"asc" | "desc">("asc");

  // Modals / Forms controllers
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignDesc, setNewCampaignDesc] = useState("");
  const [newCampaignPrice, setNewCampaignPrice] = useState(10.0);
  const [newCampaignTotal, setNewCampaignTotal] = useState(100);
  const [newCampaignExpenses, setNewCampaignExpenses] = useState<number>(0);
  const [newCampaignDrawDate, setNewCampaignDrawDate] = useState("");
  const [newCampaignDrawId, setNewCampaignDrawId] = useState("");
  const [newCampaignDrawMode, setNewCampaignDrawMode] = useState<"traditional" | "express">("traditional");
  const [newCampaignStartDate, setNewCampaignStartDate] = useState("");
  const [newCampaignStartTime, setNewCampaignStartTime] = useState("");
  const [newCampaignImage, setNewCampaignImage] = useState("");
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Progressive Discount options for Create Form
  const [newCampaignDiscounts, setNewCampaignDiscounts] = useState<{ minQuantity: number; discountPrice: number; discountPercentage?: number }[]>([]);
  const [newCampaignDiscountEnabled, setNewCampaignDiscountEnabled] = useState(false);

  // Prizes (Brindes) list options for Create Form
  const [newCampaignPrizesList, setNewCampaignPrizesList] = useState<{ name: string; cost: number }[]>([]);
  const [newPrizeName, setNewPrizeName] = useState("");
  const [newPrizeCost, setNewPrizeCost] = useState("");

  // Edit Campaign State Controllers
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editCampaignTitle, setEditCampaignTitle] = useState("");
  const [editCampaignDesc, setEditCampaignDesc] = useState("");
  const [editCampaignPrice, setEditCampaignPrice] = useState(10.0);
  const [editCampaignTotal, setEditCampaignTotal] = useState(100);
  const [editCampaignExpenses, setEditCampaignExpenses] = useState<number>(0);
  const [editCampaignPrizesList, setEditCampaignPrizesList] = useState<{ name: string; cost: number }[]>([]);
  const [editPrizeName, setEditPrizeName] = useState("");
  const [editPrizeCost, setEditPrizeCost] = useState("");
  const [editCampaignDrawDate, setEditCampaignDrawDate] = useState("");
  const [editCampaignDrawId, setEditCampaignDrawId] = useState("");
  const [editCampaignDrawMode, setEditCampaignDrawMode] = useState<"traditional" | "express">("traditional");
  const [editCampaignStartDate, setEditCampaignStartDate] = useState("");
  const [editCampaignStartTime, setEditCampaignStartTime] = useState("");
  const [editCampaignImage, setEditCampaignImage] = useState("");
  const [editCampaignDiscounts, setEditCampaignDiscounts] = useState<{ minQuantity: number; discountPrice: number; discountPercentage?: number }[]>([]);
  const [editCampaignDiscountEnabled, setEditCampaignDiscountEnabled] = useState(false);
  const [editImageUploadLoading, setEditImageUploadLoading] = useState(false);
  const [editImageError, setEditImageError] = useState<string | null>(null);

  // States for Data Export and Backup
  const [selectedExportCampaign, setSelectedExportCampaign] = useState<string>("all");
  const [selectedExportStatus, setSelectedExportStatus] = useState<"all" | "confirmed" | "reserved">("all");

  // Cash Adjustment (Ajuste de Caixa) states
  const [showAdjustmentPanel, setShowAdjustmentPanel] = useState(false);
  const [selectedAdjCampaignId, setSelectedAdjCampaignId] = useState("");
  const [adjPrizesList, setAdjPrizesList] = useState<{ name: string; cost: number }[]>([]);
  const [adjExpenses, setAdjExpenses] = useState<number>(0);
  const [adjPrizeName, setAdjPrizeName] = useState("");
  const [adjPrizeCost, setAdjPrizeCost] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjSuccessMsg, setAdjSuccessMsg] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ step: string; current: number; total: number } | null>(null);

  // States for Ranking Clear Action
  const [rankingClearCampaignId, setRankingClearCampaignId] = useState<string>("all");
  const [isClearingRanking, setIsClearingRanking] = useState(false);
  const [clearRankingError, setClearRankingError] = useState<string | null>(null);
  const [clearRankingSuccess, setClearRankingSuccess] = useState<string | null>(null);

  // States for Pricing Calculator / Dashboard
  const [calcPrizeCost, setCalcPrizeCost] = useState<number>(1500);
  const [calcExtraCosts, setCalcExtraCosts] = useState<number>(200);
  const [calcTicketPrice, setCalcTicketPrice] = useState<number>(10);
  const [calcTotalTickets, setCalcTotalTickets] = useState<number>(500);
  const [calcSelectedCampaignId, setCalcSelectedCampaignId] = useState<string>("manual");

  // Client Management States
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editClientCpf, setEditClientCpf] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientCity, setEditClientCity] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientRole, setEditClientRole] = useState<"client" | "admin" | "">("client");
  const [editClientError, setEditClientError] = useState("");

  // Create Client Manually States
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [createClientName, setCreateClientName] = useState("");
  const [createClientCpf, setCreateClientCpf] = useState("");
  const [createClientPhone, setCreateClientPhone] = useState("");
  const [createClientCity, setCreateClientCity] = useState("");
  const [createClientEmail, setCreateClientEmail] = useState("");
  const [createClientError, setCreateClientError] = useState("");
  const [createClientSuccess, setCreateClientSuccess] = useState("");
  const [createClientLoading, setCreateClientLoading] = useState(false);

  // Manual Ticket Allocation Flow (Lançar Cotas)
  const [showIssueTicketsModal, setShowIssueTicketsModal] = useState(false);
  const [issueSelectedClient, setIssueSelectedClient] = useState<UserProfile | null>(null);
  const [issueCampaignId, setIssueCampaignId] = useState<string>("");
  const [issueNumbersType, setIssueNumbersType] = useState<"specific" | "random">("specific");
  const [issueSpecificNumbers, setIssueSpecificNumbers] = useState("");
  const [issueRandomCount, setIssueRandomCount] = useState<number>(1);
  const [issueStatus, setIssueStatus] = useState<TicketStatus>("confirmed");
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSuccess, setIssueSuccess] = useState<string | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);

  // States for Receipt / Comprovante
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptCampaign, setReceiptCampaign] = useState<Campaign | null>(null);
  const [receiptClientName, setReceiptClientName] = useState("");
  const [receiptClientPhone, setReceiptClientPhone] = useState("");
  const [receiptClientCpf, setReceiptClientCpf] = useState("");
  const [receiptClientEmail, setReceiptClientEmail] = useState("");
  const [receiptTickets, setReceiptTickets] = useState<Ticket[]>([]);
  const [receiptStatus, setReceiptStatus] = useState<TicketStatus>("confirmed");
  const [receiptTheme, setReceiptTheme] = useState<"emerald" | "indigo" | "amber" | "slate">("emerald");
  const [receiptCustomNote, setReceiptCustomNote] = useState("Obrigado pela preferência e muita boa sorte!");

  const generateReceiptCanvas = (format: "png" | "jpeg"): string | null => {
    if (!receiptCampaign) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const ticketsCount = receiptTickets.length;
    const itemsPerRow = 5;
    const rowHeight = 36;
    const ticketRows = Math.ceil(ticketsCount / itemsPerRow);
    
    // Dynamic height calculation
    const baseHeight = 540; // header details, text notes, etc.
    const calculatedHeight = baseHeight + (ticketRows * rowHeight);
    
    canvas.width = 600;
    canvas.height = calculatedHeight;

    // Get color theme variables
    let themePrimary = "#059669"; // Emerald default
    let themeSecondary = "#10B981";
    let themeBgLight = "#ECFDF5";
    
    if (receiptTheme === "indigo") {
      themePrimary = "#4F46E5";
      themeSecondary = "#6366F1";
      themeBgLight = "#EEF2FF";
    } else if (receiptTheme === "amber") {
      themePrimary = "#D97706";
      themeSecondary = "#F59E0B";
      themeBgLight = "#FEF3C7";
    } else if (receiptTheme === "slate") {
      themePrimary = "#1E293B";
      themeSecondary = "#475569";
      themeBgLight = "#F1F5F9";
    }

    // 1. Draw plain white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw sophisticated modern background graphics (ribbon stripe on left or top)
    ctx.fillStyle = themePrimary;
    ctx.fillRect(0, 0, canvas.width, 140); // header primary background

    // Clean header details
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("COMPROVANTE", 30, 50);
    
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText("www.rifadochiquinho.com.br", 30, 75);

    // Dynamic verification hash
    const fakeHash = "TX" + Math.random().toString(36).substring(2, 10).toUpperCase() + "R";
    ctx.font = "bold 13px Courier New, monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(`CÓD CORRESPONDÊNCIA: ${fakeHash}`, 30, 110);

    // Status Badge inside header
    const badgeText = receiptStatus === "confirmed" ? "PAGO & CONFIRMADO" : "PENDENTE / RESERVADO";
    ctx.font = "bold 11px sans-serif";
    const textWidth = ctx.measureText(badgeText).width;
    
    // Draw status badge pill background
    ctx.fillStyle = receiptStatus === "confirmed" ? "#10B981" : "#EF4444";
    ctx.beginPath();
    ctx.roundRect(canvas.width - textWidth - 60, 42, textWidth + 30, 26, 13);
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, canvas.width - textWidth - 45, 59);

    // 3. Buyer & Campaign details card setup
    let y = 170;
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("INFORMAÇÕES DO CLIENTE", 30, y);
    
    y += 24;
    ctx.fillStyle = "#475569";
    ctx.font = "13px sans-serif";
    ctx.fillText(`Nome: ${receiptClientName}`, 35, y);
    ctx.fillText(`Telefone: ${receiptClientPhone || "Não informado"}`, 320, y);
    
    y += 20;
    ctx.fillText(`CPF: ${receiptClientCpf || "Não informado"}`, 35, y);
    ctx.fillText(`E-mail: ${receiptClientEmail || "Não informado"}`, 320, y);

    y += 20;
    // Find the date & time of reservation
    const firstReservedAt = receiptTickets.find(t => t.reservedAt)?.reservedAt;
    let reservationTimeText = "Não informada";
    if (firstReservedAt) {
      try {
        const rDate = new Date(firstReservedAt);
        reservationTimeText = rDate.toLocaleString("pt-BR");
      } catch (e) {
        reservationTimeText = String(firstReservedAt);
      }
    }
    ctx.fillText(`Data/Hora de Reserva: ${reservationTimeText}`, 35, y);

    y += 35;
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();

    y += 25;
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("CAMPANHA / RIFA", 30, y);

    y += 24;
    ctx.fillStyle = "#334155";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(receiptCampaign.title, 35, y);
    
    // Price breakdown
    let calcPrice = { totalPrice: receiptCampaign.ticketPrice * ticketsCount, unitPrice: receiptCampaign.ticketPrice, appliedDiscount: false, discountPercentage: 0 };
    try {
      const isRcvVip = clients.some((cl) => {
        if (!cl.isVip) return false;
        const cleanClPhone = cl.phone?.replace(/\D/g, "");
        const cleanRcvPhone = receiptClientPhone?.replace(/\D/g, "");
        const phoneMatch = cleanClPhone && cleanRcvPhone && cleanClPhone === cleanRcvPhone;
        const cpfMatch = cl.cpf && receiptClientCpf && cl.cpf.replace(/\D/g, "") === receiptClientCpf.replace(/\D/g, "");
        const emailMatch = cl.email && receiptClientEmail && cl.email.trim().toLowerCase() === receiptClientEmail.trim().toLowerCase();
        const uidMatch = receiptTickets.length > 0 && cl.uid === receiptTickets[0].buyerUid;
        return phoneMatch || cpfMatch || emailMatch || uidMatch;
      });

      calcPrice = getDiscountedPrice(
        ticketsCount,
        receiptCampaign.ticketPrice,
        receiptCampaign.progressiveDiscounts,
        isRcvVip,
        settings.vipDiscountPercentage
      );
    } catch(e) {}

    y += 22;
    ctx.fillStyle = "#475569";
    ctx.font = "12px sans-serif";
    ctx.fillText(`Campanha ID: ${receiptCampaign.id}`, 35, y);
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`Valor Unitário: R$ ${calcPrice.unitPrice.toFixed(2)}`, 320, y);

    y += 18;
    ctx.fillText(`Quantidade: ${ticketsCount} cota(s)`, 35, y);
    ctx.fillStyle = themePrimary;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`TOTAL PAGO: R$ ${calcPrice.totalPrice.toFixed(2)}`, 320, y);

    y += 30;
    ctx.strokeStyle = "#E2E8F0";
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();

    // 5. Ticket Quotas section
    y += 25;
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`COTAS ADQUIRIDAS (${ticketsCount})`, 30, y);

    y += 15;
    const badgeW = 95;
    const badgeH = 26;
    const gapX = 18;
    const startX = 30;

    receiptTickets.forEach((tk, idx) => {
      const col = idx % itemsPerRow;
      const row = Math.floor(idx / itemsPerRow);
      const bx = startX + col * (badgeW + gapX);
      const by = y + row * rowHeight;

      // Draw shiny ticket background
      ctx.fillStyle = themeBgLight;
      ctx.beginPath();
      // Draw rounded rectangle for tag
      ctx.roundRect(bx, by, badgeW, badgeH, 6);
      ctx.fill();

      // Border for tag
      ctx.strokeStyle = themeSecondary + "40"; // low opacity border
      ctx.stroke();

      // Draw ticket number text
      ctx.fillStyle = themePrimary;
      ctx.font = "bold 11px Courier New, monospace";
      const numTxt = `# ${tk.number}`;
      const textW = ctx.measureText(numTxt).width;
      ctx.fillText(numTxt, bx + (badgeW - textW) / 2, by + 17);
    });

    // Advance Y past all row heights
    y += (ticketRows * rowHeight) + 30;

    // Custom Note / Footer Card block
    ctx.fillStyle = "#F8FAFC";
    ctx.beginPath();
    ctx.roundRect(30, y, canvas.width - 60, 60, 10);
    ctx.fill();

    ctx.strokeStyle = "#E2E8F0";
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = "italic 11px sans-serif";
    const noteTxt = receiptCustomNote || "Nenhuma observação extra.";
    ctx.fillText(noteTxt, 45, y + 34);

    // Decorative ticket notch detail to make it look premium
    ctx.fillStyle = "#E2E8F0";
    ctx.beginPath();
    ctx.arc(0, 140, 10, 0, Math.PI * 2);
    ctx.arc(canvas.width, 140, 10, 0, Math.PI * 2);
    ctx.fill();

    // Timestamp at the bottom
    ctx.fillStyle = "#94A3B8";
    ctx.font = "9px sans-serif";
    ctx.fillText(`Emissão do Comprovante: ${new Date().toLocaleString("pt-BR")} - Op: Admin`, 35, canvas.height - 20);

    return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg");
  };

  const downloadReceiptImage = (format: "png" | "jpeg") => {
    const dataUrl = generateReceiptCanvas(format);
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.href = dataUrl;
    const safeName = receiptClientName.trim().replace(/\s+/g, "_");
    link.download = `comprovante_${receiptCampaign?.id || "camp"}_${safeName}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    const dataUrl = generateReceiptCanvas("png");
    if (!dataUrl) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("O bloqueador de pop-ups impediu a geração do PDF. Por favor, permita pop-ups para este site.");
      return;
    }

    const title = `Recibo - ${receiptClientName}`;
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page {
              size: portrait;
              margin: 1cm;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: flex-start;
              background-color: #f1f5f9;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .container {
              max-width: 100%;
              width: 580px;
              text-align: center;
              padding: 30px 20px;
            }
            img {
              width: 100%;
              height: auto;
              border-radius: 16px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            }
            .print-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              margin-bottom: 20px;
              padding: 12px 24px;
              background-color: #059669;
              color: white;
              border: none;
              border-radius: 12px;
              font-weight: 800;
              cursor: pointer;
              font-size: 15px;
              box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
              transition: all 0.2s ease;
            }
            .print-btn:hover {
              background-color: #047857;
              transform: translateY(-1px);
            }
            @media print {
              .print-btn {
                display: none;
              }
              body {
                background: white;
              }
              img {
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <button class="print-btn" onclick="window.print()">
              <span>🖨️ Confirmar e Imprimir / Salvar PDF</span>
            </button>
            <img src="${dataUrl}" alt="Recibo" />
          </div>
          <script>
            // Auto open print dialog on load
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };


  // Drawing winners flows
  const [drawingCampaignId, setDrawingCampaignId] = useState<string | null>(null);
  const [drawWinnerCode, setDrawWinnerCode] = useState("");
  const [drawWinnerDate, setDrawWinnerDate] = useState("");
  const [drawWinnerHour, setDrawWinnerHour] = useState("");
  const [drawWinnerContestId, setDrawWinnerContestId] = useState("");

  const handleExportTicketsCSV = () => {
    try {
      let ticketsToExport: { ticket: Ticket; campaignTitle: string; campaignPrice: number; campaignId: string }[] = [];

      const campaignsList = selectedExportCampaign === "all" 
        ? campaigns 
        : campaigns.filter(c => c.id === selectedExportCampaign);

      campaignsList.forEach(camp => {
        const campTickets = allReservations[camp.id] || [];
        const filteredTickets = campTickets.filter(t => {
          if (selectedExportStatus === "all") return true;
          return t.status === selectedExportStatus;
        });
        
        filteredTickets.forEach(t => {
          ticketsToExport.push({
            ticket: t,
            campaignTitle: camp.title,
            campaignPrice: camp.ticketPrice,
            campaignId: camp.id
          });
        });
      });

      if (ticketsToExport.length === 0) {
        alert("Nenhum bilhete encontrado com os filtros selecionados.");
        return;
      }

      const headers = ["ID da Rifa", "Nome da Rifa", "Numero", "Valor Cota", "Comprador", "CPF Comprador", "Celular", "Status/Situacao", "Data Reserva", "Data Confirmacao", "ID Transacao"];
      const rows = ticketsToExport.map(({ ticket, campaignTitle, campaignPrice, campaignId }) => {
        const buyerUid = ticket.buyerUid;
        const buyer = clients.find(cl => cl.uid === buyerUid);
        const buyerName = ticket.buyerName || buyer?.name || "Cliente Desconhecido";
        const buyerCpf = ticket.buyerCpf || buyer?.cpf || "";
        const buyerPhone = ticket.buyerPhone || buyer?.phone || "";
        const statusLabel = ticket.status === "confirmed" ? "PAGO/CONFIRMADO" : "PENDENTE/RESERVADO";
        const reservedAtLabel = ticket.reservedAt ? new Date(ticket.reservedAt).toLocaleString("pt-BR") : "";
        const confirmedAtLabel = ticket.confirmedAt ? new Date(ticket.confirmedAt).toLocaleString("pt-BR") : "";

        return [
          campaignId,
          campaignTitle.replace(/;/g, ","),
          ticket.number,
          campaignPrice.toFixed(2),
          buyerName.replace(/;/g, ","),
          buyerCpf,
          buyerPhone,
          statusLabel,
          reservedAtLabel,
          confirmedAtLabel,
          statusLabel === "PAGO/CONFIRMADO" ? "Pago" : "Pendente"
        ];
      });

      const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(row => row.join(";"))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `relatorio_vendas_${selectedExportCampaign === "all" ? "geral" : selectedExportCampaign}_${selectedExportStatus}_${dateStr}.csv`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error exporting CSV:", err);
      alert("Houve um problema ao exportar os dados para CSV: " + (err as Error).message);
    }
  };

  const handleExportDatabaseJSON = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        exportedBy: "Painel Coletivo",
        appletId: "05237965-f0b5-4d3e-8b21-f8ebe563cc36",
        settings: settings,
        campaigns: campaigns,
        allReservations: allReservations,
        clients: clients
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      const dateStr = new Date().toISOString().split("T")[0];
      const timestampStr = new Date().toTimeString().split(" ")[0].replace(/:/g, "-");
      link.setAttribute("download", `backup_rifas_formatura_completo_${dateStr}_${timestampStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error exporting JSON backup:", err);
      alert("Erro ao gerar arquivo de backup: " + (err as Error).message);
    }
  };

  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        
        if (!parsed.campaigns || !parsed.settings) {
          alert("O arquivo selecionado não parece ser um backup válido do sistema de rifas. Campos obrigatórios (campaigns, settings) não foram encontrados.");
          setBackupFile(null);
          setParsedBackupData(null);
          return;
        }

        setParsedBackupData(parsed);
      } catch (err) {
        console.error("Error parsing JSON backup file:", err);
        alert("Não foi possível processar o arquivo. Certifique-se de escolher um arquivo .json de backup válido.");
        setBackupFile(null);
        setParsedBackupData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = async () => {
    if (!parsedBackupData) return;
    
    const confirmMessage = "IMPORTANTE:\n\nTem certeza de que deseja prosseguir com a restauração?\nEsta ação irá reescrever configurações, campanhas, clientes e bilhetes existentes com os mesmos IDs presentes no arquivo de backup.\n\nRecomendamos baixar um backup local novo antes de confirmar.";
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsRestoring(true);
    setRestoreProgress({ step: "Iniciando processo...", current: 0, total: 100 });

    try {
      // 1. Restore global settings
      if (parsedBackupData.settings) {
        setRestoreProgress({ step: "Restaurando configurações globais de PIX...", current: 5, total: 100 });
        await setDoc(doc(db, "settings", "global"), parsedBackupData.settings);
      }

      const totalCampaigns = parsedBackupData.campaigns?.length || 0;
      let totalTicketsSaved = 0;
      let totalClientsSaved = parsedBackupData.clients?.length || 0;

      let ticketsMap: { [campId: string]: Ticket[] } = parsedBackupData.allReservations || {};
      let totalTicketsCount = 0;
      Object.keys(ticketsMap).forEach(k => {
        totalTicketsCount += ticketsMap[k]?.length || 0;
      });

      const totalItemsToProcess = totalCampaigns + totalTicketsCount + totalClientsSaved;
      let processedCount = 0;

      // 2. Restore Campaigns
      if (parsedBackupData.campaigns && Array.isArray(parsedBackupData.campaigns)) {
        for (let i = 0; i < parsedBackupData.campaigns.length; i++) {
          const camp = parsedBackupData.campaigns[i];
          const campId = camp.id;
          
          setRestoreProgress({ 
            step: `Restaurando campanha: ${camp.title} (${i+1}/${totalCampaigns})`, 
            current: Math.round((processedCount / totalItemsToProcess) * 90) + 5, 
            total: 100 
          });

          const { id, ...campaignData } = camp;
          await setDoc(doc(db, "campaigns", campId), campaignData);
          processedCount++;
        }
      }

      // 3. Restore Subcollection Tickets for each Campaign
      if (ticketsMap) {
        const campaignIds = Object.keys(ticketsMap);
        for (let i = 0; i < campaignIds.length; i++) {
          const campId = campaignIds[i];
          const ticketList = ticketsMap[campId] || [];
          
          for (let j = 0; j < ticketList.length; j++) {
            const ticket = ticketList[j];
            const ticketId = ticket.number;

            setRestoreProgress({
              step: `Restaurando cotas da Rifa ID: ${campId} (${j+1}/${ticketList.length})`,
              current: Math.round((processedCount / totalItemsToProcess) * 90) + 5,
              total: 100
            });

            await setDoc(doc(db, "campaigns", campId, "tickets", ticketId), ticket);
            processedCount++;
            totalTicketsSaved++;
          }
        }
      }

      // 4. Restore User profiles (clients)
      if (parsedBackupData.clients && Array.isArray(parsedBackupData.clients)) {
        for (let i = 0; i < parsedBackupData.clients.length; i++) {
          const client = parsedBackupData.clients[i];
          const clientUid = client.uid || client.id;
          
          if (!clientUid) continue;

          setRestoreProgress({
            step: `Restaurando perfil do cliente: ${client.fullName || client.email} (${i+1}/${totalClientsSaved})`,
            current: Math.round((processedCount / totalItemsToProcess) * 90) * 0.95 + 5,
            total: 100
          });

          await setDoc(doc(db, "users", clientUid), client);
          processedCount++;
        }
      }

      setRestoreProgress({ step: "Finalizando e sincronizando...", current: 100, total: 100 });
      alert(`Sucesso!\n\nDados restaurados com absoluto êxito:\n- 1 Documento de Configurações\n- ${totalCampaigns} Campanhas/Rifas\n- ${totalTicketsSaved} Reservas de Cotas\n- ${totalClientsSaved} Perfis de Clientes sincronizados.`);
      
      setBackupFile(null);
      setParsedBackupData(null);
    } catch (err) {
      console.error("Error during database restore process:", err);
      alert("Houve um erro ao tentar restaurar os dados do banco: " + (err as Error).message);
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  };

  const handleClearRanking = async () => {
    const isAll = rankingClearCampaignId === "all";
    const selectedTitle = isAll
      ? "TODAS as campanhas"
      : campaigns.find(c => c.id === rankingClearCampaignId)?.title || "campanha selecionada";

    const confirmMessage = `ATENÇÃO CRÍTICA:\n\n` +
      `Você está prestes a ZERAR/LIMPAR o ranking de compradores para: ${selectedTitle}.\n\n` +
      `Isso irá deletar de forma PERMANENTE e IRREVERSÍVEL todas as cotas compradas e reservadas (toda a lista de reservas e vendas) dessa(s) campanha(s).\n` +
      `Os bilhetes voltarão a ficar 100% disponíveis para compra.\n\n` +
      `Tem certeza absoluta de que deseja prosseguir com o reset?`;

    if (!window.confirm(confirmMessage)) return;

    const secondConfirm = window.confirm(
      `CONFIRMAÇÃO ADICIONAL:\n\n` +
      `Esta ação vai de fato esvaziar o ranking e liberar os bilhetes. Não há como desfazer!\n` +
      `Deseja mesmo redefinir os bilhetes de ${selectedTitle}?`
    );
    if (!secondConfirm) return;

    setIsClearingRanking(true);
    setClearRankingError(null);
    setClearRankingSuccess(null);

    try {
      const campaignsToClear = isAll
        ? campaigns
        : campaigns.filter(c => c.id === rankingClearCampaignId);

      let deletedCount = 0;

      for (const camp of campaignsToClear) {
        const ticketsList = allReservations[camp.id] || [];
        if (ticketsList.length > 0) {
          await Promise.all(
            ticketsList.map(async (t) => {
              const ticketRef = doc(db, "campaigns", camp.id, "tickets", t.number);
              await deleteDoc(ticketRef);
              deletedCount++;
            })
          );
        }
      }

      setClearRankingSuccess(
        `Ranking redefinido com sucesso! ${deletedCount} cotas da(s) campanha(s) de "${selectedTitle}" foram devidamente excluídas/liberadas. O ranking agora está zerado.`
      );
    } catch (err: any) {
      console.error("Error clearing rankings:", err);
      setClearRankingError(err instanceof Error ? err.message : String(err));
      handleFirestoreError(err, OperationType.DELETE, `campaigns/tickets`);
    } finally {
      setIsClearingRanking(false);
    }
  };

  const handleOpenDrawingModal = (ca: Campaign) => {
    setDrawingCampaignId(ca.id);
    setDrawWinnerCode("");
    setDrawWinnerDate(ca.drawDate || new Date().toISOString().split("T")[0]);
    setDrawWinnerHour(ca.drawHour || "");
    setDrawWinnerContestId(ca.federalLotteryDrawId || "");
  };

  // Client management operations (Edit, Block, Delete)
  const handleToggleBlockClient = async (client: UserProfile) => {
    try {
      const newBlockedState = !client.isBlocked;
      const ref = doc(db, "users", client.uid);
      await updateDoc(ref, { isBlocked: newBlockedState });
      alert(`Cliente ${client.name} foi ${newBlockedState ? "Bloqueado" : "Desbloqueado"} com sucesso.`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${client.uid}`);
    }
  };

  const handleToggleVipClient = async (client: UserProfile) => {
    try {
      const newVipState = !client.isVip;
      const ref = doc(db, "users", client.uid);
      await updateDoc(ref, { isVip: newVipState });
      alert(`Cliente ${client.name} foi ${newVipState ? "definido como VIP 👑" : "removido do VIP"} com sucesso.`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${client.uid}`);
    }
  };

  const handleDeleteClient = async (client: UserProfile) => {
    const confirmDelete = window.confirm(
      `ATENÇÃO: Você tem certeza de que deseja EXCLUIR o perfil do cliente "${client.name}"?\n` +
      `Esta ação removerá o cadastro dele permanentemente e liberará todos os seus bilhetes associados.`
    );
    if (!confirmDelete) return;

    try {
      // 1. Delete all subcollection tickets associated with this client to prevent orphaned entries in Firebase
      const deletePromises: Promise<void>[] = [];
      Object.keys(allReservations).forEach((campaignId) => {
        const list = allReservations[campaignId] || [];
        list.forEach((t) => {
          if (t.buyerUid === client.uid) {
            const ticketRef = doc(db, "campaigns", campaignId, "tickets", t.number);
            deletePromises.push(deleteDoc(ticketRef));
          }
        });
      });

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }

      // 2. Delete user profile
      const ref = doc(db, "users", client.uid);
      await deleteDoc(ref);
      alert(`O perfil de "${client.name}" e todas as suas cotas associadas foram permanentemente removidos do Firestore.`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${client.uid}`);
    }
  };

  const handleOpenEditClient = (client: UserProfile) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditClientCpf(formatCPF(client.cpf));
    setEditClientPhone(formatPhone(client.phone));
    setEditClientCity(client.city);
    setEditClientEmail(client.email);
    setEditClientRole(client.role);
    setEditClientError("");
  };

  const handleSaveClientEdit = async () => {
    if (!editingClient) return;
    if (!editClientName.trim()) {
      setEditClientError("O nome do cliente é obrigatório.");
      return;
    }
    const cleanCpf = editClientCpf.replace(/\D/g, "");
    if (!validateCPF(cleanCpf)) {
      setEditClientError("CPF inválido. Por favor, confira os números.");
      return;
    }
    const cleanPhone = editClientPhone.replace(/\D/g, "");
    if (!validatePhone(editClientPhone)) {
      setEditClientError("Celular/WhatsApp inválido. Certifique-se de digitar com DDD no formato (XX) 9XXXX-XXXX.");
      return;
    }
    if (!editClientCity.trim()) {
      setEditClientError("A cidade é obrigatória.");
      return;
    }
    if (!editClientEmail.trim()) {
      setEditClientError("O e-mail é obrigatório.");
      return;
    }
    if (!editClientEmail.includes("@")) {
      setEditClientError("Por favor, digite um e-mail válido.");
      return;
    }

    try {
      // Check for duplicate CPF or Phone (excluding editingClient)
      const usersRef = collection(db, "users");
      const cpfQuery = query(usersRef, where("cpf", "==", cleanCpf));
      const phoneQuery = query(usersRef, where("phone", "==", cleanPhone));

      const [cpfSnap, phoneSnap] = await Promise.all([
        getDocs(cpfQuery),
        getDocs(phoneQuery),
      ]);

      const otherUserWithCpf = cpfSnap.docs.find(d => d.id !== editingClient.uid);
      if (otherUserWithCpf) {
        setEditClientError("Este CPF já está associado a outro participante.");
        return;
      }

      const otherUserWithPhone = phoneSnap.docs.find(d => d.id !== editingClient.uid);
      if (otherUserWithPhone) {
        setEditClientError("Este WhatsApp/Celular já está associado a outro participante.");
        return;
      }

      const ref = doc(db, "users", editingClient.uid);
      await updateDoc(ref, {
        name: editClientName,
        email: editClientEmail.trim().toLowerCase(),
        cpf: cleanCpf,
        phone: cleanPhone,
        city: editClientCity,
        role: editClientRole || "client",
      });
      setEditingClient(null);
      alert("Cadastro do cliente atualizado com absoluto sucesso!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${editingClient.uid}`);
    }
  };

  const handleCreateClient = async () => {
    if (!createClientName.trim()) {
      setCreateClientError("Nome do cliente é obrigatório.");
      return;
    }
    const cleanCpf = createClientCpf.replace(/\D/g, "");
    if (cleanCpf.length < 11 || cleanCpf.length > 15) {
      setCreateClientError("CPF inválido (deve conter no mínimo 11 dígitos).");
      return;
    }
    const cleanPhone = createClientPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      setCreateClientError("WhatsApp/Celular é obrigatório.");
      return;
    }
    if (!createClientCity.trim()) {
      setCreateClientError("Cidade/Estado é obrigatória.");
      return;
    }
    if (!createClientEmail.trim()) {
      setCreateClientError("E-mail é obrigatório.");
      return;
    }
    
    setCreateClientLoading(true);
    setCreateClientError("");
    setCreateClientSuccess("");

    try {
      // Check for duplicates
      const usersRef = collection(db, "users");
      const cpfQuery = query(usersRef, where("cpf", "==", cleanCpf));
      const phoneQuery = query(usersRef, where("phone", "==", cleanPhone));

      const [cpfSnap, phoneSnap] = await Promise.all([
        getDocs(cpfQuery),
        getDocs(phoneQuery),
      ]);

      if (!cpfSnap.empty) {
        setCreateClientError("Este CPF já está associado a outro participante.");
        setCreateClientLoading(false);
        return;
      }

      if (!phoneSnap.empty) {
        setCreateClientError("Este WhatsApp/Celular já está associado a outro participante.");
        setCreateClientLoading(false);
        return;
      }

      const newClientRef = doc(collection(db, "users"));
      const newUid = newClientRef.id;

      const newUser: UserProfile = {
        uid: newUid,
        name: createClientName.trim(),
        cpf: cleanCpf,
        phone: cleanPhone,
        city: createClientCity.trim(),
        email: createClientEmail.trim().toLowerCase(),
        role: "client",
        createdAt: new Date().toISOString(),
      };

      await setDoc(newClientRef, newUser);
      
      setCreateClientSuccess("Participante cadastrado com sucesso!");
      
      // Clear fields
      setCreateClientName("");
      setCreateClientCpf("");
      setCreateClientPhone("");
      setCreateClientCity("");
      setCreateClientEmail("");

      // Automatically select this new client in the tickets allocation selection!
      setIssueSelectedClient(newUser);

      // Close modal after a short delay
      setTimeout(() => {
        setShowCreateClientModal(false);
        setCreateClientSuccess("");
      }, 1500);
    } catch (err: any) {
      setCreateClientError(`Erro ao cadastrar: ${err?.message || String(err)}`);
    } finally {
      setCreateClientLoading(false);
    }
  };

  const handleSaveIssueTickets = async () => {
    if (!issueSelectedClient) {
      setIssueError("Selecione um cliente.");
      return;
    }
    if (!issueCampaignId) {
      setIssueError("Selecione uma rifa/campanha.");
      return;
    }

    const selectedCampaign = campaigns.find(c => c.id === issueCampaignId);
    if (!selectedCampaign) {
      setIssueError("Rifa/Campanha não encontrada.");
      return;
    }

    setIssueLoading(true);
    setIssueError(null);
    setIssueSuccess(null);

    try {
      const totalTickets = selectedCampaign.totalTickets;
      const padLength = totalTickets > 1000 ? 4 : totalTickets > 100 ? 3 : 2;
      const existingTickets = allReservations[issueCampaignId] || [];
      const takenNumbersSet = new Set(
        existingTickets
          .filter(t => t.status === "reserved" || t.status === "confirmed")
          .map(t => t.number)
      );

      let finalNumbersToAssign: string[] = [];

      if (issueNumbersType === "specific") {
        if (!issueSpecificNumbers.trim()) {
          setIssueError("Digite ao menos um número de bilhete.");
          setIssueLoading(false);
          return;
        }

        // Parse comma-separated numbers
        const parts = issueSpecificNumbers.split(",").map(p => p.trim()).filter(Boolean);
        const parsedNums: number[] = [];

        for (const p of parts) {
          const numVal = parseInt(p, 10);
          const isExpress = selectedCampaign.drawMode === "express";
          const minVal = isExpress ? 1 : 0;
          const maxVal = isExpress ? totalTickets : totalTickets - 1;
          if (isNaN(numVal) || numVal < minVal || numVal > maxVal) {
            setIssueError(`O número "${p}" é inválido. Para esta rifa, os números devem ir de ${minVal} a ${maxVal}.`);
            setIssueLoading(false);
            return;
          }
          parsedNums.push(numVal);
        }

        // Track and map with padding
        for (const n of parsedNums) {
          const padded = n.toString().padStart(padLength, "0");
          if (takenNumbersSet.has(padded)) {
            setIssueError(`O número "${padded}" já está reservado ou confirmado nesta campanha.`);
            setIssueLoading(false);
            return;
          }
          finalNumbersToAssign.push(padded);
        }

        // Avoid duplicates within input
        finalNumbersToAssign = Array.from(new Set(finalNumbersToAssign));
      } else {
        // Random Allocation
        const count = issueRandomCount;
        if (count < 1) {
          setIssueError("A quantidade de cotas deve ser de no mínimo 1.");
          setIssueLoading(false);
          return;
        }

        // Determine available pool
        const availablePool: string[] = [];
        const isExpress = selectedCampaign.drawMode === "express";
        const startIdx = isExpress ? 1 : 0;
        const endIdx = isExpress ? totalTickets : totalTickets - 1;
        for (let i = startIdx; i <= endIdx; i++) {
          const padded = i.toString().padStart(padLength, "0");
          if (!takenNumbersSet.has(padded)) {
            availablePool.push(padded);
          }
        }

        if (count > availablePool.length) {
          setIssueError(`Saldo de cotas livres insuficiente. Há apenas ${availablePool.length} cotas disponíveis.`);
          setIssueLoading(false);
          return;
        }

        // Shuffle and pick
        const shuffled = [...availablePool].sort(() => 0.5 - Math.random());
        finalNumbersToAssign = shuffled.slice(0, count);
      }

      if (finalNumbersToAssign.length === 0) {
        setIssueError("Nenhum número foi selecionado ou gerado.");
        setIssueLoading(false);
        return;
      }

      // Write documents to Firestore
      await Promise.all(
        finalNumbersToAssign.map((numStr) => {
          const ticketRef = doc(db, "campaigns", issueCampaignId, "tickets", numStr);
          const ticketData: Ticket = {
            id: numStr,
            number: numStr,
            status: issueStatus,
            buyerUid: issueSelectedClient.uid,
            buyerName: issueSelectedClient.name,
            buyerPhone: issueSelectedClient.phone,
            buyerCpf: issueSelectedClient.cpf,
            buyerEmail: issueSelectedClient.email,
            reservedAt: new Date().toISOString(),
            ...(issueStatus === "confirmed" ? { confirmedAt: new Date().toISOString() } : {})
          };
          return setDoc(ticketRef, ticketData);
        })
      );

      setIssueSuccess(`Sucesso! Foram lançadas ${finalNumbersToAssign.length} cotas (${finalNumbersToAssign.join(", ")}) com status "${issueStatus === "confirmed" ? "Pago" : "Pendente"}" para "${issueSelectedClient.name}".`);
      setIssueSpecificNumbers("");
      setIssueRandomCount(1);
    } catch (err: any) {
      console.error("Error manual issuing tickets:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `campaigns/${issueCampaignId}/tickets`);
      } catch (mappedErr: any) {
        setIssueError(`Erro ao gravar dados no Firebase: ${mappedErr?.message || String(mappedErr)}`);
      }
    } finally {
      setIssueLoading(false);
    }
  };

  const [loading, setLoading] = useState(true);

  // Load dynamically controlled settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (d) => {
      if (d.exists()) {
        setSettings(d.data() as any);
      }
    });
    return () => unsub();
  }, []);

  // 1. Listen to campaigns
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "campaigns"), (snapshot) => {
      const campList: Campaign[] = [];
      snapshot.forEach((d) => {
        campList.push({ id: d.id, ...d.data() } as Campaign);
      });
      setCampaigns(campList);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Fetch all clients profile
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const uList: UserProfile[] = [];
      snapshot.forEach((d) => {
        uList.push(d.data() as UserProfile);
      });
      setClients(uList);
    });
    return () => unsub();
  }, []);

  // 3. Listen to tickets across all campaigns
  useEffect(() => {
    if (campaigns.length === 0) return;

    const unsubscribes = campaigns.map((camp) => {
      const ref = collection(db, "campaigns", camp.id, "tickets");
      return onSnapshot(ref, (snapshot) => {
        const ticketList: Ticket[] = [];
        snapshot.forEach((d) => {
          ticketList.push(d.data() as Ticket);
        });

        setAllReservations((prev) => ({
          ...prev,
          [camp.id]: ticketList
        }));
      });
    });

    return () => unsubscribes.forEach((u) => u());
  }, [campaigns]);

  // Image processing
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImageError("Por favor, selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageError("A imagem é muito grande. Escolha uma imagem de até 10MB.");
      return;
    }

    setImageUploadLoading(true);
    setImageError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const cropSize = 512;
          canvas.width = cropSize;
          canvas.height = cropSize;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;

            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, cropSize, cropSize);
            const croppedBase64 = canvas.toDataURL("image/jpeg", 0.85);
            setNewCampaignImage(croppedBase64);
          } else {
            setImageError("Falha ao inicializar o processador de imagem.");
          }
        } catch (err) {
          console.error(err);
          setImageError("Erro ao recortar a imagem no padrão 1:1.");
        } finally {
          setImageUploadLoading(false);
        }
      };
      img.onerror = () => {
        setImageError("Erro ao carregar o arquivo de imagem.");
        setImageUploadLoading(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setImageError("Erro ao ler o arquivo.");
      setImageUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Image processing for editing campaign
  const handleEditImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setEditImageError("Por favor, selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setEditImageError("A imagem é muito grande. Escolha uma imagem de até 10MB.");
      return;
    }

    setEditImageUploadLoading(true);
    setEditImageError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const cropSize = 512;
          canvas.width = cropSize;
          canvas.height = cropSize;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;

            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, cropSize, cropSize);
            const croppedBase64 = canvas.toDataURL("image/jpeg", 0.85);
            setEditCampaignImage(croppedBase64);
          } else {
            setEditImageError("Falha ao inicializar o processador de imagem.");
          }
        } catch (err) {
          console.error(err);
          setEditImageError("Erro ao recortar a imagem no padrão 1:1.");
        } finally {
          setEditImageUploadLoading(false);
        }
      };
      img.onerror = () => {
        setEditImageError("Erro ao carregar o arquivo de imagem.");
        setEditImageUploadLoading(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setEditImageError("Erro ao ler o arquivo.");
      setEditImageUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleStartEditCampaign = (camp: Campaign) => {
    setEditingCampaign(camp);
    setEditCampaignTitle(camp.title);
    setEditCampaignDesc(camp.description);
    setEditCampaignPrice(camp.ticketPrice);
    setEditCampaignTotal(camp.totalTickets);
    setEditCampaignExpenses(camp.prizeExpenses || 0);
    setEditCampaignPrizesList(camp.prizesList || []);
    setEditPrizeName("");
    setEditPrizeCost("");
    setEditCampaignDrawDate(camp.drawDate || "");
    setEditCampaignDrawId(camp.federalLotteryDrawId || "");
    setEditCampaignDrawMode(camp.drawMode || "traditional");
    setEditCampaignStartDate(camp.startDate || "");
    setEditCampaignStartTime(camp.startTime || "");
    setEditCampaignImage(camp.imageUrl || "");
    if (camp.progressiveDiscounts && camp.progressiveDiscounts.length > 0) {
      setEditCampaignDiscounts(camp.progressiveDiscounts);
      setEditCampaignDiscountEnabled(true);
    } else {
      setEditCampaignDiscounts([]);
      setEditCampaignDiscountEnabled(false);
    }
    setEditImageError(null);
  };

  const handleUpdateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign || !editCampaignTitle.trim()) return;

    const updatedData: Partial<Campaign> = {
      title: editCampaignTitle,
      description: editCampaignDesc,
      ticketPrice: Number(editCampaignPrice),
      totalTickets: Number(editCampaignTotal),
      prizeExpenses: Number(editCampaignExpenses),
      prizesList: editCampaignPrizesList,
      drawMode: editCampaignDrawMode,
    };

    if (editCampaignImage.trim()) {
      updatedData.imageUrl = editCampaignImage.trim();
    } else {
      updatedData.imageUrl = "";
    }
    if (editCampaignDrawDate.trim()) {
      updatedData.drawDate = editCampaignDrawDate.trim();
    } else {
      updatedData.drawDate = "";
    }
    if (editCampaignDrawId.trim()) {
      updatedData.federalLotteryDrawId = editCampaignDrawId.trim();
    } else {
      updatedData.federalLotteryDrawId = "";
    }
    if (editCampaignStartDate.trim()) {
      updatedData.startDate = editCampaignStartDate.trim();
    } else {
      updatedData.startDate = "";
    }
    if (editCampaignStartTime.trim()) {
      updatedData.startTime = editCampaignStartTime.trim();
    } else {
      updatedData.startTime = "";
    }

    if (editCampaignDiscountEnabled && editCampaignDiscounts.length > 0) {
      updatedData.progressiveDiscounts = editCampaignDiscounts;
    } else {
      updatedData.progressiveDiscounts = [];
    }

    try {
      await updateDoc(doc(db, "campaigns", editingCampaign.id), updatedData);
      setEditingCampaign(null);
    } catch (err) {
      console.error("Error updating campaign:", err);
      handleFirestoreError(err, OperationType.WRITE, `campaigns/${editingCampaign.id}`);
    }
  };

  // Campaign create helper
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignTitle.trim()) return;

    const campaignId = `camp_${Date.now()}`;
    const newCamp: Campaign = {
      id: campaignId,
      title: newCampaignTitle,
      description: newCampaignDesc,
      ticketPrice: Number(newCampaignPrice),
      totalTickets: Number(newCampaignTotal),
      status: "active",
      prizeExpenses: Number(newCampaignExpenses || 0),
      prizesList: newCampaignPrizesList,
      createdAt: new Date().toISOString(),
      drawMode: newCampaignDrawMode,
    };

    if (newCampaignImage.trim()) {
      newCamp.imageUrl = newCampaignImage.trim();
    }
    if (newCampaignDrawDate.trim()) {
      newCamp.drawDate = newCampaignDrawDate.trim();
    }
    if (newCampaignDrawId.trim()) {
      newCamp.federalLotteryDrawId = newCampaignDrawId.trim();
    }
    if (newCampaignStartDate.trim()) {
      newCamp.startDate = newCampaignStartDate.trim();
    }
    if (newCampaignStartTime.trim()) {
      newCamp.startTime = newCampaignStartTime.trim();
    }

    if (newCampaignDiscountEnabled && newCampaignDiscounts.length > 0) {
      newCamp.progressiveDiscounts = newCampaignDiscounts;
    }

    try {
      await setDoc(doc(db, "campaigns", campaignId), newCamp);
      // Reset forms
      setNewCampaignTitle("");
      setNewCampaignDesc("");
      setNewCampaignPrice(10);
      setNewCampaignTotal(100);
      setNewCampaignExpenses(0);
      setNewCampaignPrizesList([]);
      setNewPrizeName("");
      setNewPrizeCost("");
      setNewCampaignDrawDate("");
      setNewCampaignDrawId("");
      setNewCampaignDrawMode("traditional");
      setNewCampaignStartDate("");
      setNewCampaignStartTime("");
      setNewCampaignImage("");
      setNewCampaignDiscounts([]);
      setNewCampaignDiscountEnabled(false);
      setShowCampaignForm(false);
    } catch (err) {
      console.error("Error creating campaign:", err);
      handleFirestoreError(err, OperationType.WRITE, `campaigns/${campaignId}`);
    }
  };

  const handleAddNewCampaignPrize = () => {
    if (!newPrizeName.trim()) return;
    const costVal = parseFloat(newPrizeCost) || 0;
    const updatedPrizes = [...newCampaignPrizesList, { name: newPrizeName.trim(), cost: costVal }];
    setNewCampaignPrizesList(updatedPrizes);
    
    // Update campaign total expenses
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setNewCampaignExpenses(sum);
    
    setNewPrizeName("");
    setNewPrizeCost("");
  };

  const handleRemoveNewCampaignPrize = (index: number) => {
    const updatedPrizes = newCampaignPrizesList.filter((_, idx) => idx !== index);
    setNewCampaignPrizesList(updatedPrizes);
    
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setNewCampaignExpenses(sum);
  };

  const handleAddEditCampaignPrize = () => {
    if (!editPrizeName.trim()) return;
    const costVal = parseFloat(editPrizeCost) || 0;
    const updatedPrizes = [...editCampaignPrizesList, { name: editPrizeName.trim(), cost: costVal }];
    setEditCampaignPrizesList(updatedPrizes);
    
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setEditCampaignExpenses(sum);
    
    setEditPrizeName("");
    setEditPrizeCost("");
  };

  const handleRemoveEditCampaignPrize = (index: number) => {
    const updatedPrizes = editCampaignPrizesList.filter((_, idx) => idx !== index);
    setEditCampaignPrizesList(updatedPrizes);
    
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setEditCampaignExpenses(sum);
  };


  const handleSelectAdjCampaign = (campaignId: string) => {
    setSelectedAdjCampaignId(campaignId);
    setAdjSuccessMsg("");
    if (!campaignId) {
      setAdjPrizesList([]);
      setAdjExpenses(0);
      return;
    }
    const camp = campaigns.find(c => c.id === campaignId);
    if (camp) {
      setAdjPrizesList(camp.prizesList || []);
      setAdjExpenses(camp.prizeExpenses || 0);
    }
  };

  const handleAddAdjPrize = () => {
    if (!adjPrizeName.trim()) return;
    const costVal = parseFloat(adjPrizeCost) || 0;
    const updatedPrizes = [...adjPrizesList, { name: adjPrizeName.trim(), cost: costVal }];
    setAdjPrizesList(updatedPrizes);
    
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setAdjExpenses(sum);
    
    setAdjPrizeName("");
    setAdjPrizeCost("");
  };

  const handleRemoveAdjPrize = (index: number) => {
    const updatedPrizes = adjPrizesList.filter((_, idx) => idx !== index);
    setAdjPrizesList(updatedPrizes);
    
    const sum = updatedPrizes.reduce((acc, p) => acc + p.cost, 0);
    setAdjExpenses(sum);
  };

  const handleSaveCashAdjustment = async () => {
    if (!selectedAdjCampaignId) return;
    setAdjSaving(true);
    setAdjSuccessMsg("");
    try {
      await updateDoc(doc(db, "campaigns", selectedAdjCampaignId), {
        prizeExpenses: Number(adjExpenses),
        prizesList: adjPrizesList
      });
      setAdjSuccessMsg("Ajuste de caixa salvo com sucesso!");
      setTimeout(() => setAdjSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Error saving cash adjustment:", err);
      alert("Erro ao realizar ajuste de caixa.");
    } finally {
      setAdjSaving(false);
    }
  };


  const handleToggleStatus = async (id: string, currentStatus: "active" | "paused") => {
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    try {
      await updateDoc(doc(db, "campaigns", id), { status: nextStatus });
    } catch (err) {
      console.error("Error toggling campaign status:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${id}`);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm("Deseja realmente deletar esta campanha? Todos os ingressos associados serão apagados permanentemente.")) return;

    try {
      // 1. Delete all subcollection tickets under campaigns/{id}/tickets to avoid orphaned documents in Firebase
      const ticketsList = allReservations[id] || [];
      if (ticketsList.length > 0) {
        const deletePromises = ticketsList.map(async (t) => {
          const ticketRef = doc(db, "campaigns", id, "tickets", t.number);
          await deleteDoc(ticketRef);
        });
        await Promise.all(deletePromises);
      }

      // 2. Delete the campaign document itself
      await deleteDoc(doc(db, "campaigns", id));
      alert("Campanha e todas as suas cotas associadas foram permanentemente removidas do Firebase.");
    } catch (err) {
      console.error("Error deleting campaign:", err);
      handleFirestoreError(err, OperationType.DELETE, `campaigns/${id}`);
    }
  };

  // Winning draw logic
  const handleSaveDrawResult = async (id: string) => {
    if (!drawWinnerCode.trim() || !drawWinnerDate.trim() || !drawWinnerContestId.trim()) return;

    try {
      const camp = campaigns.find((c) => c.id === id);
      const total = camp?.totalTickets || 100;
      const cleanDrawVal = drawWinnerCode.trim().padStart(6, "0");
      
      let targetLength = 2;
      if (total <= 100) {
        targetLength = 2;
      } else if (total <= 1000) {
        targetLength = 3;
      } else if (total <= 10000) {
        targetLength = 4;
      } else {
        targetLength = String(total - 1).length;
      }

      const extractedNumber = cleanDrawVal.substring(6 - targetLength);
      const padLength = total > 1000 ? 4 : total > 100 ? 3 : 2;
      const finalWinningNumber = extractedNumber.padStart(padLength, "0");

      await updateDoc(doc(db, "campaigns", id), {
        status: "drawn",
        winningNumber: finalWinningNumber,
        federalLotteryNumber: drawWinnerCode.trim(),
        drawDate: drawWinnerDate.trim(),
        drawHour: drawWinnerHour.trim(),
        federalLotteryDrawId: drawWinnerContestId.trim()
      });
      setDrawingCampaignId(null);
      setDrawWinnerCode("");
      setDrawWinnerDate("");
      setDrawWinnerHour("");
      setDrawWinnerContestId("");
    } catch (err) {
      console.error("Error drawing campaign:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${id}`);
    }
  };

  const handleRevertDraw = async (ca: Campaign) => {
    if (!window.confirm(`Deseja realmente reverter o sorteio de "${ca.title}"? Ela será reativada e o número do bilhete ganhador (${ca.winningNumber}) será limpo do sistema, permitindo que novas compras ou um novo sorteio sejam realizados.`)) return;

    try {
      await updateDoc(doc(db, "campaigns", ca.id), {
        status: "active",
        winningNumber: "",
        federalLotteryNumber: "",
        drawDate: "",
        drawHour: "",
        federalLotteryDrawId: ""
      });
      alert("Sorteio revertido com sucesso! A campanha se encontra 'Ativa' novamente.");
    } catch (err) {
      console.error("Error reverting draw:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${ca.id}`);
    }
  };

  const handleExpressDraw = async (ca: Campaign) => {
    const ticketsList = allReservations[ca.id] || [];
    const confirmedTickets = ticketsList.filter(t => t.status === "confirmed");

    if (confirmedTickets.length === 0) {
      alert("Nenhum de seus bilhetes foi pago (confirmado) nesta campanha de modalidade expressa ainda. Não é possível realizar o sorteio sem nenhuma cota confirmada.");
      return;
    }

    if (!window.confirm(`Deseja realmente sortear a cota contemplada para "${ca.title}" agora? Um ganhador será definido aleatoriamente entre as ${confirmedTickets.length} cotas confirmadas (pagas).`)) return;

    try {
      const randomIndex = Math.floor(Math.random() * confirmedTickets.length);
      const winningTicket = confirmedTickets[randomIndex];
      
      const now = new Date();
      const drawDateStr = now.toLocaleDateString("pt-BR");
      const drawHourStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      await updateDoc(doc(db, "campaigns", ca.id), {
        status: "drawn",
        winningNumber: winningTicket.number,
        drawDate: drawDateStr,
        drawHour: drawHourStr
      });

      alert(`Sorteio realizado com sucesso! O bilhete contemplado foi #${winningTicket.number} comprado por ${winningTicket.buyerName || "Cliente Desconhecido"}.`);
    } catch (err) {
      console.error("Error running express draw:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${ca.id}`);
    }
  };

  // Ticket processing helpers
  const handleConfirmPayment = async (campaignId: string, ticketId: string) => {
    try {
      const ref = doc(db, "campaigns", campaignId, "tickets", ticketId);
      await updateDoc(ref, {
        status: "confirmed",
        confirmedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error confirming payment:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campaignId}/tickets/${ticketId}`);
    }
  };

  const handleReleaseReservation = async (campaignId: string, ticketId: string) => {
    if (!window.confirm("Liberar este bilhete? Ele voltará a ficar disponível para compra.")) return;

    try {
      const ref = doc(db, "campaigns", campaignId, "tickets", ticketId);
      await deleteDoc(ref);
    } catch (err) {
      console.error("Error deleting/canceling reservation:", err);
      handleFirestoreError(err, OperationType.DELETE, `campaigns/${campaignId}/tickets/${ticketId}`);
    }
  };

  const handleConfirmBatchPayment = async (campaignId: string, ticketIds: string[], batchId: string) => {
    setBatchLoading(batchId);
    try {
      await Promise.all(
        ticketIds.map((ticketId) => {
          const ref = doc(db, "campaigns", campaignId, "tickets", ticketId);
          return updateDoc(ref, {
            status: "confirmed",
            confirmedAt: new Date().toISOString()
          });
        })
      );
    } catch (err) {
      console.error("Error confirming batch payment:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campaignId}/tickets`);
    } finally {
      setBatchLoading(null);
    }
  };

  const handleReleaseBatchReservation = async (campaignId: string, ticketIds: string[], batchId: string, hasConfirmed: boolean) => {
    const confirmMessage = hasConfirmed
      ? `Atenção: Este lote possui bilhetes PAGOS. Tem certeza de que deseja liberar/excluir todos os ${ticketIds.length} bilhetes deste lote? Eles voltarão ao estoque.`
      : `Deseja liberar/excluir todas as ${ticketIds.length} reservas deste lote? Os bilhetes voltarão a ficar disponíveis.`;
    
    if (!window.confirm(confirmMessage)) return;

    setBatchLoading(batchId);
    try {
      await Promise.all(
        ticketIds.map((ticketId) => {
          const ref = doc(db, "campaigns", campaignId, "tickets", ticketId);
          return deleteDoc(ref);
        })
      );
    } catch (err) {
      console.error("Error canceling batch reservation:", err);
      handleFirestoreError(err, OperationType.DELETE, `campaigns/${campaignId}/tickets`);
    } finally {
      setBatchLoading(null);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1.5 * 1024 * 1024) {
        alert("A imagem selecionada é muito grande! Escolha uma imagem de até 1.5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings(prev => ({ ...prev, logoBase64: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Global settings submit
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, "settings", "global"), settings);
      alert("Configurações atualizadas globalmente no banco com sucesso!");
    } catch (err) {
      console.error("Error updating settings:", err);
      alert("Falha ao salvar preferências no servidor.");
      handleFirestoreError(err, OperationType.WRITE, "settings/global");
    }
  };

  // Computed statistics (Metrics calculation)
  const computedStats = useMemo(() => {
    let totalConfirmedAmount = 0;
    let totalPendingAmount = 0;
    let totalConfirmedTickets = 0;
    let totalReservedTickets = 0;
    let totalCapacity = 0;

    campaigns.forEach((ca) => {
      totalCapacity += ca.totalTickets;
      const tickets = allReservations[ca.id] || [];
      tickets.forEach((t) => {
        if (t.status === "confirmed") {
          totalConfirmedTickets += 1;
          totalConfirmedAmount += ca.ticketPrice;
        } else if (t.status === "reserved") {
          totalReservedTickets += 1;
          totalPendingAmount += ca.ticketPrice;
        }
      });
    });

    const totalSold = totalConfirmedTickets + totalReservedTickets;
    const fillRate = totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0;
    const confirmedRate = totalCapacity > 0 ? (totalConfirmedTickets / totalCapacity) * 100 : 0;

    return {
      totalConfirmedAmount,
      totalPendingAmount,
      totalConfirmedTickets,
      totalReservedTickets,
      totalCapacity,
      totalSold,
      fillRate,
      confirmedRate
    };
  }, [campaigns, allReservations]);

  interface TicketBatch {
    campaign: Campaign;
    buyerName: string;
    buyerPhone?: string;
    buyerCpf?: string;
    buyerEmail?: string;
    buyerUid?: string;
    tickets: Ticket[];
    statusSummary: {
      reservedCount: number;
      confirmedCount: number;
    };
  }

  // Group reservations by campaign & buyer to implement batch confirmations/releases
  const ticketBatches = useMemo<TicketBatch[]>(() => {
    const list: TicketBatch[] = [];

    campaigns.forEach((ca) => {
      const ticketsForCamp = allReservations[ca.id] || [];

      // Filter by reservationFilter if necessary
      const filteredTickets = ticketsForCamp.filter((t) => {
        if (reservationFilter === "reserved") return t.status === "reserved";
        if (reservationFilter === "confirmed") return t.status === "confirmed";
        return true;
      });

      // Group filteredTickets by a key that represents the buyer first
      const groups: { [key: string]: Ticket[] } = {};
      filteredTickets.forEach((t) => {
        const key = t.buyerPhone || t.buyerCpf || t.buyerEmail || t.buyerName || "Mapeado manualmente";
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(t);
      });

      Object.entries(groups).forEach(([buyerKey, tList]) => {
        // Split this buyer's tickets into separate batches
        const batches = splitTicketsIntoBatches(tList);
        batches.forEach((batch) => {
          const firstTicket = batch[0];
          const reservedCount = batch.filter((t) => t.status === "reserved").length;
          const confirmedCount = batch.filter((t) => t.status === "confirmed").length;

          list.push({
            campaign: ca,
            buyerName: firstTicket.buyerName || "Mapeado manualmente",
            buyerPhone: firstTicket.buyerPhone,
            buyerCpf: firstTicket.buyerCpf,
            buyerEmail: firstTicket.buyerEmail,
            buyerUid: firstTicket.buyerUid,
            tickets: batch,
            statusSummary: {
              reservedCount,
              confirmedCount,
            },
          });
        });
      });
    });

    // Sort batches by recent reservation date (max reservedAt among tickets in batch)
    return list.sort((a, b) => {
      const aMaxDate = a.tickets.reduce((max, t) => (t.reservedAt && t.reservedAt > max ? t.reservedAt : max), "");
      const bMaxDate = b.tickets.reduce((max, t) => (t.reservedAt && t.reservedAt > max ? t.reservedAt : max), "");
      return bMaxDate.localeCompare(aMaxDate);
    });
  }, [campaigns, allReservations, reservationFilter]);

  // Filters listings
  const filteredCampaigns = campaigns.filter((ca) =>
    ca.title.toLowerCase().includes(campaignSearch.toLowerCase())
  );

  const isBatchVip = (batch: any) => {
    return clients.some((cl) => {
      if (!cl.isVip) return false;
      const cleanClPhone = cl.phone?.replace(/\D/g, "");
      const cleanTkPhone = batch.buyerPhone?.replace(/\D/g, "");
      const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
      const cpfMatch = cl.cpf && batch.buyerCpf && cl.cpf.replace(/\D/g, "") === batch.buyerCpf.replace(/\D/g, "");
      const emailMatch = cl.email && batch.buyerEmail && cl.email.trim().toLowerCase() === batch.buyerEmail.trim().toLowerCase();
      const uidMatch = cl.uid && batch.buyerUid && cl.uid === batch.buyerUid;
      return phoneMatch || cpfMatch || emailMatch || uidMatch;
    });
  };

  // Identify VIP eligibility based on cumulative single purchase checks (at least 10 tickets at once)
  const eligibleVipClientsMap = useMemo(() => {
    const map: {
      [clientUid: string]: {
        maxSinglePurchaseCount: number;
        qualifyingBatches: { campaignTitle: string; count: number; date: string }[];
      };
    } = {};

    clients.forEach((cl) => {
      map[cl.uid] = { maxSinglePurchaseCount: 0, qualifyingBatches: [] };
    });

    Object.entries(allReservations).forEach(([campaignId, tickets]) => {
      const ca = campaigns.find((c) => c.id === campaignId);
      if (!ca) return;

      const ticketsList = (tickets as Ticket[]) || [];
      const groups: { [buyerKey: string]: Ticket[] } = {};
      ticketsList.forEach((t) => {
        const key = t.buyerPhone || t.buyerCpf || t.buyerEmail || t.buyerName || "Mapeado manualmente";
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(t);
      });

      Object.entries(groups).forEach(([buyerKey, tList]) => {
        const batches = splitTicketsIntoBatches(tList);
        batches.forEach((batch) => {
          const confirmedTicketsInBatch = batch.filter((t) => t.status === "confirmed");
          const count = confirmedTicketsInBatch.length;
          if (count > 0) {
            const firstTick = confirmedTicketsInBatch[0] || batch[0];
            const matchingClient = clients.find((cl) => {
              const cleanClPhone = cl.phone?.replace(/\D/g, "");
              const cleanTkPhone = firstTick.buyerPhone?.replace(/\D/g, "");
              const phoneMatch = cleanClPhone && cleanTkPhone && cleanClPhone === cleanTkPhone;
              const cpfMatch = cl.cpf && firstTick.buyerCpf && cl.cpf.replace(/\D/g, "") === firstTick.buyerCpf.replace(/\D/g, "");
              const emailMatch = cl.email && firstTick.buyerEmail && cl.email.trim().toLowerCase() === firstTick.buyerEmail.trim().toLowerCase();
              const uidMatch = cl.uid && firstTick.buyerUid && cl.uid === firstTick.buyerUid;
              return phoneMatch || cpfMatch || emailMatch || uidMatch;
            });

            if (matchingClient) {
              const entry = map[matchingClient.uid];
              if (entry) {
                if (count > entry.maxSinglePurchaseCount) {
                  entry.maxSinglePurchaseCount = count;
                }
                const dateStr = firstTick.confirmedAt 
                  ? new Date(firstTick.confirmedAt).toLocaleDateString("pt-BR") 
                  : (firstTick.reservedAt ? new Date(firstTick.reservedAt).toLocaleDateString("pt-BR") : "----");
                
                // Avoid duplicating the exact same batch log
                const exists = entry.qualifyingBatches.some(
                  (qb) => qb.campaignTitle === ca.title && qb.count === count && qb.date === dateStr
                );
                if (count >= 10 && !exists) {
                  entry.qualifyingBatches.push({
                    campaignTitle: ca.title,
                    count,
                    date: dateStr,
                  });
                }
              }
            }
          }
        });
      });
    });

    return map;
  }, [campaigns, allReservations, clients]);

  const filteredClients = clients.filter((cl) => {
    // 1. Search text filter
    const matchesSearch =
      cl.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      cl.cpf.includes(clientSearch) ||
      cl.email.toLowerCase().includes(clientSearch.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Filter client tab
    if (clientFilterTab === "vip_only") {
      return cl.isVip;
    }
    if (clientFilterTab === "eligible_vip") {
      const result = eligibleVipClientsMap[cl.uid];
      return result && result.qualifyingBatches.length > 0;
    }
    return true;
  }).sort((a, b) => {
    if (clientSortBy === "name") {
      const nameA = a.name || "";
      const nameB = b.name || "";
      return clientSortOrder === "asc"
        ? nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" })
        : nameB.localeCompare(nameA, "pt-BR", { sensitivity: "base" });
    } else {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return clientSortOrder === "asc" ? timeA - timeB : timeB - timeA;
    }
  });

  return (
    <div className="space-y-6">
      {/* Admin header */}
      <header className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1.5 flex items-center gap-4">
          <AppLogo settings={settings as any} size="md" className="ring-2 ring-yellow-400" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Rifa do Chiquinho</h1>
            <p className="text-slate-400 text-xs">Painel Coletor Administrativo de Campanhas</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-2xl border border-slate-700/50 hover:bg-slate-700 font-medium text-xs transition cursor-pointer"
        >
          Sair do Painel
        </button>
      </header>

      {/* 6 Tab Buttons Navigation Panel */}
      <div className="overflow-x-auto pb-1.5 scrollbar-thin">
        <div className="flex bg-slate-100 rounded-2xl p-1.5 gap-1.5 min-w-[850px] md:min-w-0">
          <button
            onClick={() => setActiveTab("metrics")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "metrics" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Métricas
          </button>
          <button
            onClick={() => setActiveTab("reservations")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "reservations" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Coins className="w-4 h-4 text-indigo-600" />
            Reservas
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "config" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-indigo-600" />
            Configuração
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "campaigns" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            Campanhas
          </button>
          <button
            onClick={() => setActiveTab("winners")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "winners" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-500 animate-pulse" />
            Ganhadores
          </button>
          <button
            onClick={() => setActiveTab("expressDraw")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer min-w-[170px] ${
              activeTab === "expressDraw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            Sorteio Expressas ⚡
          </button>
          <button
            onClick={() => setActiveTab("clients")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "clients" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Clientes ({clients.length})
          </button>
          <button
            onClick={() => setActiveTab("pricing")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "pricing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-600 font-bold" />
            Precificação
          </button>
          <button
            onClick={() => setActiveTab("backup")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "backup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Database className="w-4 h-4 text-indigo-600" />
            Backup & Dados
          </button>
        </div>
      </div>

      {/* Tab content renderer */}
      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 min-h-[440px]">
        {activeTab === "metrics" && (
          <DashboardOverview
            campaigns={campaigns}
            allReservations={allReservations}
            clientsCount={clients.length}
            clients={clients}
            vipDiscountPct={settings.vipDiscountPercentage}
          />
        )}

        {activeTab === "pricing" && (
          <PricingDashboard campaigns={campaigns} />
        )}

        {activeTab === "reservations" && (
          /* SECTION 2: RESERVATIONS AND MANUAL PAYMENTS CONFIRMATIONS */
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg">Gerenciamento de Reservas</h2>
              <p className="text-xs text-slate-400">Verifique os comprovantes de pagamento e libere ou confirme as cotas adquiridas.</p>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
              {/* Filter pills */}
              <div className="flex border border-slate-200 rounded-xl p-1 bg-slate-50 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setReservationFilter("all")}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-[10px] uppercase cursor-pointer text-center inline-flex items-center justify-center ${
                    reservationFilter === "all" ? "bg-white text-slate-800 shadow" : "text-slate-500"
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setReservationFilter("reserved")}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-[10px] uppercase cursor-pointer text-center inline-flex items-center justify-center ${
                    reservationFilter === "reserved" ? "bg-white text-slate-800 shadow" : "text-slate-500"
                  }`}
                >
                  Pendentes PIX
                </button>
                <button
                  type="button"
                  onClick={() => setReservationFilter("confirmed")}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-[10px] uppercase cursor-pointer text-center inline-flex items-center justify-center ${
                    reservationFilter === "confirmed" ? "bg-white text-slate-800 shadow relative" : "text-slate-500"
                  }`}
                >
                  Confirmados
                </button>
              </div>

              {/* View Mode pills */}
              <div className="flex border border-slate-200 rounded-xl p-1 bg-slate-50 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setGroupReservationsByBuyer(false)}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-[10px] uppercase cursor-pointer text-center inline-flex items-center justify-center ${
                    !groupReservationsByBuyer ? "bg-white text-slate-800 shadow" : "text-slate-500"
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setGroupReservationsByBuyer(true)}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-[10px] uppercase cursor-pointer text-center inline-flex items-center justify-center gap-1.5 ${
                    groupReservationsByBuyer ? "bg-white text-slate-800 shadow" : "text-slate-500"
                  }`}
                >
                  <span>Por Lote</span>
                  <span className="bg-indigo-100 text-indigo-700 text-[8px] px-1 py-0.2 rounded font-extrabold">Novo</span>
                </button>
              </div>
            </div>

            {/* Big list display of all reservations (Desktop/Tablet) */}
            <div className="hidden md:block overflow-x-auto">
              {!groupReservationsByBuyer ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Rifa / Bilhete</th>
                      <th className="py-3 px-4">Cliente (Comprador)</th>
                      <th className="py-3 px-4">Contato (Celular/CPF)</th>
                      <th className="py-3 px-4">Data / Status</th>
                      <th className="py-3 px-4 text-right">Liberar / Validar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.flatMap((ca) => {
                      const ticketsForCamp = allReservations[ca.id] || [];

                      return ticketsForCamp
                        .filter((t) => {
                          if (reservationFilter === "reserved") return t.status === "reserved";
                          if (reservationFilter === "confirmed") return t.status === "confirmed";
                          return true;
                        })
                        .map((t) => (
                          <tr key={`${ca.id}_${t.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-4 px-4">
                              <span className="font-extrabold text-slate-800 text-sm font-mono block">#{t.number}</span>
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] block">
                                {ca.title}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-slate-800 block">{t.buyerName || "Mapeado manualmente"}</span>
                              <span className="text-[10px] text-slate-400 block">{t.buyerEmail}</span>
                            </td>
                            <td className="py-4 px-4 text-slate-600">
                              {t.buyerPhone ? (() => {
                                const clean = t.buyerPhone.replace(/\D/g, "");
                                const url = `https://wa.me/55${clean}`;
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold">{t.buyerPhone}</span>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center justify-center p-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-full transition"
                                      title="Chamar no WhatsApp"
                                    >
                                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                        <path d="M12.022 2C6.5 2 2 6.5 2 12.022c0 1.766.457 3.428 1.256 4.887L1.13 22.872a.5.5 0 0 0 .61.61l5.963-2.126a10.024 10.024 0 0 0 4.319.98c5.522 0 10.022-4.5 10.022-10.022C22.044 6.5 17.544 2 12.022 2zm6.183 14.881c-.267.755-1.35 1.4-1.85 1.455-.453.05-1.042.043-1.684-.162-2.336-.745-3.92-.128-5.882-2.09l-.162-.162c-1.93-1.934-2.58-3.565-1.83-5.912l.142-.446c.162-.513.56-1.114 1.114-1.114l.812.001c.219 0 .425.043.513.26l.462 1.127.35.856c.088.219.013.438-.13.585l-.546.546c-.075.075-.1.175-.05.275.462.91 1.05 1.745 1.745 2.441.724.724 1.572 1.3 2.502 1.743.1.052.2.028.275-.05l.546-.546c.142-.143.367-.219.585-.13l1.983.812c.219.088.256.326.2.55z" />
                                      </svg>
                                    </a>
                                  </div>
                                );
                              })() : (
                                <div className="text-slate-400">Sem contato</div>
                              )}
                              <div className="text-[10px] text-slate-400 font-mono">CPF: {t.buyerCpf || "Simulado"}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block text-center max-w-[90px] ${
                                  t.status === "confirmed"
                                    ? "bg-indigo-50 text-indigo-850 border border-indigo-250/20"
                                    : "bg-amber-50 text-amber-850 border border-amber-250/20"
                                }`}>
                                  {t.status === "confirmed" ? "Pago (Ok)" : "Pendente"}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {t.reservedAt ? new Date(t.reservedAt).toLocaleString("pt-BR") : "S/ data"}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {t.status === "reserved" && (
                                  <button
                                    onClick={() => handleConfirmPayment(ca.id, t.id)}
                                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                                    title="Confirmar pagamento Recebido"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Confirmar Pago</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptCampaign(ca);
                                    setReceiptClientName(t.buyerName || "Mapeado manualmente");
                                    setReceiptClientCpf(t.buyerCpf || "");
                                    setReceiptClientPhone(t.buyerPhone || "");
                                    setReceiptClientEmail(t.buyerEmail || "");
                                    setReceiptTickets([t]);
                                    setReceiptStatus(t.status);
                                    setReceiptTheme("emerald");
                                    setReceiptCustomNote("Obrigado pela preferência e muita boa sorte!");
                                    setShowReceiptModal(true);
                                  }}
                                  className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg font-bold flex items-center gap-1 cursor-pointer text-[11px]"
                                  title="Emitir recibo para esta cota"
                                >
                                  <FileText className="w-3.5 h-3.5 text-indigo-650" />
                                  <span>Recibo</span>
                                </button>

                                <button
                                  onClick={() => handleReleaseReservation(ca.id, t.id)}
                                  className={`px-2 py-1.5 rounded-lg border font-bold flex items-center gap-1 cursor-pointer transition ${
                                    t.status === "confirmed"
                                      ? "text-slate-400 hover:text-red-600 border-slate-200 hover:border-red-200 hover:bg-red-50"
                                      : "text-red-500 hover:text-red-700 border-red-100 hover:bg-red-50"
                                  }`}
                                  title="Cancelar reserva e liberar bilhete"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>{t.status === "confirmed" ? "Excluir" : "Liberar"}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ));
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Campanha (Rifa)</th>
                      <th className="py-3 px-4">Cliente (Comprador)</th>
                      <th className="py-3 px-4">Contato / CPF</th>
                      <th className="py-3 px-4 text-center">Cotas no Lote</th>
                      <th className="py-3 px-4 text-center">Valor Estimado</th>
                      <th className="py-3 px-4 text-right">Ação em Lote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketBatches.map((batch) => {
                      const firstTicket = batch.tickets[0];
                      const subBatchId = firstTicket?.batchId || (firstTicket?.reservedAt ? `time_${new Date(firstTicket.reservedAt).getTime()}` : "legacy");
                      const batchId = `${batch.campaign.id}_${batch.buyerPhone || batch.buyerEmail || batch.buyerName}_${subBatchId}`;
                      const reservedTickets = batch.tickets.filter((t) => t.status === "reserved");
                      const reservedIds = reservedTickets.map((t) => t.id);
                      const allIds = batch.tickets.map((t) => t.id);
                      const isCurrentlyLoading = batchLoading === batchId;

                      const calcPrice = getDiscountedPrice(
                        batch.tickets.length,
                        batch.campaign.ticketPrice,
                        batch.campaign.progressiveDiscounts,
                        isBatchVip(batch),
                        settings.vipDiscountPercentage
                      );

                      return (
                        <tr key={batchId} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="py-4 px-4">
                            <span className="font-extrabold text-slate-800 text-sm block">
                              {batch.campaign.title}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold font-mono">
                              ID: {batch.campaign.id}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="font-bold text-slate-800 block">{batch.buyerName}</span>
                            <span className="text-[10px] text-slate-400 block">{batch.buyerEmail || "sem e-mail"}</span>
                          </td>
                          <td className="py-4 px-4 text-slate-600">
                            {batch.buyerPhone ? (() => {
                              const clean = batch.buyerPhone.replace(/\D/g, "");
                              const url = `https://wa.me/55${clean}`;
                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold">{batch.buyerPhone}</span>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center p-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-full transition"
                                    title="Chamar no WhatsApp"
                                  >
                                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                      <path d="M12.022 2C6.5 2 2 6.5 2 12.022c0 1.766.457 3.428 1.256 4.887L1.13 22.872a.5.5 0 0 0 .61.61l5.963-2.126a10.024 10.024 0 0 0 4.319.98c5.522 0 10.022-4.5 10.022-10.022C22.044 6.5 17.544 2 12.022 2zm6.183 14.881c-.267.755-1.35 1.4-1.85 1.455-.453.05-1.042.043-1.684-.162-2.336-.745-3.92-.128-5.882-2.09l-.162-.162c-1.93-1.934-2.58-3.565-1.83-5.912l.142-.446c.162-.513.56-1.114 1.114-1.114l.812.001c.219 0 .425.043.513.26l.462 1.127.35.856c.088.219.013.438-.13.585l-.546.546c-.075.075-.1.175-.05.275.462.91 1.05 1.745 1.745 2.441.724.724 1.572 1.3 2.502 1.743.1.052.2.028.275-.05l.546-.546c.142-.143.367-.219.585-.13l1.983.812c.219.088.256.326.2.55z" />
                                    </svg>
                                  </a>
                                </div>
                              );
                            })() : (
                              <div className="text-slate-400">Sem telefone</div>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono">CPF: {batch.buyerCpf || "Simulado"}</div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-2.5 py-1 text-xs">
                                {batch.tickets.length} cota(s)
                              </span>
                              <div className="flex flex-wrap gap-1 justify-center max-w-[180px] mt-1.5">
                                {batch.tickets.map((t) => (
                                  <span key={t.id} className={`font-mono text-[9px] font-bold px-1 rounded ${
                                    t.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-850"
                                  }`}>
                                    #{t.number}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="font-mono font-bold text-slate-900 text-sm">
                              R$ {calcPrice.totalPrice.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              R$ {calcPrice.unitPrice.toFixed(2)} p/ cota
                              {calcPrice.appliedDiscount && (
                                <span className="block text-indigo-600 font-bold font-sans">c/ desc. lote</span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {reservedTickets.length > 0 ? (
                                <button
                                  type="button"
                                  disabled={isCurrentlyLoading}
                                  onClick={() => handleConfirmBatchPayment(batch.campaign.id, reservedIds, batchId)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shadow-sm text-[11px]"
                                  title="Confirmar pagamento em lote"
                                >
                                  {isCurrentlyLoading ? (
                                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-1" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>Baixar Lote ({reservedTickets.length})</span>
                                </button>
                              ) : (
                                <span className="text-[10px] bg-slate-100 text-slate-650 px-2.5 py-1.5 rounded-lg font-semibold">
                                  Totalmente Pago
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setReceiptCampaign(batch.campaign);
                                  setReceiptClientName(batch.buyerName);
                                  setReceiptClientCpf(batch.buyerCpf || "");
                                  setReceiptClientPhone(batch.buyerPhone || "");
                                  setReceiptClientEmail(batch.buyerEmail || "");
                                  setReceiptTickets(batch.tickets);
                                  setReceiptStatus(batch.tickets.every(t => t.status === "confirmed") ? "confirmed" : "reserved");
                                  setReceiptTheme("emerald");
                                  setReceiptCustomNote("Obrigado pela preferência e muita boa sorte!");
                                  setShowReceiptModal(true);
                                }}
                                className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer text-[11px] transition"
                                title="Emitir recibo para este lote"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Recibo</span>
                              </button>

                              <button
                                type="button"
                                disabled={isCurrentlyLoading}
                                onClick={() => handleReleaseBatchReservation(
                                  batch.campaign.id,
                                  allIds,
                                  batchId,
                                  batch.statusSummary.confirmedCount > 0
                                )}
                                className="px-2 py-1.5 text-red-650 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg font-bold flex items-center gap-1 cursor-pointer disabled:opacity-45 text-[11px]"
                                title="Liberar todos os bilhetes deste lote"
                              >
                                {isCurrentlyLoading ? (
                                  <span className="animate-spin inline-block w-3 h-3 border-2 border-red-650 border-t-transparent rounded-full mr-1" />
                                ) : (
                                  <X className="w-3.5 h-3.5" />
                                )}
                                <span>Liberar Lote</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Reservations Cards on Mobile Viewports (< md) */}
            <div className="block md:hidden space-y-4">
              {!groupReservationsByBuyer ? (
                campaigns.flatMap((ca) => {
                  const ticketsForCamp = allReservations[ca.id] || [];

                  return ticketsForCamp
                    .filter((t) => {
                      if (reservationFilter === "reserved") return t.status === "reserved";
                      if (reservationFilter === "confirmed") return t.status === "confirmed";
                      return true;
                    })
                    .map((t) => {
                      const cleanPhone = t.buyerPhone ? t.buyerPhone.replace(/\D/g, "") : "";
                      const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : "";
                      return (
                        <div key={`${ca.id}_${t.id}`} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3.5 shadow-sm animate-fadeIn">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-mono text-base font-extrabold text-slate-900 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-xs">
                                #{t.number}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-2 font-bold max-w-[190px] truncate">
                                {ca.title}
                              </span>
                            </div>

                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              t.status === "confirmed"
                                ? "bg-indigo-50 text-indigo-850 border border-indigo-250/20"
                                : "bg-amber-50 text-amber-850 border border-amber-250/20"
                            }`}>
                              {t.status === "confirmed" ? "Pago (Ok)" : "Pendente"}
                            </span>
                          </div>

                          <div className="bg-white p-3 border border-slate-150 rounded-xl space-y-1.5 text-[11px] text-slate-600">
                            <div className="flex justify-between font-semibold text-slate-800">
                              <span className="text-slate-400 font-normal">Cliente:</span>
                              <span>{t.buyerName || "Mapeado manualmente"}</span>
                            </div>
                            {t.buyerCpf && (
                              <div className="flex justify-between font-mono">
                                <span className="text-slate-400 font-sans">CPF:</span>
                                <span>{t.buyerCpf}</span>
                              </div>
                            )}
                            {t.buyerPhone && (
                              <div className="flex justify-between font-mono">
                                <span className="text-slate-400 font-sans font-normal">Celular:</span>
                                <span className="font-bold text-slate-800 font-sans">{t.buyerPhone}</span>
                              </div>
                            )}
                            <div className="flex justify-between pt-1.5 border-t border-slate-100 mt-1">
                              <span className="text-slate-400">Data Reserva:</span>
                              <span>{t.reservedAt ? new Date(t.reservedAt).toLocaleString("pt-BR") : "Sem data"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 justify-end pt-1">
                            {t.buyerPhone && waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mr-auto inline-flex items-center gap-1 px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl font-bold text-[10px] transition"
                              >
                                <span>WhatsApp</span>
                              </a>
                            )}

                            {t.status === "reserved" && (
                              <button
                                onClick={() => handleConfirmPayment(ca.id, t.id)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer text-[10px] shadow-sm transition"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Confirmar Pago</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setReceiptCampaign(ca);
                                setReceiptClientName(t.buyerName || "Mapeado manualmente");
                                setReceiptClientCpf(t.buyerCpf || "");
                                setReceiptClientPhone(t.buyerPhone || "");
                                setReceiptClientEmail(t.buyerEmail || "");
                                setReceiptTickets([t]);
                                setReceiptStatus(t.status);
                                setReceiptTheme("emerald");
                                setReceiptCustomNote("Obrigado pela preferência e muita boa sorte!");
                                setShowReceiptModal(true);
                              }}
                              className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                              title="Emitir recibo para esta cota"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Recibo</span>
                            </button>

                            <button
                              onClick={() => handleReleaseReservation(ca.id, t.id)}
                              className="px-2.5 py-1.5 text-red-650 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>{t.status === "confirmed" ? "Excluir" : "Liberar"}</span>
                            </button>
                          </div>
                        </div>
                      );
                  })
                })
              ) : (
                  ticketBatches.map((batch) => {
                    const firstTicket = batch.tickets[0];
                    const subBatchId = firstTicket?.batchId || (firstTicket?.reservedAt ? `time_${new Date(firstTicket.reservedAt).getTime()}` : "legacy");
                    const batchId = `${batch.campaign.id}_${batch.buyerPhone || batch.buyerEmail || batch.buyerName}_${subBatchId}`;
                    const reservedTickets = batch.tickets.filter((t) => t.status === "reserved");
                    const reservedIds = reservedTickets.map((t) => t.id);
                    const allIds = batch.tickets.map((t) => t.id);
                    const isCurrentlyLoading = batchLoading === batchId;
                    
                    const cleanPhone = batch.buyerPhone ? batch.buyerPhone.replace(/\D/g, "") : "";
                    const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : "";

                    const calcPrice = getDiscountedPrice(
                      batch.tickets.length,
                      batch.campaign.ticketPrice,
                      batch.campaign.progressiveDiscounts,
                      isBatchVip(batch),
                      settings.vipDiscountPercentage
                    );

                    return (
                      <div key={batchId} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3.5 shadow-sm animate-fadeIn">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-xs text-slate-500 block">Campanha:</span>
                            <span className="font-bold text-slate-800 text-sm block">
                              {batch.campaign.title}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            reservedTickets.length === 0
                              ? "bg-indigo-50 text-indigo-850 border border-indigo-250/20"
                              : "bg-amber-50 text-amber-850 border border-amber-250/20"
                          }`}>
                            {reservedTickets.length === 0 ? "Totalmente Pago" : `${reservedTickets.length} Pendente(s)`}
                          </span>
                        </div>

                        <div className="bg-white p-3 border border-slate-150 rounded-xl space-y-1.5 text-[11px] text-slate-600">
                          <div className="flex justify-between font-semibold text-slate-800">
                            <span className="text-slate-400 font-normal">Cliente:</span>
                            <span>{batch.buyerName}</span>
                          </div>
                          {batch.buyerCpf && (
                            <div className="flex justify-between font-mono">
                              <span className="text-slate-400 font-sans">CPF:</span>
                              <span>{batch.buyerCpf}</span>
                            </div>
                          )}
                          {batch.buyerPhone && (
                            <div className="flex justify-between font-mono">
                              <span className="text-slate-400 font-sans font-normal">Celular:</span>
                              <span className="font-bold text-slate-800 font-sans">{batch.buyerPhone}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-1 border-t border-slate-100 mt-1">
                            <span className="text-slate-400">Preço do Lote:</span>
                            <span className="font-mono font-bold text-slate-800">
                              R$ {calcPrice.totalPrice.toFixed(2)}
                              {calcPrice.appliedDiscount && (
                                <span className="text-[9px] text-indigo-600 block text-right font-sans">(desconto p/ lote)</span>
                              )}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-slate-100 mt-2">
                            <span className="text-slate-400 font-semibold block mb-1">Cotas do Lote:</span>
                            <div className="flex flex-wrap gap-1">
                              {batch.tickets.map((t) => (
                                <span key={t.id} className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  t.status === "confirmed" 
                                    ? "bg-emerald-50 text-emerald-855 border-emerald-200" 
                                    : "bg-amber-50 text-amber-855 border-amber-200"
                                }`}>
                                  #{t.number}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 justify-end pt-1">
                          {batch.buyerPhone && waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mr-auto inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl font-bold text-[10px] transition"
                            >
                              <span>WhatsApp</span>
                            </a>
                          )}

                          {reservedTickets.length > 0 && (
                            <button
                              type="button"
                              disabled={isCurrentlyLoading}
                              onClick={() => handleConfirmBatchPayment(batch.campaign.id, reservedIds, batchId)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer text-[10px] shadow-sm transition"
                            >
                              {isCurrentlyLoading ? (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-1" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>Baix. {reservedTickets.length} Cotas</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setReceiptCampaign(batch.campaign);
                              setReceiptClientName(batch.buyerName);
                              setReceiptClientCpf(batch.buyerCpf || "");
                              setReceiptClientPhone(batch.buyerPhone || "");
                              setReceiptClientEmail(batch.buyerEmail || "");
                              setReceiptTickets(batch.tickets);
                              setReceiptStatus(batch.tickets.every(t => t.status === "confirmed") ? "confirmed" : "reserved");
                              setReceiptTheme("emerald");
                              setReceiptCustomNote("Obrigado pela preferência e muita boa sorte!");
                              setShowReceiptModal(true);
                            }}
                            className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                            title="Emitir recibo para este lote"
                          >
                            <FileText className="w-3.5 h-3.5 text-indigo-650" />
                            <span>Recibo</span>
                          </button>

                          <button
                            type="button"
                            disabled={isCurrentlyLoading}
                            onClick={() => handleReleaseBatchReservation(
                              batch.campaign.id,
                              allIds,
                              batchId,
                              batch.statusSummary.confirmedCount > 0
                            )}
                            className="px-2.5 py-1.5 text-red-650 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                          >
                            {isCurrentlyLoading ? (
                              <span className="animate-spin inline-block w-3 h-3 border-2 border-red-650 border-t-transparent rounded-full mr-1" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            <span>Liberar Lote</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {((!groupReservationsByBuyer && campaigns.flatMap(ca => allReservations[ca.id] || []).length === 0) ||
                (groupReservationsByBuyer && ticketBatches.length === 0)) && (
                <p className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-xl">
                  Nenhuma reserva ou lote registrado para esta seleção.
                </p>
              )}
          </div>
        )}

        {activeTab === "config" && (
          /* SECTION 3: CONFIGURATION (PIX CHAVE, EXPIRATION CHANNELS, EXPLAIN RULES) */
          <form onSubmit={handleSaveSettings} className="space-y-6 text-xs text-slate-700 animate-fadeIn">
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg">Configurações Gerais do Sistema</h2>
              <p className="text-xs text-slate-400">Configure os dados de recebimento do Pix, regras de expiração de cotas e ajuda para o suporte.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border p-5 rounded-2xl">
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Chave PIX Oficial do Chiquinho</label>
                <input
                  type="text"
                  required
                  value={settings.pixKey}
                  onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: pix@rifadochiquinho.com.br ou celular ou CPF/CNPJ"
                />
                <span className="text-[10px] text-slate-400 block">Os compradores copiarão exatamente esta chave ao salvar as reservas.</span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Nome do Beneficiário (Favorecido)</label>
                <input
                  type="text"
                  required
                  value={settings.receiverName}
                  onChange={(e) => setSettings({ ...settings, receiverName: e.target.value })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: Francisco Chiquinho"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Instituição Financeira (Banco)</label>
                <input
                  type="text"
                  required
                  value={settings.bankName}
                  onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: Banco Itaú S.A., C6 Bank"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Tempo Limite para Pagamento (Horas)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={168}
                  value={settings.expirationHours}
                  onChange={(e) => setSettings({ ...settings, expirationHours: Number(e.target.value) })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: 24"
                />
                <span className="text-[10px] text-slate-400 block">Prazo de retenção recomendado do bilhete antes de liberá-lo.</span>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block font-bold text-slate-700">Celular WhatsApp de Suporte (Dígitos apenas com DDD)</label>
                <input
                  type="text"
                  required
                  value={settings.supportContact}
                  onChange={(e) => setSettings({ ...settings, supportContact: e.target.value.replace(/\D/g, "") })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: 51999999999"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block font-bold text-slate-700">E-mail de Suporte / Contato Oficial</label>
                <input
                  type="email"
                  required
                  value={settings.supportEmail || "contato@rifadochiquinho.com.br"}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: contato@rifadochiquinho.com.br"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2 flex items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <input
                  type="checkbox"
                  id="autoWhatsAppRedirect"
                  checked={settings.autoWhatsAppRedirect !== false}
                  onChange={(e) => setSettings({ ...settings, autoWhatsAppRedirect: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-slate-200 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="autoWhatsAppRedirect" className="block font-bold text-slate-800 text-xs cursor-pointer select-none">
                    Redirecionamento Automático para WhatsApp 🚀
                  </label>
                  <span className="text-[10px] text-slate-450 block leading-normal mt-0.5">
                    Quando o apoiador confirmar a reserva de cota, abrir automaticamente a aba do WhatsApp com o link de confirmação preenchido.
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2 flex items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <input
                  type="checkbox"
                  id="salesSuspensionBlocked"
                  checked={settings.salesSuspensionBlocked === true}
                  onChange={(e) => setSettings({ ...settings, salesSuspensionBlocked: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-slate-200 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="salesSuspensionBlocked" className="block font-bold text-slate-800 text-xs cursor-pointer select-none">
                    Bloquear a Suspensão Automática de Vendas (Sorteios) 🔒
                  </label>
                  <span className="text-[10px] text-slate-450 block leading-normal mt-0.5">
                    <strong>Ativado (Suprimir Suspensão):</strong> Permite que as vendas continuem ativas mesmo no horário dos sorteios da Loteria Federal (quartas e sábados das 18:45 às 21:00h).<br />
                    <strong>Desativado (Normal - Padrão):</strong> Mantém o bloqueio automático de novas reservas durante o período do sorteio para garantir total controle das cotas.
                  </span>
                </div>
              </div>

              <div className="space-y-4 md:col-span-2 border-t border-slate-200 pt-4 mt-2">
                <h3 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="text-amber-600">👑 Programa de Clientes VIP</span>
                </h3>

                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-300/35 p-3.5 rounded-xl">
                  <input
                    type="checkbox"
                    id="vipEnabled"
                    checked={settings.vipEnabled !== false}
                    onChange={(e) => setSettings({ ...settings, vipEnabled: e.target.checked })}
                    className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="vipEnabled" className="block font-extrabold text-slate-800 text-xs cursor-pointer select-none">
                      Habilitar Programa e Bonificações VIP 👑
                    </label>
                    <span className="text-[10px] text-slate-500 block leading-normal mt-0.5 font-medium">
                      Ative para conceder descontos especiais, acesso antecipado e link para grupos de WhatsApp aos portadores do selo VIP. Se desativado, nenhum benefício VIP será aplicado nas compras ou telas de clientes.
                    </span>
                  </div>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/20 p-4 rounded-xl border border-amber-100/50 transition-opacity duration-200 ${settings.vipEnabled === false ? "opacity-40 pointer-events-none select-none" : ""}`}>
                  <div className="space-y-1.5">
                    <label className="block font-extrabold text-slate-700 text-xs">Tempo de Acesso Antecipado (Horas)</label>
                    <input
                      type="number"
                      required={settings.vipEnabled !== false}
                      disabled={settings.vipEnabled === false}
                      min={0}
                      max={168}
                      value={settings.vipAdvanceHours || 24}
                      onChange={(e) => setSettings({ ...settings, vipAdvanceHours: Number(e.target.value) })}
                      className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs font-bold disabled:bg-slate-50"
                      placeholder="Ex: 24"
                    />
                    <span className="text-[10.5px] text-slate-450 block leading-normal">
                      Prazo de antecedência em horas que o cliente VIP poderá visualizar e comprar cotas de campanhas com início agendado (data/hora de início futuro).
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-extrabold text-slate-700 text-xs">Desconto Especial em Cotas (%)</label>
                    <input
                      type="number"
                      required={settings.vipEnabled !== false}
                      disabled={settings.vipEnabled === false}
                      min={0}
                      max={100}
                      value={settings.vipDiscountPercentage || 10}
                      onChange={(e) => setSettings({ ...settings, vipDiscountPercentage: Number(e.target.value) })}
                      className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs font-bold disabled:bg-slate-50"
                      placeholder="Ex: 10"
                    />
                    <span className="text-[10.5px] text-slate-450 block leading-normal">
                      Percentual de desconto que será aplicado automaticamente ao valor total de todas as cotas reservadas e pagas por um portador do selo VIP.
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-extrabold text-slate-700 text-xs text-emerald-700">Link do Grupo VIP no WhatsApp 🟢</label>
                    <input
                      type="text"
                      disabled={settings.vipEnabled === false}
                      value={settings.vipWhatsAppUrl || ""}
                      onChange={(e) => setSettings({ ...settings, vipWhatsAppUrl: e.target.value })}
                      className="w-full bg-white p-2.5 border border-emerald-300 focus:border-emerald-500 rounded-lg text-xs font-bold text-emerald-800 placeholder-emerald-350 disabled:bg-slate-50 disabled:border-slate-205"
                      placeholder="https://chat.whatsapp.com/..."
                    />
                    <span className="text-[10.5px] text-slate-450 block leading-normal">
                      Link de convite do WhatsApp liberado automaticamente para quem reservar/comprar 10 ou mais cotas de uma única vez.
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2 border-t border-slate-200 pt-4 mt-2">
                <label className="block font-extrabold text-slate-800 text-xs uppercase tracking-wider">Logotipo da Plataforma (Logo) 🎨</label>
                <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-5 shadow-inner">
                  <div className="shrink-0 flex flex-col items-center gap-1 bg-slate-50 border border-slate-100 p-2.5 rounded-2xl">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Visualização</span>
                    <AppLogo settings={settings as any} size="md" />
                  </div>
                  <div className="flex-1 space-y-2 w-full text-left">
                    <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                      Adicione o logotipo personalizado para as telas do cliente e de login. Caso não envie nenhuma imagem, o sistema exibirá o logotipo oficial vetorizado do <strong>Rifa do Chiquinho</strong>!
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <label className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10.5px] uppercase tracking-wider rounded-xl transition cursor-pointer shadow-sm">
                        <span>Escolher Logotipo (.png, .jpg, .webp)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                      {(settings.logoBase64 || settings.logoUrl) && (
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, logoBase64: "", logoUrl: "" })}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-extrabold text-[10.5px] uppercase tracking-wider rounded-xl transition cursor-pointer"
                        >
                          Usar Padrão Vetorizado 🎟️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block font-bold text-slate-700">Instruções Legais de Compra e Regulamento da Rifa</label>
                <RichTextEditor
                  value={settings.rulesText}
                  onChange={(val) => setSettings({ ...settings, rulesText: val })}
                  placeholder="Instruções e regulamento da rifa, prazos de validade das reservas, e regras de reembolso..."
                />
              </div>


            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition"
              >
                Salvar Configurações Globais
              </button>
            </div>
          </form>
        )}

        {activeTab === "campaigns" && (
          /* SECTION 4: CAMPAIGNS (CREATION & DISPLAY LIST) */
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="font-extrabold text-slate-800 text-lg">Gestão de Campanhas</h2>
                <p className="text-xs text-slate-400">Aqui você cria, gerencia e ajusta o caixa das campanhas de arrecadação.</p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustmentPanel(!showAdjustmentPanel);
                    setSelectedAdjCampaignId("");
                    setAdjPrizesList([]);
                    setAdjExpenses(0);
                    setAdjSuccessMsg("");
                  }}
                  className={`text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer self-start sm:self-center shrink-0 border ${
                    showAdjustmentPanel 
                      ? "bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/10 hover:bg-amber-600" 
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80"
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  {showAdjustmentPanel ? "Ocultar Ajuste" : "💰 Ajuste de Caixa (Retroativo)"}
                </button>
                <button
                  onClick={() => setShowCampaignForm(!showCampaignForm)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition cursor-pointer self-start sm:self-center shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Nova Campanha
                </button>
              </div>
            </div>

            {/* CASH ADJUSTMENT ROUTINE PANEL */}
            {showAdjustmentPanel && (
              <div className="bg-gradient-to-br from-indigo-950 to-slate-900 text-white border border-indigo-900/60 p-6 rounded-2xl space-y-4 text-xs animate-fadeIn shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-900 pb-3">
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-indigo-100 text-sm flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400 animate-bounce" />
                      Rotina de Ajuste de Caixa & Registro Retroativo de Custos
                    </h3>
                    <p className="text-[10px] text-indigo-250 font-medium">
                      Lance retroativamente os brindes comprados e os custos reais de prêmios de campanhas em andamento ou finalizadas para equilibrar seu fluxo de caixa e obter o lucro REAL correto.
                    </p>
                  </div>
                  <span className="bg-indigo-900 border border-indigo-700/30 px-2.5 py-1 rounded-xl text-[9px] font-bold text-amber-400 uppercase tracking-widest shrink-0 self-start sm:self-center">
                    Ajuste Rápido
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  {/* Select Campaign Dropdown */}
                  <div className="md:col-span-5 space-y-3">
                    <div>
                      <label className="block text-indigo-200 font-bold mb-1.5 uppercase tracking-wide text-[9.5px]">Selecione uma Campanha para Ajustar:</label>
                      <select
                        value={selectedAdjCampaignId}
                        onChange={(e) => handleSelectAdjCampaign(e.target.value)}
                        className="w-full bg-slate-950 border border-indigo-800 p-3 rounded-xl text-xs text-indigo-100 font-bold cursor-pointer focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Selecione a Rifa --</option>
                        {campaigns.map((camp) => {
                          let labelStatus = "Ativa";
                          if (camp.status === "paused") labelStatus = "Pausada";
                          if (camp.status === "drawn") labelStatus = "Sorteada/Finalizada 🔮";
                          return (
                            <option key={camp.id} value={camp.id}>
                              {camp.title} ({camp.totalTickets} cotas | {labelStatus})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {selectedAdjCampaignId && (() => {
                      const camp = campaigns.find(c => c.id === selectedAdjCampaignId);
                      if (!camp) return null;
                      const resOfCamp = allReservations[camp.id] || [];
                      const confOfCamp = resOfCamp.filter(r => r.status === "confirmed").length;
                      const totalReceipts = confOfCamp * camp.ticketPrice;
                      const currentExp = camp.prizeExpenses || 0;
                      const calculatedRealProfit = totalReceipts - adjExpenses;

                      return (
                        <div className="bg-slate-950/60 border border-indigo-900/40 p-4 rounded-xl space-y-2.5 text-[10.5px]">
                          <span className="block text-[9px] uppercase tracking-wider font-extrabold text-indigo-400">Resumo Financeiro da Rifa:</span>
                          <div className="grid grid-cols-2 gap-2 text-slate-300 font-medium">
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg">
                              <span className="block text-[8px] text-slate-400 uppercase">Total Arrecadado:</span>
                              <span className="font-mono font-bold text-white text-xs">R$ {totalReceipts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-850 p-2 rounded-lg">
                              <span className="block text-[8px] text-slate-400 uppercase">Custo Cadastrado:</span>
                              <span className="font-mono font-bold text-rose-300 text-xs">R$ {currentExp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-900 p-2.5 rounded-xl border border-indigo-900/40 flex justify-between items-center text-[11px]">
                            <span className="font-black text-indigo-300">LUCRO REAL NESTA CONFIGURAÇÃO:</span>
                            <span className={`font-mono font-black ${calculatedRealProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              R$ {calculatedRealProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Expenses & Prizes List Modifier */}
                  <div className="md:col-span-7 space-y-4">
                    {selectedAdjCampaignId ? (
                      <div className="bg-slate-950/40 p-4 border border-indigo-900/60 rounded-xl space-y-3">
                        <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-indigo-900">
                          <div>
                            <span className="block text-indigo-200 font-bold uppercase tracking-wider text-[8px]">Despesa Total Lançada (R$):</span>
                            <span className="text-[9px] text-indigo-300 font-medium leading-normal">Pode digitar um valor total direto ou preencher os brindes abaixo.</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={adjExpenses}
                            onChange={(e) => setAdjExpenses(Number(e.target.value))}
                            className="bg-slate-950 text-right w-32 border border-indigo-700/50 p-2.5 rounded-lg text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="space-y-2 border-t border-indigo-900/40 pt-3">
                          <span className="block text-indigo-200 font-bold uppercase tracking-wider text-[9px] mb-1.5">🎁 Detalhar Brindes Comprados para esta Campanha</span>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-7">
                              <input
                                type="text"
                                placeholder="Nome do Brinde / Gasto (Ex: Caneca, Sedex, Brinde Pix)"
                                value={adjPrizeName}
                                onChange={(e) => setAdjPrizeName(e.target.value)}
                                className="w-full bg-slate-950 border border-indigo-900 p-2 rounded-lg text-xs font-semibold text-white focus:outline-none"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <input
                                type="number"
                                placeholder="Custo (R$)"
                                value={adjPrizeCost}
                                onChange={(e) => setAdjPrizeCost(e.target.value)}
                                className="w-full bg-slate-950 border border-indigo-900 p-2 rounded-lg text-xs font-mono font-bold text-white focus:outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddAdjPrize();
                                  }
                                }}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <button
                                type="button"
                                onClick={handleAddAdjPrize}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold h-full rounded-lg text-[10px] uppercase transition py-2 cursor-pointer border border-indigo-500"
                              >
                                Add
                              </button>
                            </div>
                          </div>

                          {adjPrizesList.length > 0 ? (
                            <div className="border border-indigo-900 bg-slate-950/70 rounded-lg p-2 max-h-[140px] overflow-y-auto space-y-1 mt-2">
                              {adjPrizesList.map((p, pIdx) => (
                                <div key={pIdx} className="flex justify-between items-center bg-slate-900 px-2.5 py-1.5 rounded border border-indigo-950 text-[10.5px]">
                                  <span className="font-semibold text-indigo-100">🎁 {p.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-amber-300 font-mono">R$ {p.cost.toFixed(2)}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAdjPrize(pIdx)}
                                      className="text-rose-400 hover:text-rose-300 transition p-1 cursor-pointer"
                                      title="Remover este brinde"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="border-t border-indigo-900/60 pt-1.5 flex justify-between items-center text-[10px] font-black text-indigo-300 px-1">
                                <span>Soma dos itens:</span>
                                <span className="font-mono font-bold text-amber-300">R$ {adjPrizesList.reduce((acc, p) => acc + p.cost, 0).toFixed(2)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 bg-slate-950/40 rounded-lg border border-dashed border-indigo-900/40 text-slate-400 text-[10px] font-semibold">
                              Nenhum item adicionado à lista detalhada ainda.
                            </div>
                          )}
                        </div>

                        {adjSuccessMsg && (
                          <div className="p-2.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-bold rounded-lg text-[11px] text-center animate-pulse">
                            🎉 {adjSuccessMsg}
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2 border-t border-indigo-900/30">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAdjCampaignId("");
                              setAdjPrizesList([]);
                              setAdjExpenses(0);
                              setAdjSuccessMsg("");
                            }}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition overflow-hidden text-[10px] uppercase cursor-pointer"
                          >
                            Limpar
                          </button>
                          <button
                            type="button"
                            disabled={adjSaving}
                            onClick={handleSaveCashAdjustment}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg transition shrink-0 shadow-md shadow-amber-500/10 text-[10px] uppercase cursor-pointer disabled:opacity-50"
                          >
                            {adjSaving ? "Gravando..." : "Salvar no Caixa 💾"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950/30 rounded-xl border border-dashed border-indigo-900/40 min-h-[180px]">
                        <Coins className="w-10 h-10 text-indigo-800 mb-2 opacity-50" />
                        <p className="text-slate-400 text-[11px] font-bold">Por favor, escolha uma campanha na lista de seleção à esquerda para iniciar o ajuste.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Campaign Create Form popup inline */}
            {showCampaignForm && (
              <form onSubmit={handleCreateCampaign} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-fadeIn pb-6">
                <div className="space-y-1 md:col-span-2 border-b border-slate-200 pb-2">
                  <h3 className="font-bold text-slate-800 text-sm">Cadastrar Novo Sorteio (1:1 Imagem Padrão)</h3>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Título da Rifa</label>
                  <input
                    type="text"
                    required
                    value={newCampaignTitle}
                    onChange={(e) => setNewCampaignTitle(e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                    placeholder="Ex: Rifa de Formatura - Notebook Gamer"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Preço do Bilhete (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={newCampaignPrice}
                    onChange={(e) => setNewCampaignPrice(Number(e.target.value))}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Custo com Prêmios / Despesas (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newCampaignExpenses}
                    onChange={(e) => setNewCampaignExpenses(Number(e.target.value))}
                    className="w-full bg-slate-50 font-extrabold text-indigo-700 p-2.5 border border-indigo-200 rounded-lg text-xs"
                    placeholder="Ex: 500.00"
                  />
                </div>

                <div className="md:col-span-2 bg-indigo-50/45 p-4 rounded-xl border border-indigo-100/80 space-y-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-indigo-900 text-xs uppercase tracking-wider">Lista Detalhada de Brindes / Prêmios (Lucro Real)</span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                    Adicione os brindes/itens comprados para esta ação. O custo gasto total será calculado de forma automática e preenchido no campo de despesas!
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        placeholder="Nome do Brinde (Ex: Caneca Personalizada, Pix R$100, Carro)"
                        value={newPrizeName}
                        onChange={(e) => setNewPrizeName(e.target.value)}
                        className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs font-semibold"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        placeholder="Preço Gasto (R$)"
                        value={newPrizeCost}
                        onChange={(e) => setNewPrizeCost(e.target.value)}
                        className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddNewCampaignPrize();
                          }
                        }}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddNewCampaignPrize}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-full rounded-lg text-[10px] transition py-2 cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {newCampaignPrizesList.length > 0 && (
                    <div className="border border-indigo-100 bg-white rounded-lg p-2 max-h-[150px] overflow-y-auto space-y-1">
                      {newCampaignPrizesList.map((p, pIdx) => (
                        <div key={pIdx} className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100 text-[11px]">
                          <span className="font-semibold text-slate-700">🎁 {p.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-700 font-mono">R$ {p.cost.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveNewCampaignPrize(pIdx)}
                              className="text-rose-600 hover:text-rose-800 transition p-1 cursor-pointer"
                              title="Remover brinde"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-indigo-100 pt-1.5 flex justify-between items-center text-[10px] font-black text-indigo-700 px-1">
                        <span>Soma calculada:</span>
                        <span className="font-mono">R$ {newCampaignExpenses.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="block font-semibold text-slate-600">Descrição / Prêmios</label>
                  <RichTextEditor
                    value={newCampaignDesc}
                    onChange={setNewCampaignDesc}
                    placeholder="Detalhes do prêmio principal, marcas, modelos, cotas premiadas e regras específicas da rifa."
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Total de Cotas (01 a 10000)</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={newCampaignTotal}
                    onChange={(e) => setNewCampaignTotal(Math.min(10000, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                    placeholder="Ex: 1000"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Qualquer quantidade de 1 a 10000. Tradicional: inicia de 0, Expressa: inicia de 1.</p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Modalidade do Sorteio</label>
                  <select
                    value={newCampaignDrawMode}
                    onChange={(e) => setNewCampaignDrawMode(e.target.value as "traditional" | "express")}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="traditional">Tradicional (Loteria Federal Caixa)</option>
                    <option value="express">Expressa (Sorteio Automático ao Vender Tudo)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Agendar Data de Início (Opcional - Em breve)</label>
                  <input
                    type="date"
                    value={newCampaignStartDate}
                    onChange={(e) => setNewCampaignStartDate(e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Agendar Hora de Início (Opcional)</label>
                  <input
                    type="time"
                    value={newCampaignStartTime}
                    onChange={(e) => setNewCampaignStartTime(e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                {/* PROGRESSIVE DISCOUNTS WIDGET FOR NEW CAMPAIGN */}
                <div className="md:col-span-2 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="newDiscountEnabled"
                      checked={newCampaignDiscountEnabled}
                      onChange={(e) => setNewCampaignDiscountEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-650 focus:ring-indigo-500 border-slate-350 cursor-pointer"
                    />
                    <label htmlFor="newDiscountEnabled" className="font-bold text-slate-800 cursor-pointer">
                      Ativar Desconto Progressivo por Lote de Cotas
                    </label>
                  </div>

                  {newCampaignDiscountEnabled && (
                    <div className="space-y-3 animate-fadeIn">
                      <p className="text-[10px] text-slate-400 -mt-2">
                        Configure percentuais de descontos por lote de cotas caso o cliente compre em maior quantidade (Ex: comprando 5 ou mais cotas, ganha 10% de desconto). No carrinho do cliente, o menor preço elegível será aplicado automaticamente.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Qtd. Mínima de Cotas</label>
                          <input
                            type="number"
                            id="new_disc_min_qty"
                            min={2}
                            placeholder="Ex: 5"
                            className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Desconto Progressivo (%)</label>
                          <input
                            type="number"
                            id="new_disc_pct"
                            step="1"
                            min="1"
                            max="99"
                            placeholder="Ex: 10"
                            className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const qtyEl = document.getElementById("new_disc_min_qty") as HTMLInputElement;
                            const pctEl = document.getElementById("new_disc_pct") as HTMLInputElement;
                            if (qtyEl && pctEl) {
                              const qty = Number(qtyEl.value);
                              const pct = Number(pctEl.value);
                              if (qty > 1 && pct > 0 && pct < 100) {
                                const calculatedReducedPrice = newCampaignPrice * (1 - pct / 100);
                                setNewCampaignDiscounts(prev => {
                                  const filtered = prev.filter(p => p.minQuantity !== qty);
                                  return [...filtered, { minQuantity: qty, discountPrice: calculatedReducedPrice, discountPercentage: pct }].sort((a,b) => a.minQuantity - b.minQuantity);
                                });
                                qtyEl.value = "";
                                pctEl.value = "";
                              } else {
                                alert("Insira valores válidos para quantidade mínima (>= 2) e percentual de desconto (1 a 99%).");
                              }
                            }
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                        >
                          Adicionar Lote
                        </button>
                      </div>

                      {newCampaignDiscounts.length > 0 ? (
                        <div className="bg-white border rounded-lg overflow-hidden divide-y divide-slate-100">
                          <div className="bg-slate-50 p-2 text-[10px] font-bold text-slate-400 grid grid-cols-12 uppercase tracking-wide">
                            <span className="col-span-10 text-left">Quantidade Mínima</span>
                            <span className="col-span-2 text-right">Ação</span>
                          </div>
                          {newCampaignDiscounts.map((tier, idx) => {
                            const pctValue = tier.discountPercentage !== undefined 
                              ? tier.discountPercentage 
                              : (newCampaignPrice > 0 ? Math.max(0, Math.round((1 - tier.discountPrice / newCampaignPrice) * 100)) : 0);
                            const finalPrice = tier.discountPercentage !== undefined
                              ? newCampaignPrice * (1 - tier.discountPercentage / 100)
                              : tier.discountPrice;

                            return (
                              <div key={idx} className="p-2 grid grid-cols-12 text-slate-655 items-center">
                                <span className="col-span-5 font-semibold text-slate-850">{tier.minQuantity} ou mais cotas</span>
                                <span className="col-span-5 font-mono font-bold text-indigo-700">
                                  {pctValue}% de desconto (R$ {finalPrice.toFixed(2)} / cota)
                                </span>
                                <span className="col-span-2 text-right font-sans">
                                  <button
                                    type="button"
                                    onClick={() => setNewCampaignDiscounts(prev => prev.filter((_, i) => i !== idx))}
                                    className="text-red-500 font-bold hover:underline cursor-pointer text-[10px]"
                                  >
                                    Excluir
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-amber-650 bg-amber-50 p-2 rounded-lg border border-amber-200">No momento, nenhuma regra de lote foi inserida.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 border-t border-slate-200/55 pt-3.5 mt-1">
                  <span className="block font-bold text-slate-800 mb-2">Imagem da Campanha (Sempre no Padrão 1:1)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-2">
                    {/* PC/Phone Live crop selector */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-slate-500">Enviar de seu Computador ou Celular (Auto-Recorte 1:1)</label>
                      <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-xl p-4 transition text-center flex flex-col items-center justify-center min-h-[140px] group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition mb-1.5" />
                        <span className="text-slate-700 font-bold text-[11px]">Selecione uma Imagem</span>
                        <span className="text-slate-400 text-[9px] mt-0.5">JPEG, PNG de até 10MB</span>
                        
                        {imageUploadLoading && (
                          <div className="absolute inset-x-0 inset-y-0 bg-white/90 flex items-center justify-center rounded-xl z-20">
                            <span className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-600 border-t-transparent"></span>
                          </div>
                        )}
                      </div>
                      {imageError && (
                        <p className="text-red-500 font-semibold text-[10px] bg-red-55 p-2 rounded-lg border border-red-155">{imageError}</p>
                      )}
                    </div>

                    {/* Image URL fallback & visual box */}
                    <div className="flex flex-col justify-between space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500">Ou use uma URL de Imagem existente</label>
                        <input
                          type="url"
                          value={newCampaignImage}
                          onChange={(e) => {
                            setNewCampaignImage(e.target.value);
                            setImageError(null);
                          }}
                          className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs mt-1"
                          placeholder="https://exemplo.com/sua_foto_quadrada.jpg"
                        />
                        {/* Preset templates for beautiful dashboard aesthetics */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setNewCampaignImage("https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&auto=format&fit=crop");
                              setImageError(null);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-750 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                          >
                            🎓 Cap & Diploma
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCampaignImage("https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=800&auto=format&fit=crop");
                              setImageError(null);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-750 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                          >
                            🎉 Celebração Chapéus
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCampaignImage("https://images.unsplash.com/photo-1525921429573-05685ac9a6cf?q=80&w=800&auto=format&fit=crop");
                              setImageError(null);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-750 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                          >
                            🥳 Entrega de Diploma
                          </button>
                        </div>
                      </div>

                      {/* Display live preview aspect 1:1 */}
                      <div className="flex items-center gap-3 bg-slate-50 p-2.5 border border-slate-200/50 rounded-xl">
                        {newCampaignImage ? (
                          <>
                            <img
                              src={newCampaignImage}
                              alt="Preview 1:1"
                              className="w-14 h-14 rounded-xl object-cover border border-slate-350 shadow-xs shrink-0 aspect-square"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <span className="font-extrabold text-indigo-750 text-[10px] bg-indigo-50 border border-indigo-200/50 px-2 py-0.5 rounded-full flex items-center gap-1 w-max">
                                <Check className="w-3 h-3 text-indigo-650 shrink-0" /> Aspecto 1:1 Definido
                              </span>
                              <button
                                type="button"
                                onClick={() => setNewCampaignImage("")}
                                className="text-red-500 hover:text-red-700 font-bold text-[10px] hover:underline cursor-pointer"
                              >
                                {newCampaignImage.startsWith("data:") ? "Remover upload" : "Limpar campo"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 aspect-square">
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            </div>
                            <span className="text-[10px] text-slate-400 leading-normal">Sem imagem definida. Sua campanha exibirá um ícone de formatura padrão.</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Referência Sorteio Extração (Data Estimada)</label>
                  <input
                    type="text"
                    value={newCampaignDrawDate}
                    onChange={(e) => setNewCampaignDrawDate(e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                    placeholder="Ex: 27/06/2026"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Número do Concurso Loteria Federal Caixa</label>
                  <input
                    type="text"
                    value={newCampaignDrawId}
                    onChange={(e) => setNewCampaignDrawId(e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                    placeholder="Ex: 5882-9"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCampaignForm(false)}
                    className="px-3.5 py-2 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-500/20 cursor-pointer"
                  >
                    Salvar Campanha
                  </button>
                </div>
              </form>
            )}

            {/* Grid listings of original campaigns */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Campanha</th>
                    <th className="py-3 px-4">Capacidade / Preço</th>
                    <th className="py-3 px-4">Balanço / Lucro Real</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sorteio Federal</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((ca) => {
                    const tRegistered = allReservations[ca.id] || [];
                    const tConfirmed = tRegistered.filter(r => r.status === "confirmed").length;
                    const revStats = getCampaignRevenueStats(ca, tRegistered, clients, settings.vipEnabled !== false ? settings.vipDiscountPercentage : 0);

                    return (
                      <tr key={ca.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-4 px-4 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            {ca.imageUrl ? (
                              <img src={ca.imageUrl} alt={ca.title} className="w-8 h-8 rounded object-cover border" />
                            ) : (
                              <span className="p-1.5 bg-slate-100 rounded text-base">🎓</span>
                            )}
                            <div>
                              <span>{ca.title}</span>
                              <span className="block text-[10px] text-slate-400 font-medium">Cout: {ca.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-600">
                          <div>{ca.totalTickets} Ns. / <strong>R$ {ca.ticketPrice.toFixed(2)}</strong></div>
                          <span className="text-[10px] text-slate-400 font-medium block">
                            Confirmados: {tConfirmed} | Reservados: {tRegistered.length - tConfirmed}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-600">
                          <div className="space-y-0.5">
                            <div className="flex justify-between max-w-[150px] gap-1 font-medium text-[10px]">
                              <span className="text-slate-400">Pagas:</span>
                              <span className="font-bold text-slate-700">R$ {revStats.confirmedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between max-w-[150px] gap-1 font-medium text-[10px]">
                              <span className="text-slate-400">Custo Prêmios:</span>
                              <span className="text-rose-600 font-semibold">R$ {revStats.expenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                            {ca.prizesList && ca.prizesList.length > 0 && (
                              <div className="text-[8.5px] text-slate-400 max-w-[150px] pl-1.5 border-l-2 border-indigo-200/60 my-1 space-y-0.5 font-sans leading-tight">
                                {ca.prizesList.map((item, idx) => (
                                  <div key={idx} className="flex justify-between gap-1">
                                    <span className="truncate max-w-[90px] text-[8px]" title={item.name}>• {item.name}</span>
                                    <span className="font-semibold shrink-0 text-slate-500 font-mono">R$ {item.cost.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex justify-between max-w-[150px] gap-1 border-t border-dashed border-slate-200 pt-0.5 mt-0.5">
                              <span className="text-slate-500 font-bold">Lucro Real:</span>
                              <span className={`font-extrabold ${revStats.realProfit >= 0 ? "text-emerald-600" : "text-rose-700"}`}>
                                R$ {revStats.realProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            ca.status === "active"
                              ? "bg-indigo-50 text-indigo-800 border border-indigo-205"
                              : ca.status === "paused"
                              ? "bg-amber-50 text-amber-800 border border-amber-205"
                              : "bg-slate-100 text-slate-700"
                          }`}>
                            {ca.status === "active" ? "Ativa" : ca.status === "paused" ? "Pausada" : "Sorteada"}
                          </span>
                        </td>
                         <td className="py-4 px-4 text-slate-500">
                          {ca.status === "drawn" ? (
                            <div className="flex items-center gap-1.5 text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-xl inline-flex font-mono text-[10px] font-extrabold">
                              <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Nº: {ca.winningNumber}</span>
                            </div>
                          ) : (() => {
                            const proj = getCampaignDrawProjection(ca, tRegistered);
                            return (
                              <div className="space-y-1">
                                <span className="block font-medium">Extração: {ca.federalLotteryDrawId || "-"}</span>
                                <div className="text-[9.5px] font-extrabold text-slate-700 bg-indigo-50 border border-indigo-100/50 rounded-lg px-2 py-0.5 w-max">
                                  🔮 Prev: {proj.formattedProbableDrawDate.split(" às ")[0]}
                                </div>
                                <span className="text-[9px] text-slate-400 block font-medium">
                                  Ritmo: {proj.salesVelocity} cotas/dia (~{proj.daysRemainingEst} d. rest.)
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {ca.status !== "drawn" ? (
                              <>
                                <button
                                  onClick={() => handleToggleStatus(ca.id, ca.status as any)}
                                  className={`p-1.5 rounded transition cursor-pointer ${
                                    ca.status === "active"
                                      ? "text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                                      : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                  }`}
                                  title={ca.status === "active" ? "Pausar Campanha" : "Ativar Campanha"}
                                >
                                  {ca.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>

                                {ca.drawMode === "express" ? (
                                  <button
                                    onClick={() => handleExpressDraw(ca)}
                                    className="p-1 text-slate-700 hover:text-indigo-800 hover:bg-indigo-100/80 bg-indigo-50 border border-indigo-200 rounded transition cursor-pointer flex items-center gap-1 px-1.5 text-[10px] font-extrabold leading-none"
                                    title="Sortear Agora (Modalidade Expressa)"
                                  >
                                    <Trophy className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                    <span>Sortear Agora</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleOpenDrawingModal(ca)}
                                    className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-100 rounded transition cursor-pointer"
                                    title="Definir Ganhador (Loteria Federal)"
                                  >
                                    <Trophy className="w-4 h-4" />
                                  </button>
                                )}

                                <button
                                  onClick={() => handleStartEditCampaign(ca)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-55 rounded transition cursor-pointer"
                                  title="Editar Campanha"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                </>
                            ) : (
                              <button
                                onClick={() => handleRevertDraw(ca)}
                                className="p-1 text-rose-700 hover:text-rose-800 hover:bg-rose-100 bg-rose-50 border border-rose-200 rounded transition cursor-pointer flex items-center gap-1 px-1.5 text-[10px] font-extrabold leading-none"
                                title="Reverter Sorteio"
                              >
                                <X className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                                <span>Reverter Sorteio</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteCampaign(ca.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Deletar campanha"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile swipe lists for campaigns */}
            <div className="block md:hidden space-y-4">
              {filteredCampaigns.map((ca) => {
                const tRegistered = allReservations[ca.id] || [];
                const tConfirmed = tRegistered.filter(r => r.status === "confirmed").length;
                const revStats = getCampaignRevenueStats(ca, tRegistered, clients, settings.vipEnabled !== false ? settings.vipDiscountPercentage : 0);
                return (
                  <div key={ca.id} className="bg-slate-50 border border-slate-200/65 rounded-2xl p-4 space-y-3.5 shadow-sm">
                    <div className="flex gap-3 justify-between items-start">
                      <div className="flex gap-2.5 items-center">
                        {ca.imageUrl ? (
                          <img src={ca.imageUrl} alt={ca.title} className="w-10 h-10 rounded-xl object-cover border border-slate-200/10" />
                        ) : (
                          <span className="p-2 bg-white border border-slate-200 rounded-xl text-lg">🎓</span>
                        )}
                        <div>
                          <h4 className="font-extrabold text-slate-800 leading-tight text-xs sm:text-sm">{ca.title}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {ca.id}</span>
                        </div>
                      </div>
                      
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        ca.status === "active"
                          ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                          : ca.status === "paused"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {ca.status === "active" ? "Ativa" : ca.status === "paused" ? "Pausada" : "Sorteada"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-200/40 py-2.5 text-[11px] text-slate-700">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold uppercase tracking-wider">Cotas / Preço</span>
                        <strong>{ca.totalTickets} Cotas</strong> / R$ {ca.ticketPrice.toFixed(2)}
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold uppercase tracking-wider">Reservas</span>
                        <strong>{tConfirmed} pagas</strong> ({tRegistered.length - tConfirmed} pend.)
                      </div>
                    </div>

                    {/* Financial details row in mobile cards */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-3 text-[10.5px] space-y-1 shadow-inner">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[8px]">Pagas (Acumulado)</span>
                        <span className="font-bold text-slate-700">R$ {revStats.confirmedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[8px]">Custo do Prêmio</span>
                        <span className="font-semibold text-rose-600">R$ {revStats.expenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-150 pt-1.5 mt-1">
                        <span className="text-slate-700 font-extrabold uppercase tracking-wider text-[9px]">Lucro Real Líquido</span>
                        <span className={`font-black ${revStats.realProfit >= 0 ? "text-emerald-600" : "text-rose-700"}`}>
                          R$ {revStats.realProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      {ca.status === "drawn" ? (
                        <div className="flex items-center gap-1.5 text-indigo-850 font-bold bg-indigo-50/75 p-2 rounded-xl border border-indigo-100 leading-none font-sans">
                          <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>Ganhador Federal: <strong className="font-mono text-indigo-700">#{ca.winningNumber}</strong></span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 bg-white p-2.5 border border-slate-200/60 rounded-xl shadow-xs">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase leading-none">Loteria Extração</span>
                              <span className="font-medium text-slate-700">{ca.federalLotteryDrawId || "A definir"}</span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500">{ca.drawDate || "Sem data"}</span>
                          </div>
                          {(() => {
                            const proj = getCampaignDrawProjection(ca, tRegistered);
                            return (
                              <div className="pt-2 border-t border-dashed border-slate-100 flex flex-col gap-0.5">
                                <span className="text-[10px] font-extrabold text-indigo-700">🔮 Previsão: {proj.formattedProbableDrawDate.split(" às ")[0]}</span>
                                <span className="text-[9px] text-slate-405 leading-none">Ritmo: {proj.salesVelocity} c/dia (~{proj.daysRemainingEst} d. rest.)</span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                      {ca.status !== "drawn" ? (
                        <>
                          <button
                            onClick={() => handleToggleStatus(ca.id, ca.status as any)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            {ca.status === "active" ? (
                              <><Pause className="w-3.5 h-3.5" /><span>Pausar</span></>
                            ) : (
                              <><Play className="w-3.5 h-3.5" /><span>Ativar</span></>
                            )}
                          </button>

                          {ca.drawMode === "express" ? (
                            <button
                              onClick={() => handleExpressDraw(ca)}
                              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200/50 hover:bg-indigo-100 rounded-xl font-bold transition shadow-xs cursor-pointer"
                            >
                              <Trophy className="w-3.5 h-3.5 text-indigo-650" />
                              <span>Sortear Agora</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenDrawingModal(ca)}
                              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200/50 hover:bg-indigo-100 rounded-xl font-bold transition shadow-xs cursor-pointer"
                            >
                              <Trophy className="w-3.5 h-3.5 text-indigo-650" />
                              <span>Sorteio</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleStartEditCampaign(ca)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 text-indigo-750 border border-slate-200 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRevertDraw(ca)}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl font-bold transition shadow-xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5 text-rose-700" />
                          <span>Reverter Sorteio</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteCampaign(ca.id)}
                        className="p-2 text-slate-400 hover:text-red-650 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl transition cursor-pointer"
                        title="Deletar campanha"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredCampaigns.length === 0 && (
                <p className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-xl">Nenhuma campanha cadastrada.</p>
              )}
            </div>

            {/* Winner assign modal popup floating */}
            {drawingCampaignId && (() => {
              const drawingCampaign = campaigns.find((c) => c.id === drawingCampaignId);
              const totalTicketsToDraw = drawingCampaign?.totalTickets || 100;
              let targetLotteryLength = 2;
              let lotteryRuleDesc = "Até 100 cotas: usa as 2 últimas dezenas";

              if (totalTicketsToDraw <= 100) {
                targetLotteryLength = 2;
                lotteryRuleDesc = "Até 100 cotas: usa as 2 últimas dezenas";
              } else if (totalTicketsToDraw <= 1000) {
                targetLotteryLength = 3;
                lotteryRuleDesc = "Até 1000 cotas: usa as 3 últimas dezenas";
              } else if (totalTicketsToDraw <= 10000) {
                targetLotteryLength = 4;
                lotteryRuleDesc = "Até 10000 cotas: usa as 4 últimas dezenas";
              } else {
                targetLotteryLength = String(totalTicketsToDraw - 1).length;
                lotteryRuleDesc = `Até ${totalTicketsToDraw} cotas: usa as ${targetLotteryLength} últimas dezenas`;
              }

              const typedDigits = drawWinnerCode.replace(/\D/g, "");
              const simulatedFullDigits = typedDigits.padStart(6, "0");
              const extractedWinningDigitSegment = simulatedFullDigits.substring(6 - targetLotteryLength);
              const padLengthForDrawnWinner = totalTicketsToDraw > 1000 ? 4 : totalTicketsToDraw > 100 ? 3 : 2;
              const previewWinningTicket = extractedWinningDigitSegment.padStart(padLengthForDrawnWinner, "0");

              return (
                <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fadeIn bg-opacity-70">
                  <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative text-xs">
                    <div className="text-center space-y-1">
                      <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                      <h3 className="font-extrabold text-slate-800 text-sm">Sortear via Loteria Federal</h3>
                      <p className="text-slate-500 leading-normal">
                        Determine o número do prêmio extraído de 6 dezenas (000000 a 999999) para validar o ganhador.
                      </p>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Resultado Loteria Federal (6 dígitos)</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={drawWinnerCode}
                        onChange={(e) => setDrawWinnerCode(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center font-mono text-2xl font-bold py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
                        placeholder="000000"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Data Sorteio</label>
                        <input
                          type="date"
                          value={drawWinnerDate}
                          onChange={(e) => setDrawWinnerDate(e.target.value)}
                          className="w-full py-2 px-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-xs text-center"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Hora Sorteio</label>
                        <input
                          type="time"
                          value={drawWinnerHour}
                          onChange={(e) => setDrawWinnerHour(e.target.value)}
                          className="w-full py-2 px-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-xs text-center"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Nº Concurso</label>
                        <input
                          type="text"
                          value={drawWinnerContestId}
                          onChange={(e) => setDrawWinnerContestId(e.target.value)}
                          className="w-full py-2 px-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-xs text-center"
                          placeholder="Ex: 5873"
                        />
                      </div>
                    </div>

                    {/* Interactive Real-time breakdown explanation */}
                    <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-extrabold text-indigo-700 uppercase tracking-wider">
                        <span>Regra de Extração</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                        {lotteryRuleDesc}
                      </p>
                      
                      <div className="flex justify-between items-center text-[10px] pt-1 border-t border-indigo-100/50">
                        <span className="text-slate-500 font-semibold">Cotas da ação:</span>
                        <strong className="text-slate-800 font-bold">{totalTicketsToDraw}</strong>
                      </div>

                      {typedDigits.length > 0 && (
                        <div className="flex justify-between items-center pt-1 animate-fadeIn">
                          <span className="text-indigo-700 font-bold">Bilhete Ganhador:</span>
                          <span className="font-mono text-xs bg-indigo-600 text-white font-extrabold px-2.5 py-0.5 rounded shadow">
                            #{previewWinningTicket}
                          </span>
                        </div>
                      )}

                      {typedDigits.length > 0 && typedDigits.length < 6 && (
                        <p className="text-[9.5px] text-slate-400 italic pt-1 leading-normal">
                          * Digitado {typedDigits.length}/6 números. Simulação: {simulatedFullDigits}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setDrawingCampaignId(null)}
                        className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg cursor-pointer text-center text-[11px]"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSaveDrawResult(drawingCampaignId)}
                        disabled={!drawWinnerCode || !drawWinnerDate.trim() || !drawWinnerContestId.trim()}
                        className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg cursor-pointer text-center text-[11px] disabled:opacity-50"
                      >
                        Confirmar Sorteio
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Edit Campaign Modal popup floating */}
            {editingCampaign && (
              <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
                <form
                  onSubmit={handleUpdateCampaign}
                  className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative text-xs my-8"
                >
                  <button
                    type="button"
                    onClick={() => setEditingCampaign(null)}
                    className="absolute top-4 right-4 text-slate-450 hover:text-slate-650 font-bold text-lg cursor-pointer col-span-2"
                  >
                    ×
                  </button>

                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-1.5 leading-none">
                      <Edit className="w-5 h-5 text-indigo-600 shrink-0" />
                      Editar Campanha
                    </h3>
                    <p className="text-slate-400 text-xs">Altere as informações da campanha e salve no banco.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Título da Rifa</label>
                      <input
                        type="text"
                        required
                        value={editCampaignTitle}
                        onChange={(e) => setEditCampaignTitle(e.target.value)}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Preço do Bilhete (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={editCampaignPrice}
                        onChange={(e) => setEditCampaignPrice(Number(e.target.value))}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Custo com Prêmios / Despesas (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={editCampaignExpenses}
                        onChange={(e) => setEditCampaignExpenses(Number(e.target.value))}
                        className="w-full bg-slate-50 font-extrabold text-indigo-700 p-2.5 border border-indigo-200 rounded-lg text-xs"
                        placeholder="Ex: 500.00"
                      />
                    </div>

                    <div className="md:col-span-2 bg-indigo-50/45 p-4 rounded-xl border border-indigo-100/80 space-y-3">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-indigo-900 text-xs uppercase tracking-wider">Lista Detalhada de Brindes / Prêmios (Lucro Real)</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
                        Adicione os brindes/itens comprados para esta ação. O custo gasto total será calculado de forma automática e preenchido no campo de despesas!
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-7">
                          <input
                            type="text"
                            placeholder="Nome do Brinde (Ex: Caneca Personalizada, Pix R$100, Carro)"
                            value={editPrizeName}
                            onChange={(e) => setEditPrizeName(e.target.value)}
                            className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs font-semibold"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <input
                            type="number"
                            placeholder="Preço Gasto (R$)"
                            value={editPrizeCost}
                            onChange={(e) => setEditPrizeCost(e.target.value)}
                            className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddEditCampaignPrize();
                              }
                            }}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleAddEditCampaignPrize}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-full rounded-lg text-[10px] transition py-2 cursor-pointer"
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>

                      {editCampaignPrizesList.length > 0 && (
                        <div className="border border-indigo-100 bg-white rounded-lg p-2 max-h-[150px] overflow-y-auto space-y-1">
                          {editCampaignPrizesList.map((p, pIdx) => (
                            <div key={pIdx} className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100 text-[11px]">
                              <span className="font-semibold text-slate-700">🎁 {p.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-emerald-700 font-mono">R$ {p.cost.toFixed(2)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditCampaignPrize(pIdx)}
                                  className="text-rose-600 hover:text-rose-800 transition p-1 cursor-pointer"
                                  title="Remover brinde"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="border-t border-indigo-100 pt-1.5 flex justify-between items-center text-[10px] font-black text-indigo-700 px-1">
                            <span>Soma calculada:</span>
                            <span className="font-mono">R$ {editCampaignExpenses.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-1.5 font-sans">
                      <label className="block font-semibold text-slate-600">Descrição / Prêmios</label>
                      <RichTextEditor
                        value={editCampaignDesc}
                        onChange={setEditCampaignDesc}
                        placeholder="Detalhes do prêmio principal, marcas, modelos, cotas premiadas e regras específicas da rifa."
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Total de Cotas (01 a 10000)</label>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        required
                        value={editCampaignTotal}
                        onChange={(e) => setEditCampaignTotal(Math.min(10000, Math.max(1, Number(e.target.value) || 1)))}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                        placeholder="Ex: 500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Qualquer quantidade de 1 a 10000. Tradicional: inicia de 0, Expressa: inicia de 1.</p>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Modalidade do Sorteio</label>
                      <select
                        value={editCampaignDrawMode}
                        onChange={(e) => setEditCampaignDrawMode(e.target.value as "traditional" | "express")}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="traditional">Tradicional (Loteria Federal Caixa)</option>
                        <option value="express">Expressa (Sorteio Automático ao Vender Tudo)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Agendar Data de Início (Opcional - Em breve)</label>
                      <input
                        type="date"
                        value={editCampaignStartDate}
                        onChange={(e) => setEditCampaignStartDate(e.target.value)}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Agendar Hora de Início (Opcional)</label>
                      <input
                        type="time"
                        value={editCampaignStartTime}
                        onChange={(e) => setEditCampaignStartTime(e.target.value)}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    {/* PROGRESSIVE DISCOUNTS WIDGET FOR EDIT MODAL */}
                    <div className="md:col-span-2 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="editDiscountEnabled"
                          checked={editCampaignDiscountEnabled}
                          onChange={(e) => setEditCampaignDiscountEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-650 focus:ring-indigo-500 border-slate-350 cursor-pointer"
                        />
                        <label htmlFor="editDiscountEnabled" className="font-bold text-slate-800 cursor-pointer">
                          Ativar Desconto Progressivo por Lote de Cotas
                        </label>
                      </div>

                      {editCampaignDiscountEnabled && (
                        <div className="space-y-3 animate-fadeIn">
                          <p className="text-[10px] text-slate-400 -mt-2">
                            Configure percentuais de descontos por lote de cotas caso o cliente compre em maior quantidade (Ex: comprando 5 ou mais cotas, ganha 10% de desconto). No carrinho do cliente, o menor preço elegível será aplicado automaticamente.
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div className="space-y-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Qtd. Mínima de Cotas</label>
                              <input
                                type="number"
                                id="edit_disc_min_qty"
                                min={2}
                                placeholder="Ex: 5"
                                className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase">Desconto Progressivo (%)</label>
                              <input
                                type="number"
                                id="edit_disc_pct"
                                step="1"
                                min="1"
                                max="99"
                                placeholder="Ex: 10"
                                className="w-full bg-white p-2 border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const qtyEl = document.getElementById("edit_disc_min_qty") as HTMLInputElement;
                                const pctEl = document.getElementById("edit_disc_pct") as HTMLInputElement;
                                if (qtyEl && pctEl) {
                                  const qty = Number(qtyEl.value);
                                  const pct = Number(pctEl.value);
                                  if (qty > 1 && pct > 0 && pct < 100) {
                                    const calculatedReducedPrice = editCampaignPrice * (1 - pct / 100);
                                    setEditCampaignDiscounts(prev => {
                                      const filtered = prev.filter(p => p.minQuantity !== qty);
                                      return [...filtered, { minQuantity: qty, discountPrice: calculatedReducedPrice, discountPercentage: pct }].sort((a,b) => a.minQuantity - b.minQuantity);
                                    });
                                    qtyEl.value = "";
                                    pctEl.value = "";
                                  } else {
                                    alert("Insira valores válidos para quantidade mínima (>= 2) e percentual de desconto (1 a 99%).");
                                  }
                                }
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Adicionar Lote
                            </button>
                          </div>

                          {editCampaignDiscounts.length > 0 ? (
                            <div className="bg-white border rounded-lg overflow-hidden divide-y divide-slate-100">
                              <div className="bg-slate-50 p-2 text-[10px] font-bold text-slate-400 grid grid-cols-12 uppercase tracking-wide">
                                <span className="col-span-10 text-left">Quantidade Mínima</span>
                                <span className="col-span-2 text-right">Ação</span>
                              </div>
                              {editCampaignDiscounts.map((tier, idx) => {
                                const pctValue = tier.discountPercentage !== undefined 
                                  ? tier.discountPercentage 
                                  : (editCampaignPrice > 0 ? Math.max(0, Math.round((1 - tier.discountPrice / editCampaignPrice) * 100)) : 0);
                                const finalPrice = tier.discountPercentage !== undefined
                                  ? editCampaignPrice * (1 - tier.discountPercentage / 100)
                                  : tier.discountPrice;

                                return (
                                  <div key={idx} className="p-2 grid grid-cols-12 text-slate-655 items-center">
                                    <span className="col-span-5 font-semibold text-slate-850">{tier.minQuantity} ou mais cotas</span>
                                    <span className="col-span-5 font-mono font-bold text-indigo-700">
                                      {pctValue}% de desconto (R$ {finalPrice.toFixed(2)} / cota)
                                    </span>
                                    <span className="col-span-2 text-right font-sans">
                                      <button
                                        type="button"
                                        onClick={() => setEditCampaignDiscounts(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-red-500 font-bold hover:underline cursor-pointer text-[10px]"
                                      >
                                        Excluir
                                      </button>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-amber-650 bg-amber-50 p-2 rounded-lg border border-amber-200">No momento, nenhuma regra de lote foi inserida.</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 border-t border-slate-200/55 pt-3.5 mt-1">
                      <span className="block font-bold text-slate-800 mb-2">Imagem da Campanha (Sempre no Padrão 1:1)</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-2">
                        {/* PC/Phone Live crop selector */}
                        <div className="space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-500">Enviar de seu Computador ou Celular (Auto-Recorte 1:1)</label>
                          <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-xl p-4 transition text-center flex flex-col items-center justify-center min-h-[140px] group">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleEditImageFileChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition mb-1.5" />
                            <span className="text-slate-700 font-bold text-[11px]">Selecione uma Imagem</span>
                            <span className="text-slate-400 text-[9px] mt-0.5">JPEG, PNG de até 10MB</span>
                            
                            {editImageUploadLoading && (
                              <div className="absolute inset-x-0 inset-y-0 bg-white/90 flex items-center justify-center rounded-xl z-20">
                                <span className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-600 border-t-transparent font-sans"></span>
                              </div>
                            )}
                          </div>
                          {editImageError && (
                            <p className="text-red-550 font-semibold text-[10px] bg-red-50 p-2 rounded-lg border border-red-200">{editImageError}</p>
                          )}
                        </div>

                        {/* Image URL fallback & visual box */}
                        <div className="flex flex-col justify-between space-y-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-505">Ou use uma URL de Imagem existente</label>
                            <input
                              type="url"
                              value={editCampaignImage}
                              onChange={(e) => {
                                setEditCampaignImage(e.target.value);
                                setEditImageError(null);
                              }}
                              className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs mt-1"
                              placeholder="https://exemplo.com/sua_foto_quadrada.jpg"
                            />
                            {/* Preset templates for beautiful dashboard aesthetics */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCampaignImage("https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&auto=format&fit=crop");
                                  setEditImageError(null);
                                }}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-755 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                              >
                                🎓 Cap & Diploma
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCampaignImage("https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=800&auto=format&fit=crop");
                                  setEditImageError(null);
                                }}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-755 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                              >
                                🎉 Celebração Chapéus
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCampaignImage("https://images.unsplash.com/photo-1525921429573-05685ac9a6cf?q=80&w=800&auto=format&fit=crop");
                                  setEditImageError(null);
                                }}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-755 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition"
                              >
                                🥳 Entrega de Diploma
                              </button>
                            </div>
                          </div>

                          {/* Display live preview aspect 1:1 */}
                          <div className="flex items-center gap-3 bg-slate-50 p-2.5 border border-slate-205 rounded-xl">
                            {editCampaignImage ? (
                              <>
                                <img
                                  src={editCampaignImage}
                                  alt="Preview 1:1"
                                  className="w-14 h-14 rounded-xl object-cover border border-slate-350 shadow-xs shrink-0 aspect-square"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <span className="font-extrabold text-indigo-755 text-[10px] bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1 w-max">
                                    <Check className="w-3 h-3 text-indigo-650 shrink-0" /> Aspecto 1:1 Definido
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setEditCampaignImage("")}
                                    className="text-red-500 hover:text-red-700 font-bold text-[10px] hover:underline cursor-pointer"
                                  >
                                    Limpar campo
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 aspect-square">
                                  <ImageIcon className="w-5 h-5 text-slate-400" />
                                </div>
                                <span className="text-[10px] text-slate-400 leading-normal">Sem imagem definida. Sua campanha exibirá um ícone de formatura padrão.</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Referência Sorteio Extração (Data Estimada)</label>
                      <input
                        type="text"
                        value={editCampaignDrawDate}
                        onChange={(e) => setEditCampaignDrawDate(e.target.value)}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Número do Concurso Loteria Federal Caixa</label>
                      <input
                        type="text"
                        value={editCampaignDrawId}
                        onChange={(e) => setEditCampaignDrawId(e.target.value)}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 font-sans">
                    <button
                      type="button"
                      onClick={() => setEditingCampaign(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer shadow-md shadow-indigo-500/10"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === "winners" && (
          /* SECTION 5: WINNERS (GANHADORES) */
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg">Ganhadores das Rifas</h2>
              <p className="text-xs text-slate-400">Verifique os contemplados por cada concurso ou extração da formatura.</p>
            </div>

            {campaigns.filter((ca) => ca.status === "drawn").length === 0 ? (
              <div className="text-center py-16 border border-dashed text-slate-400 rounded-2xl space-y-3.5 bg-slate-50/25">
                <Trophy className="w-12 h-12 text-slate-300 mx-auto" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-700 text-xs sm:text-sm">Nenhum sorteio foi finalizado com ganhador ainda.</p>
                  <p className="text-[10px] text-slate-400 max-w-[290px] mx-auto">
                    Acese a aba <strong>Campanhas</strong> e toque em em "Sorteio" ou no ícone de troféu para escolher o número extraído da Caixa.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {campaigns
                  .filter((ca) => ca.status === "drawn")
                  .map((ca) => {
                    const tickets = allReservations[ca.id] || [];
                    const winnerTicket = tickets.find((t) => t.number === ca.winningNumber);

                    return (
                      <div
                        key={ca.id}
                        className="bg-slate-50 border border-slate-200/70 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm"
                      >
                        <div className="flex gap-3 justify-between items-start">
                          <div className="flex gap-2.5 items-center">
                            {ca.imageUrl ? (
                              <img src={ca.imageUrl} alt={ca.title} className="w-12 h-12 rounded-xl object-cover border" />
                            ) : (
                              <span className="p-2.5 bg-white border rounded-xl text-lg shadow-2xs">🎓</span>
                            )}
                            <div>
                              <h4 className="font-extrabold text-slate-800 leading-tight text-xs sm:text-sm">{ca.title}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Sorteio: Concurso nº <strong className="text-slate-600 font-semibold">{ca.federalLotteryDrawId || ca.id}</strong>
                                {ca.drawDate && (
                                  <> em <strong className="text-slate-600 font-semibold">{ca.drawDate.split("-").reverse().join("/")}</strong></>
                                )}
                                {ca.drawHour && (
                                  <> às <strong className="text-slate-600 font-semibold">{ca.drawHour}</strong></>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono text-[11px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl shadow-3xs block">
                              Número #{ca.winningNumber}
                            </span>
                            {ca.federalLotteryNumber && (
                              <span className="text-[9px] text-slate-400 font-semibold block mt-1">
                                Loteria: {ca.federalLotteryNumber}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-white border rounded-xl p-3.5 text-[11px] space-y-2 text-slate-600">
                          {winnerTicket ? (
                            <>
                              <div className="flex justify-between font-bold text-slate-800">
                                <span className="text-slate-400 font-normal">Ganhador:</span>
                                <span>{winnerTicket.buyerName}</span>
                              </div>
                              <div className="flex justify-between font-mono">
                                <span className="text-slate-400 font-sans">CPF do cadastro:</span>
                                <span>
                                  {winnerTicket.buyerCpf.slice(0, 3)}.{winnerTicket.buyerCpf.slice(3, 6)}.{winnerTicket.buyerCpf.slice(6, 9)}-{winnerTicket.buyerCpf.slice(9, 11)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">WhatsApp:</span>
                                <span className="font-mono">{winnerTicket.buyerPhone}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">E-mail:</span>
                                <span>{winnerTicket.buyerEmail}</span>
                              </div>
                              <div className="flex justify-between pt-1.5 border-t border-slate-100 mt-1.5">
                                <span className="text-slate-400">Data da Confirmação:</span>
                                <span>
                                  {winnerTicket.confirmedAt ? new Date(winnerTicket.confirmedAt).toLocaleDateString("pt-BR") : "Aprovado manualmente"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="py-4 text-center text-red-650 bg-red-50/50 rounded-xl leading-relaxed">
                              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1.5" />
                              <p className="font-extrabold text-[11px]">Nenhum participante comprou o bilhete #{ca.winningNumber}!</p>
                              <p className="text-[9.5px] text-slate-400 mt-0.5 max-w-[210px] mx-auto">
                                O número sorteado de acordo com a Loteria Federal não possui comprador nesta rodada.
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 select-none w-full pt-1">
                          {winnerTicket && (
                            <a
                              href={`https://wa.me/55${winnerTicket.buyerPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
                            >
                              <span>Contatar Ganhador</span>
                            </a>
                          )}
                          <button
                            onClick={() => handleRevertDraw(ca)}
                            className="flex-1 text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold text-xs transition"
                          >
                            <X className="w-4 h-4 text-rose-700 shrink-0" />
                            <span>Reverter Sorteio</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {activeTab === "clients" && (
          /* SECTION 6: CLIENTS DETAIL BASE */
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-extrabold text-slate-800 text-lg">Histórico de Clientes Cadastrados</h2>
                <p className="text-xs text-slate-400">Consulte a base de participantes, contatos do WhatsApp e CPFs vinculados.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateClientName("");
                    setCreateClientCpf("");
                    setCreateClientPhone("");
                    setCreateClientCity("");
                    setCreateClientEmail("");
                    setCreateClientError("");
                    setCreateClientSuccess("");
                    setShowCreateClientModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo Cliente</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIssueSelectedClient(clients.length > 0 ? clients[0] : null);
                    const activeCamps = campaigns.filter(c => c.status === "active");
                    setIssueCampaignId(activeCamps.length > 0 ? activeCamps[0].id : "");
                    setIssueNumbersType("specific");
                    setIssueSpecificNumbers("");
                    setIssueRandomCount(1);
                    setIssueStatus("confirmed");
                    setIssueError(null);
                    setIssueSuccess(null);
                    setShowIssueTicketsModal(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lançar Cotas Manuais</span>
                </button>
              </div>
            </div>

            {/* Banner explicativo do Sistema de Sinalização VIP */}
            <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-indigo-500/5 border border-indigo-150 rounded-2xl p-4 text-xs flex gap-3.5 items-start text-slate-800 animate-fadeIn">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-850 text-xs flex items-center gap-1.5">
                  Painel de Sinalização Premium (Anti-Vício & Inteligência VIP) 💎
                </h4>
                <p className="text-slate-550 leading-relaxed text-[11px]">
                  O sistema analisa automaticamente os lotes de reservas integradas. Clientes com a sinalização <strong className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-bold">✨ Elegível VIP</strong> compraram <strong>pelo menos 10 cotas confirmadas de uma única vez</strong>. Você pode habilitá-los como VIPs clicando no ícone de coroa ou convidá-los diretamente para seu grupo do WhatsApp clicando no botão de contato.
                </p>
              </div>
            </div>

            {/* Quick tabs filters for Clients table */}
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center border-b border-slate-150 pb-2">
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setClientFilterTab("all")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    clientFilterTab === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100/80"
                  }`}
                >
                  Todos ({clients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClientFilterTab("vip_only")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    clientFilterTab === "vip_only"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100/80"
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 shrink-0" />
                  Portadores VIP ({clients.filter((c) => c.isVip).length})
                </button>
                <button
                  type="button"
                  onClick={() => setClientFilterTab("eligible_vip")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    clientFilterTab === "eligible_vip"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-50 text-indigo-600 hover:text-indigo-850 hover:bg-indigo-100/50"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                  Elegíveis VIP ({
                    clients.filter((c) => {
                      const res = eligibleVipClientsMap[c.uid];
                      return res && res.qualifyingBatches.length > 0;
                    }).length
                  })
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                <div className="relative flex-1 sm:flex-initial w-full sm:max-w-xs text-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome, CPF, e-mail..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full bg-slate-50"
                  />
                </div>

                {/* Controles de ordenação */}
                <div className="flex items-center gap-1 w-full sm:w-auto px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase px-1">Ordenar:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (clientSortBy === "name") {
                        setClientSortOrder(prev => prev === "asc" ? "desc" : "asc");
                      } else {
                        setClientSortBy("name");
                        setClientSortOrder("asc");
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[10px] font-black uppercase cursor-pointer flex items-center gap-1 ${
                      clientSortBy === "name"
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Nome {clientSortBy === "name" && (clientSortOrder === "asc" ? "▲" : "▼")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (clientSortBy === "createdAt") {
                        setClientSortOrder(prev => prev === "asc" ? "desc" : "asc");
                      } else {
                        setClientSortBy("createdAt");
                        setClientSortOrder("desc");
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all text-[10px] font-black uppercase cursor-pointer flex items-center gap-1 ${
                      clientSortBy === "createdAt"
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Cadastro {clientSortBy === "createdAt" && (clientSortOrder === "asc" ? "▲" : "▼")}
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider select-none">
                    <th
                      onClick={() => {
                        if (clientSortBy === "name") {
                          setClientSortOrder(prev => prev === "asc" ? "desc" : "asc");
                        } else {
                          setClientSortBy("name");
                          setClientSortOrder("asc");
                        }
                      }}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nome completo / E-mail</span>
                        {clientSortBy === "name" ? (
                          <span className="text-slate-850 text-[10px] ml-0.5">{clientSortOrder === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-slate-350 text-[10px] ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">▲</span>
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">CPF (Validador)</th>
                    <th className="py-3 px-4">Endereço (Cidade/UF)</th>
                    <th className="py-3 px-4">Celular (WhatsApp)</th>
                    <th
                      onClick={() => {
                        if (clientSortBy === "createdAt") {
                          setClientSortOrder(prev => prev === "asc" ? "desc" : "asc");
                        } else {
                          setClientSortBy("createdAt");
                          setClientSortOrder("desc");
                        }
                      }}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors group"
                    >
                      <div className="flex items-center gap-1">
                        <span>Cadastro Data</span>
                        {clientSortBy === "createdAt" ? (
                          <span className="text-slate-850 text-[10px] ml-0.5">{clientSortOrder === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-slate-350 text-[10px] ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">▲</span>
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Ações de Controle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((cl) => (
                    <tr key={cl.uid} className={`border-b border-slate-100 hover:bg-slate-50/50 ${cl.isBlocked ? "bg-rose-50/20" : ""}`}>
                      <td className="py-4 px-4 font-bold text-slate-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{cl.name}</span>
                          {cl.isBlocked && (
                            <span className="px-1.5 py-0.5 text-[8.5px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-md uppercase tracking-wider">BLOQUEADO</span>
                          )}
                          {cl.isVip && (
                            <span className="px-1.5 py-0.5 text-[8.5px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-md uppercase tracking-wider flex items-center gap-0.5" title="Portador VIP - Desconto e acesso antecipado ativos">
                              <Crown className="w-2.5 h-2.5 text-amber-600 fill-amber-400" /> VIP
                            </span>
                          )}
                          {!cl.isVip && eligibleVipClientsMap[cl.uid]?.qualifyingBatches.length > 0 && (
                            <span className="px-1.5 py-0.5 text-[8.5px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md uppercase tracking-wider flex items-center gap-0.5 animate-pulse" title={`Qualificado: comprou ${eligibleVipClientsMap[cl.uid]?.maxSinglePurchaseCount} cotas de uma única vez!`}>
                              <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> Elegível VIP
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">{cl.email}</div>
                        {eligibleVipClientsMap[cl.uid]?.qualifyingBatches.length > 0 && (
                          <div className="text-[9.5px] text-indigo-600 mt-1 font-semibold flex flex-col gap-0.5 bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-100/50 max-w-[250px]">
                            <div className="flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-500" />
                              <span>Comprou {eligibleVipClientsMap[cl.uid]?.maxSinglePurchaseCount} cotas de uma vez!</span>
                            </div>
                            <span className="text-slate-400 font-normal text-[8.5px]">
                              Campanha: {eligibleVipClientsMap[cl.uid]?.qualifyingBatches[0]?.campaignTitle}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-600">
                        {cl.cpf.slice(0, 3)}.{cl.cpf.slice(3, 6)}.{cl.cpf.slice(6, 9)}-{cl.cpf.slice(9, 11)}
                      </td>
                      <td className="py-4 px-4 text-slate-600">{cl.city}</td>
                      <td className="py-4 px-4 font-mono text-slate-600">
                        {cl.phone ? (() => {
                          const clean = cl.phone.replace(/\D/g, "");
                          const url = `https://wa.me/55${clean}`;
                          const formatted = `(${cl.phone.slice(0, 2)}) ${cl.phone.slice(2, 7)}-${cl.phone.slice(7)}`;
                          return (
                            <div className="flex items-center gap-1.5 font-mono">
                              <span>{formatted}</span>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center p-1 bg-emerald-100 hover:bg-emerald-250 text-emerald-800 rounded-full transition"
                                title="Chamar no WhatsApp"
                              >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M12.022 2C6.5 2 2 6.5 2 12.022c0 1.766.457 3.428 1.256 4.887L1.13 22.872a.5.5 0 0 0 .61.61l5.963-2.126a10.024 10.024 0 0 0 4.319.98c5.522 0 10.022-4.5 10.022-10.022C22.044 6.5 17.544 2 12.022 2zm6.183 14.881c-.267.755-1.35 1.4-1.85 1.455-.453.05-1.042.043-1.684-.162-2.336-.745-3.92-.128-5.882-2.09l-.162-.162c-1.93-1.934-2.58-3.565-1.83-5.912l.142-.446c.162-.513.56-1.114 1.114-1.114l.812.001c.219 0 .425.043.513.26l.462 1.127.35.856c.088.219.013.438-.13.585l-.546.546c-.075.075-.1.175-.05.275.462.91 1.05 1.745 1.745 2.441.724.724 1.572 1.3 2.502 1.743.1.052.2.028.275-.05l.546-.546c.142-.143.367-.219.585-.13l1.983.812c.219.088.256.326.2.55z" />
                                </svg>
                              </a>
                            </div>
                          );
                        })() : (
                          <span className="text-slate-400">Sem telefone</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-400">{new Date(cl.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIssueSelectedClient(cl);
                              const activeCamps = campaigns.filter(c => c.status === "active");
                              setIssueCampaignId(activeCamps.length > 0 ? activeCamps[0].id : "");
                              setIssueNumbersType("specific");
                              setIssueSpecificNumbers("");
                              setIssueRandomCount(1);
                              setIssueStatus("confirmed");
                              setIssueError(null);
                              setIssueSuccess(null);
                              setShowIssueTicketsModal(true);
                            }}
                            className="p-1.5 text-emerald-600 hover:text-emerald-850 hover:bg-emerald-50 rounded-lg transition"
                            title="Lançar Cotas (Manual)"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditClient(cl)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-850 hover:bg-indigo-50 rounded-lg transition"
                            title="Editar Dados"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleVipClient(cl)}
                            className={`p-1.5 rounded-lg transition ${
                              cl.isVip 
                                ? "text-amber-500 hover:text-amber-700 hover:bg-amber-50" 
                                : "text-slate-400 hover:text-amber-600 hover:bg-amber-50/50"
                            }`}
                            title={cl.isVip ? "Remover de VIP" : "Tornar em VIP (Vantagens de desconto e antecipação)"}
                          >
                            <Crown className={`w-4 h-4 ${cl.isVip ? "fill-amber-400 text-amber-500" : ""}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleBlockClient(cl)}
                            className={`p-1.5 rounded-lg transition ${
                              cl.isBlocked 
                                ? "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50" 
                                : "text-amber-600 hover:text-amber-850 hover:bg-amber-50"
                            }`}
                            title={cl.isBlocked ? "Desbloquear Acesso" : "Bloquear Acesso"}
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClient(cl)}
                            className="p-1.5 text-rose-600 hover:text-rose-850 hover:bg-rose-50 rounded-lg transition"
                            title="Excluir Perfil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Nenhum cliente cadastrado com este critério de filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Clients Cards on Mobile Viewports (< md) */}
            <div className="block md:hidden space-y-4">
              {filteredClients.map((cl) => {
                const cleanPhone = cl.phone.replace(/\D/g, "");
                const waUrl = `https://wa.me/55${cleanPhone}`;
                return (
                  <div
                    key={cl.uid}
                    className={`bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3.5 shadow-sm ${cl.isBlocked ? "border-rose-200/70 bg-rose-50/10" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0">
                          <UserIcon className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs sm:text-sm leading-tight flex items-center gap-1.5 flex-wrap">
                            <span>{cl.name}</span>
                            {cl.isBlocked && (
                              <span className="px-1.5 py-0.5 text-[8px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-md uppercase tracking-wider">BLOQUEADO</span>
                            )}
                            {cl.isVip && (
                              <span className="px-1.5 py-0.5 text-[8.5px] font-black text-amber-850 bg-amber-50 border border-amber-200 rounded-md uppercase tracking-wider flex items-center gap-0.5" title="Portador VIP">
                                <Crown className="w-2.5 h-2.5 text-amber-600 fill-amber-400" /> VIP
                              </span>
                            )}
                            {!cl.isVip && eligibleVipClientsMap[cl.uid]?.qualifyingBatches.length > 0 && (
                              <span className="px-1.5 py-0.5 text-[8px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md uppercase tracking-wider flex items-center gap-0.5 animate-pulse">
                                <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> Elegível VIP
                              </span>
                            )}
                          </h4>
                          <span className="text-[10px] text-slate-400 block">{cl.email}</span>
                          {eligibleVipClientsMap[cl.uid]?.qualifyingBatches.length > 0 && (
                            <div className="text-[9.5px] text-indigo-600 mt-1 font-semibold flex flex-col gap-0.5 bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-100/50 max-w-full">
                              <div className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-indigo-500" />
                                <span>Comprou {eligibleVipClientsMap[cl.uid]?.maxSinglePurchaseCount} cotas de uma vez!</span>
                              </div>
                              <span className="text-slate-400 font-normal text-[8.5px]">
                                Campanha: {eligibleVipClientsMap[cl.uid]?.qualifyingBatches[0]?.campaignTitle}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 bg-white p-3 border border-slate-150 rounded-xl text-[11px] text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">CPF:</span>
                        <span className="font-mono font-medium">
                          {cl.cpf.slice(0, 3)}.{cl.cpf.slice(3, 6)}.{cl.cpf.slice(6, 9)}-{cl.cpf.slice(9, 11)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Cidade:</span>
                        <span className="font-medium text-slate-800">{cl.city}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Telefone:</span>
                        <span className="font-mono font-medium">
                          ({cl.phone.slice(0, 2)}) {cl.phone.slice(2, 7)}-{cl.phone.slice(7)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 mt-1">
                        <span className="text-slate-400">Cadastro:</span>
                        <span>{new Date(cl.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-0.5">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
                      >
                        <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.022-.053-.078-.084-.136-.084l-.112.016c-.22.046-.44.095-.662.146-.118.027-.238.053-.357.08-.059.014-.103.061-.112.12-.027.172-.075.341-.143.504-.265.632-.733 1.155-1.321 1.48a6.594 6.594 0 0 1-3.072.784H11.5a6.57 6.57 0 0 1-4.887-2.18A6.575 6.575 0 0 1 4.5 11.5v-.38c.002-1.042.278-2.062.805-2.955.334-.567.85-1.018 1.46-1.28a2.916 2.916 0 0 0 .584-.337l.067-.061c.045-.043.066-.107.051-.17-.116-.484-.252-.962-.41-1.43a.138.138 0 0 0-.116-.098h-.114c-.381.013-.762.06-1.134.138-1.57.33-2.9 1.258-3.69 2.58A11.393 11.393 0 0 0 1 12.02v.457c.005 1.764.444 3.493 1.272 5.025a11.39 11.39 0 0 0 3.515 4.14 11.353 11.353 0 0 0 5.176 1.954 11.232 11.232 0 0 0 3.235-.043c1.942-.422 3.69-1.464 4.908-2.98.636-.788 1.11-1.7 1.34-2.696.027-.114.015-.235-.03-.342l-.444-.814" />
                          <path d="M12.022 2C6.5 2 2 6.5 2 12.022c0 1.766.457 3.428 1.256 4.887L1.13 22.872a.5.5 0 0 0 .61.61l5.963-2.126a10.024 10.024 0 0 0 4.319.98c5.522 0 10.022-4.5 10.022-10.022C22.044 6.5 17.544 2 12.022 2zm6.183 14.881c-.267.755-1.35 1.4-1.85 1.455-.453.05-1.042.043-1.684-.162-2.336-.745-3.92-.128-5.882-2.09l-.162-.162c-1.93-1.934-2.58-3.565-1.83-5.912l.142-.446c.162-.513.56-1.114 1.114-1.114l.812.001c.219 0 .425.043.513.26l.462 1.127.35.856c.088.219.013.438-.13.585l-.546.546c-.075.075-.1.175-.05.275.462.91 1.05 1.745 1.745 2.441.724.724 1.572 1.3 2.502 1.743.1.052.2.028.275-.05l.546-.546c.142-.143.367-.219.585-.13l1.983.812c.219.088.256.326.2.55z" strokeWidth="0" />
                        </svg>
                        <span>WhatsApp Quick Chat</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setIssueSelectedClient(cl);
                          const activeCamps = campaigns.filter(c => c.status === "active");
                          setIssueCampaignId(activeCamps.length > 0 ? activeCamps[0].id : "");
                          setIssueNumbersType("specific");
                          setIssueSpecificNumbers("");
                          setIssueRandomCount(1);
                          setIssueStatus("confirmed");
                          setIssueError(null);
                          setIssueSuccess(null);
                          setShowIssueTicketsModal(true);
                        }}
                        className="w-full text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl font-bold text-xs shadow-sm transition"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        <span>Lançar Cotas Manuais</span>
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditClient(cl)}
                          className="flex items-center justify-center gap-1.5 px-2 py-2 hover:bg-slate-100 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 shadow-xs transition text-xs"
                        >
                          <Edit className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleVipClient(cl)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl font-bold transition shadow-xs text-xs ${
                            cl.isVip
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <Crown className={`w-3.5 h-3.5 ${cl.isVip ? "text-amber-600 fill-amber-400" : "text-slate-400"}`} />
                          <span>{cl.isVip ? "Remover VIP" : "Tornar VIP"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBlockClient(cl)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl font-bold transition shadow-xs text-xs ${
                            cl.isBlocked
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <Shield className={`w-3.5 h-3.5 ${cl.isBlocked ? "text-rose-600" : "text-amber-500"}`} />
                          <span>{cl.isBlocked ? "Liberar" : "Bloquear"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(cl)}
                          className="flex items-center justify-center gap-1.5 px-2 py-2 hover:bg-rose-50 text-rose-700 bg-white border border-rose-100 shadow-xs rounded-xl font-bold transition text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredClients.length === 0 && (
                <p className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-2xl">
                  Nenhum cliente cadastrado com este critério de filtro.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "backup" && (
          /* SECTION 7: BACKUP AND EXPORT OF DATA */
          <div className="space-y-8 animate-fadeIn">
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                Segurança e Exportação de Dados
              </h2>
              <p className="text-xs text-slate-400">
                Faça backups completos das configurações, exporte relatórios em formato CSV e restaure dados caso necessário.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PANEL 1: EXPORT CSV FOR SALES */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 space-y-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Download className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-850 text-sm">Exportar Vendas para Excel (CSV)</h3>
                    <p className="text-[10px] text-slate-450 leading-relaxed">Baixe relatórios de compradores e reservas prontos para faturamento.</p>
                  </div>
                </div>

                <div className="space-y-3.5 pt-1">
                  <div>
                    <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Campanha/Rifa:</label>
                    <select
                      value={selectedExportCampaign}
                      onChange={(e) => setSelectedExportCampaign(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 focus:border-indigo-500 focus:bg-white text-slate-700 rounded-xl px-3 py-2.5 outline-none transition font-sans"
                    >
                      <option value="all">Todas as Campanhas (Geral)</option>
                      {campaigns.map((camp) => (
                        <option key={camp.id} value={camp.id}>
                          {camp.title} ({camp.status === "active" ? "Ativa" : "Encerrada"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Situação dos Bilhetes:</label>
                    <select
                      value={selectedExportStatus}
                      onChange={(e) => setSelectedExportStatus(e.target.value as any)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 focus:border-indigo-500 focus:bg-white text-slate-700 rounded-xl px-3 py-2.5 outline-none transition font-sans"
                    >
                      <option value="all">Todos os Status (Completos)</option>
                      <option value="confirmed">Somente Cotas Pagas (Confirmadas)</option>
                      <option value="reserved">Somente Cotas Reservadas (Pendentes)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleExportTicketsCSV}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition mt-2.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Gerar e Baixar CSV
                  </button>
                  
                  <p className="text-[9.5px] text-slate-400 text-center text-balance leading-normal font-medium">
                    * O arquivo é exportado utilizando codificação UTF-8 BOM e separador \";\" para máxima compatibilidade com o Microsoft Excel do Brasil.
                  </p>
                </div>
              </div>

              {/* PANEL 2: EXPORT COMPLETE JSON BACKUP */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 space-y-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                    <Database className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-850 text-sm">Backup Completo do Banco (JSON)</h3>
                    <p className="text-[10px] text-slate-450 leading-relaxed">Duplique e guarde de forma integral todo o estado do seu faturamento.</p>
                  </div>
                </div>

                <div className="space-y-4 pt-1 flex flex-col justify-between h-[190px]">
                  <p className="text-[11.5px] text-slate-500 leading-relaxed font-sans">
                    Este backup consolida em um único arquivo todas as suas configurações de Pix, listas de rifas, contatos dos compradores cadastrados, e o histórico individual de cada cota comprada ou reservada. Conserve este arquivo em local seguro.
                  </p>

                  <div className="space-y-2">
                    <button
                      onClick={handleExportDatabaseJSON}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Baixar Cópia Geral de Segurança (.json)
                    </button>
                    
                    <div className="text-center font-mono text-[9px] text-slate-400 uppercase tracking-widest font-black">
                      ESTADO ATUAL DO BANCO: {campaigns.length} RIFAS | {clients.length} CLIENTES
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PANEL 3: RESTORE DATABASE BACKUP */}
            <div className="bg-slate-50 rounded-2xl border border-slate-250 p-5 md:p-6 space-y-5">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 font-bold" />
                  Restauração de Dados (Upload de Backup)
                </h3>
                <p className="text-xs text-slate-400">
                  Suba um arquivo de backup (.json) gerado anteriormente para reconstituir os dados no banco de dados.
                </p>
              </div>

              <div className="border border-dashed border-red-200 bg-red-50/25 p-4 rounded-xl">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-red-800 uppercase tracking-wider font-sans">Atenção Crítica: Restauração Sobrescreve Dados</h4>
                    <p className="text-[11px] text-red-750 font-medium leading-relaxed font-sans">
                      Ao carregar o arquivo de backup e iniciar a restauração, os registros atuais de campanhas, bilhetes e perfis de clientes que compartilhem os mesmos identificadores (IDs) serão sobrescritas no Firestore. Certifique-se de escolher o arquivo correto!
                    </p>
                  </div>
                </div>
              </div>

              {!isRestoring && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                    <label className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition cursor-pointer shrink-0">
                      <Upload className="w-4 h-4" />
                      Selecionar Arquivo de Backup
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleBackupFileChange}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[320px] font-mono">
                      {backupFile ? backupFile.name : "Nenhum arquivo .json selecionado"}
                    </span>
                  </div>

                  {parsedBackupData && (
                    <div className="bg-white rounded-2xl border border-indigo-200 p-4 space-y-3.5 animate-fadeIn">
                      <h4 className="text-xs font-black text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-indigo-600 font-bold" />
                        Visualização e Resumo do Backup Encontrado
                      </h4>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                          <span className="text-[9.5px] uppercase font-bold text-slate-400">Data de Exportação</span>
                          <span className="text-xs font-mono font-bold text-slate-705 mt-1">
                            {parsedBackupData.exportedAt ? new Date(parsedBackupData.exportedAt).toLocaleDateString("pt-BR") : "N/A"}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                          <span className="text-[9.5px] uppercase font-bold text-slate-400">Campanhas/Rifas</span>
                          <span className="text-xs font-sans font-black text-slate-705 mt-1">
                            {parsedBackupData.campaigns?.length || 0}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                          <span className="text-[9.5px] uppercase font-bold text-slate-400">Total Cotas Ativas</span>
                          <span className="text-xs font-mono font-bold text-slate-705 mt-1">
                            {parsedBackupData.allReservations ? Object.values(parsedBackupData.allReservations).reduce((acc: number, list: any) => acc + (list?.length || 0), 0) : 0}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                          <span className="text-[9.5px] uppercase font-bold text-slate-400">Clientes Atrelados</span>
                          <span className="text-xs font-sans font-black text-slate-750 mt-1">
                            {parsedBackupData.clients?.length || 0}
                          </span>
                        </div>
                      </div>

                      <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-xs flex flex-col gap-1 text-indigo-800">
                        <span className="font-bold flex items-center gap-1">🛡️ Configurações Encontradas no Arquivo:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[10.5px] mt-1 text-indigo-750">
                          <div>Chave Pix: {parsedBackupData.settings?.pixKey || "N/A"}</div>
                          <div>Cedente: {parsedBackupData.settings?.receiverName || "N/A"}</div>
                          <div>Banco: {parsedBackupData.settings?.bankName || "N/A"}</div>
                          <div>Expiração: {parsedBackupData.settings?.expirationHours || "N/A"}h</div>
                        </div>
                      </div>

                      <div className="flex gap-2.5 pt-1">
                        <button
                          onClick={handleRestoreBackup}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
                        >
                          <Database className="w-4 h-4" />
                          Confirmar e Iniciar Restauração Geral
                        </button>
                        <button
                          onClick={() => {
                            setBackupFile(null);
                            setParsedBackupData(null);
                          }}
                          className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-650 hover:text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RESTORING PROGRESS DISPLAY */}
              {isRestoring && restoreProgress && (
                <div className="bg-white rounded-2xl border border-red-150 p-5 space-y-4 animate-pulse shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <h4 className="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                      Gravando Dados no Firestore... Não Feche esta Página
                    </h4>
                    <span className="text-[11px] font-mono text-red-700 font-bold">
                      Progresso estimado: {restoreProgress.current}%
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${restoreProgress.current}%` }}
                    />
                  </div>

                  <div className="text-[10px] text-slate-450 font-medium font-mono text-center">
                    Ação atual: <span className="text-slate-700 font-bold">{restoreProgress.step}</span>
                  </div>
                </div>
              )}
            </div>

            {/* PANEL 4: CLEAR / RESET RANKINGS */}
            <div className="bg-rose-50/20 rounded-2xl border border-rose-200 p-5 md:p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 shrink-0">
                  <Trophy className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 align-middle">
                    Limpar / Zerar Rankings de Vendas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Apague/libere todas as cotas compradas ou reservadas para zerar permanentemente o ranking de compradores. Os bilhetes voltarão à disponibilidade geral.
                  </p>
                </div>
              </div>

              {clearRankingError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{clearRankingError}</span>
                </div>
              )}

              {clearRankingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl font-bold text-[11px] flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{clearRankingSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end text-xs pt-1">
                <div>
                  <label className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-500 mb-1.5">Selecione o Alvo do Reset:</label>
                  <select
                    value={rankingClearCampaignId}
                    onChange={(e) => {
                      setRankingClearCampaignId(e.target.value);
                      setClearRankingSuccess(null);
                      setClearRankingError(null);
                    }}
                    className="w-full text-xs bg-white border border-slate-200 hover:border-slate-350 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-slate-700 font-semibold rounded-xl px-3.5 py-2.5 outline-none transition cursor-pointer"
                  >
                    <option value="all">Todas as Rifas / Campanhas (Zerar Tudo)</option>
                    {campaigns.map((camp) => (
                      <option key={camp.id} value={camp.id}>
                        {camp.title} ({allReservations[camp.id]?.length || 0} cotas ativas)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleClearRanking}
                    disabled={isClearingRanking}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-xl font-extrabold text-xs shadow-sm shadow-rose-200 transition cursor-pointer"
                  >
                    {isClearingRanking ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Limpando dados...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Confirmar e Zerar Ranking</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "pricing" && (
          /* SECTION 8: PRICING AND FINANCIAL SIMULATION DASHBOARD */
          <div className="space-y-8 animate-fadeIn">
            {/* Header info */}
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-600 font-bold" />
                Painel e Dashboard de Precificação Financeira
              </h2>
              <p className="text-xs text-slate-400">
                Calcule a margem de lucro por ação, cotas necessárias para pagar o custo do prêmio (Break-even), simule novos sorteios e compare com suas campanhas ativas reais.
              </p>
            </div>

            {/* Quick Presets / Cenários Rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: "Rifa Rápida (100 cotas)", tickets: 100, price: 10, prize: 350, extra: 50, desc: "Ação rápida e fechamento dinâmico" },
                { name: "Rifa Clássica (500 cotas)", tickets: 500, price: 10, prize: 1500, extra: 200, desc: "Modelo ideal para eletrônicos / celular" },
                { name: "Sorteio de Elite (1000 cotas)", tickets: 1000, price: 15, prize: 4500, extra: 500, desc: "Alta margem de lucro com prêmio robusto" },
                { name: "Ação em Lote (10000 cotas)", tickets: 10000, price: 5, prize: 15000, extra: 1500, desc: "Grande escala com venda de centenas" }
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setCalcSelectedCampaignId("manual");
                    setCalcTotalTickets(preset.tickets);
                    setCalcTicketPrice(preset.price);
                    setCalcPrizeCost(preset.prize);
                    setCalcExtraCosts(preset.extra);
                  }}
                  className="bg-white hover:bg-emerald-50/30 border border-slate-200 hover:border-emerald-250 p-4 rounded-2xl text-left transition shadow-xs hover:shadow-md cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-xs font-black text-slate-850 group-hover:text-emerald-700 tracking-wide font-sans">{preset.name}</h4>
                    <p className="text-[10px] text-slate-400 leading-snug mt-1">{preset.desc}</p>
                  </div>
                  <div className="flex gap-2.5 items-center mt-3 pt-2.5 border-t border-slate-100/70 text-[9.5px] font-mono text-slate-500">
                    <span>Cotas: <strong className="text-slate-700">{preset.tickets}</strong></span>
                    <span>Valor: <strong className="text-emerald-600">R$ {preset.price}</strong></span>
                  </div>
                </button>
              ))}
            </div>

            {/* Input and Configuration section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Box 1: Configuration Form (Inputs) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5 shadow-xs">
                <div className="border-b border-slate-150 pb-3 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-sm">Parâmetros de Simulação</h3>
                  <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[8.5px] uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Ajuste Fino
                  </span>
                </div>

                <div className="space-y-4 text-xs md:text-sm">
                  {/* Select integration */}
                  <div>
                    <label className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-500 mb-1.5">
                      Vincular / Copiar de Campanha Ativa:
                    </label>
                    <select
                      value={calcSelectedCampaignId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCalcSelectedCampaignId(val);
                        if (val !== "manual") {
                          const matched = campaigns.find(c => c.id === val);
                          if (matched) {
                            setCalcTicketPrice(matched.ticketPrice);
                            setCalcTotalTickets(matched.totalTickets);
                          }
                        }
                      }}
                      className="w-full text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:bg-white text-slate-700 rounded-xl px-3.5 py-2.5 outline-none transition font-semibold cursor-pointer"
                    >
                      <option value="manual">⚙️ Simulador Manual / Cenário Livre</option>
                      {campaigns.map((camp) => (
                        <option key={camp.id} value={camp.id}>
                          📊 {camp.title} ({camp.totalTickets} cotas @ R$ {camp.ticketPrice.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-400 mt-1 font-sans">
                      Ao selecionar uma campanha ativa, as cotas e o preço de venda unitário serão atualizados com os dados reais do Firestore.
                    </p>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Prize Cost Input */}
                  <div>
                    <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block mb-1">
                      Custo Real do Prêmio (R$):
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 font-bold text-xs">R$</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={calcPrizeCost}
                        onChange={(e) => setCalcPrizeCost(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-none font-bold text-xs text-slate-805 transition"
                        placeholder="Ex: 1500"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 leading-tight block mt-1 font-sans">
                      O valor líquido desembolsado para obter o prêmio (ex: custo do eletrônico, pix, celular ou prêmio seco).
                    </span>
                  </div>

                  {/* Extra/Operational Costs Input */}
                  <div>
                    <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block mb-1">
                      Outros Custos e Gastos Operacionais (R$):
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 font-bold text-xs">R$</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={calcExtraCosts}
                        onChange={(e) => setCalcExtraCosts(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-none font-bold text-xs text-slate-805 transition"
                        placeholder="Ex: 200"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 leading-tight block mt-1 font-sans">
                      Marketing pago, suporte do gateway de pagamentos, custos operacionais da plataforma ou despesas diversas do sorteio.
                    </span>
                  </div>

                  {/* Total quota count (if manual) */}
                  <div>
                    <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block mb-1">
                      Quantidade Total de Cotas:
                    </label>
                    <input
                      type="number"
                      min="10"
                      step="100"
                      disabled={calcSelectedCampaignId !== "manual"}
                      value={calcTotalTickets}
                      onChange={(e) => setCalcTotalTickets(Math.max(1, Number(e.target.value)))}
                      className={`w-full px-3.5 py-2.5 border rounded-xl outline-none font-bold text-xs transition ${
                        calcSelectedCampaignId !== "manual"
                          ? "bg-slate-105 border-slate-200 text-slate-450 cursor-not-allowed"
                          : "bg-slate-50 border-slate-200 focus:border-emerald-500 focus:bg-white text-slate-805"
                      }`}
                      placeholder="Ex: 1000"
                    />
                    <span className="text-[9px] text-slate-400 leading-tight block mt-1 font-sans">
                      {calcSelectedCampaignId !== "manual"
                        ? "Bloqueado pois está importando a quantidade de cotas oficial da rifa ativa vinculada."
                        : "Defina o tamanho da rifa (Ex: 100 para rifas de 2 algarismos, 1000 para rifas de 3 algarismos)."
                      }
                    </span>
                  </div>

                  {/* Quota ticket price */}
                  <div>
                    <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block mb-1">
                      Preço Unitário da Cota (R$):
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 font-bold text-xs">R$</span>
                      </div>
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        disabled={calcSelectedCampaignId !== "manual"}
                        value={calcTicketPrice}
                        onChange={(e) => setCalcTicketPrice(Math.max(0.01, Number(e.target.value)))}
                        className={`w-full pl-8 pr-3.5 py-2.5 border rounded-xl outline-none font-bold text-xs transition ${
                          calcSelectedCampaignId !== "manual"
                            ? "bg-slate-105 border-slate-200 text-slate-450 cursor-not-allowed"
                            : "bg-slate-50 border-slate-200 focus:border-emerald-500 focus:bg-white text-slate-805"
                        }`}
                        placeholder="Ex: 10.00"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 leading-tight block mt-1 font-sans">
                      {calcSelectedCampaignId !== "manual"
                        ? "Preço fixado pela campanha ativa vinculada."
                        : "Defina o valor de venda unitário por cota no simulador."
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Analysis Results & Projections */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Bento Grid: Financial KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* KPI 1: Gross revenue */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Receita Bruta Potencial</span>
                    <div className="mt-2">
                      <span className="text-lg font-extrabold text-slate-800">
                        R$ {(calcTotalTickets * calcTicketPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className="text-[9px] text-slate-404 mt-0.5">Se vender 100% das cotas</p>
                    </div>
                  </div>

                  {/* KPI 2: Total Cost */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Investimento Geral</span>
                    <div className="mt-2">
                      <span className="text-lg font-extrabold text-slate-800">
                        R$ {(calcPrizeCost + calcExtraCosts).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className="text-[9px] text-slate-404 mt-0.5">Prêmio + Operações</p>
                    </div>
                  </div>

                  {/* KPI 3: Breakeven tickets */}
                  <div className="bg-emerald-600 rounded-2xl p-4 shadow-sm text-white flex flex-col justify-between col-span-2 md:col-span-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-100">Break-even (Equilíbrio)</span>
                    <div className="mt-2">
                      <span className="text-lg font-extrabold">
                        {Math.ceil((calcPrizeCost + calcExtraCosts) / calcTicketPrice)} cotas
                      </span>
                      <p className="text-[9.5px] text-emerald-100 font-medium mt-0.5">
                        Equivale a {((Math.ceil((calcPrizeCost + calcExtraCosts) / calcTicketPrice) / calcTotalTickets) * 100).toFixed(1)}% de vendas
                      </p>
                    </div>
                  </div>

                  {/* KPI 4: Max Net Profit */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Lucro Líquido Alvo</span>
                    <div className="mt-2">
                      <span className={`text-lg font-extrabold ${
                        (calcTotalTickets * calcTicketPrice) - (calcPrizeCost + calcExtraCosts) >= 0 ? "text-emerald-700" : "text-rose-600"
                      }`}>
                        R$ {((calcTotalTickets * calcTicketPrice) - (calcPrizeCost + calcExtraCosts)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className="text-[9px] text-slate-404 mt-0.5">Margem total líquida</p>
                    </div>
                  </div>

                  {/* KPI 5: Return Margin */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Margem Comercial</span>
                    <div className="mt-2">
                      <span className="text-lg font-extrabold text-slate-805">
                        {(() => {
                          const gross = calcTotalTickets * calcTicketPrice;
                          const net = gross - (calcPrizeCost + calcExtraCosts);
                          if (gross === 0) return "0.0%";
                          return `${((net / gross) * 100).toFixed(1)}%`;
                        })()}
                      </span>
                      <p className="text-[9px] text-slate-404 mt-0.5">Retorno por Real investido</p>
                    </div>
                  </div>

                  {/* KPI 6: Profit per ticket sold */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Lucro Médio por Cotas</span>
                    <div className="mt-2">
                      <span className="text-lg font-extrabold text-indigo-650">
                        R$ {(() => {
                          const gross = calcTotalTickets * calcTicketPrice;
                          const net = gross - (calcPrizeCost + calcExtraCosts);
                          return (net / calcTotalTickets).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        })()}
                      </span>
                      <p className="text-[9px] text-slate-404 mt-0.5">Descontando custos médios</p>
                    </div>
                  </div>
                </div>

                {/* Real campaign data integration card if campaign is selected */}
                {calcSelectedCampaignId !== "manual" && (() => {
                  const selectedCampaignObj = campaigns.find(c => c.id === calcSelectedCampaignId);
                  if (!selectedCampaignObj) return null;

                  const campaignTicketsList = allReservations[calcSelectedCampaignId] || [];
                  const confirmedTickets = campaignTicketsList.filter(t => t.status === "confirmed");
                  const reservedTickets = campaignTicketsList.filter(t => t.status === "reserved");

                  // Real income calculated
                  const realConfirmedCount = confirmedTickets.length;
                  const realReservedCount = reservedTickets.length;
                  const realValueArrecadado = realConfirmedCount * calcTicketPrice;
                  
                  // Total costs
                  const totalSimulationCost = calcPrizeCost + calcExtraCosts;
                  const breakevenTicketsCount = Math.ceil(totalSimulationCost / calcTicketPrice);

                  const progressToBreakeven = Math.min(100, Math.ceil((realConfirmedCount / breakevenTicketsCount) * 100));
                  const isBreakEvenReached = realValueArrecadado >= totalSimulationCost;

                  return (
                    <div className="bg-slate-900 rounded-2xl p-5 md:p-6 text-white space-y-4 shadow-md animate-fadeIn">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="bg-indigo-505 text-white font-extrabold text-[8.5px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-1.5">
                            Status Real da Ação do Firestore
                          </span>
                          <h4 className="font-bold text-sm text-slate-100">{selectedCampaignObj.title}</h4>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-medium text-slate-400 block">Vendido Real</span>
                          <span className="font-mono font-bold text-xs block mt-0.5">{realConfirmedCount} cota(s) pagas</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 pt-1.5">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Faturamento Atual</span>
                          <span className="font-mono text-sm font-extrabold text-emerald-400 block mt-1">R$ {realValueArrecadado.toFixed(2)}</span>
                          <span className="text-[8px] text-slate-500 block mt-0.5 font-sans">Reservado pendente: R$ {(realReservedCount * calcTicketPrice).toFixed(2)}</span>
                        </div>
                        
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Taxa de Break-even</span>
                          <span className="font-sans text-sm font-extrabold text-white block mt-1">{progressToBreakeven}% do Custo</span>
                          <span className="text-[8px] text-slate-500 block mt-0.5 font-sans">Alvo: {breakevenTicketsCount} cotas</span>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 col-span-2 sm:col-span-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Margem Líquida Atual</span>
                          <span className={`text-sm font-extrabold block mt-1 ${
                            isBreakEvenReached ? "text-emerald-400" : "text-amber-400"
                          }`}>
                            R$ {(realValueArrecadado - totalSimulationCost).toFixed(2)}
                          </span>
                          <span className="text-[8px] text-slate-500 block mt-0.5 font-sans">Prejuízo ou Lucro real</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-xs">
                        {isBreakEvenReached ? (
                          <div className="text-emerald-400 flex items-center gap-1.5 font-sans">
                            <span className="flex h-2 w-2 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <strong>Excelente!</strong> Esta campanha já ultrapassou o ponto de equilíbrio financeiro. Cada venda de cota agora é 100% lucro líquido! Lucro líquido real atual: R$ {(realValueArrecadado - totalSimulationCost).toFixed(2)}.
                          </div>
                        ) : (
                          <div className="text-amber-400 flex items-center gap-1.5 font-sans">
                            <span className="flex h-2 w-2 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            <span>Ainda faltam <strong className="text-white">{Math.max(0, breakevenTicketsCount - realConfirmedCount)} cotas pagas</strong> (aprox. R$ {Math.max(0, totalSimulationCost - realValueArrecadado).toFixed(2)}) para cobrir os custos do prêmio e operacional.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* table list with expectations details */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-slate-505 tracking-wider">Cenários de Faturamento Incremental</span>
                    <span className="text-[10px] text-slate-404 font-mono">Meta Nominal: {calcTotalTickets} cotas</span>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs">
                    {[25, 50, 75, 100].map((percent) => {
                      const soldCount = Math.ceil((calcTotalTickets * percent) / 100);
                      const grossRevenue = soldCount * calcTicketPrice;
                      const totalCosts = calcPrizeCost + calcExtraCosts;
                      const netProfit = grossRevenue - totalCosts;
                      const isProfit = netProfit >= 0;

                      return (
                        <div key={percent} className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans hover:bg-slate-50/50 transition">
                          <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                              percent === 100 ? "bg-emerald-100 text-emerald-800" :
                              percent === 75 ? "bg-indigo-100 text-indigo-805" :
                              percent === 50 ? "bg-amber-100 text-amber-850" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {percent}%
                            </span>
                            <div>
                              <p className="font-bold text-slate-800">{soldCount} cotas vendidas</p>
                              <span className="text-[10px] text-slate-404 block">Faturamento bruto: R$ {grossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                            <div className="text-left sm:text-right">
                              <span className="text-[9px] uppercase font-bold text-slate-400 block">Situação Financeira</span>
                              <span className={`font-mono font-bold ${isProfit ? "text-emerald-700" : "text-rose-600"}`}>
                                R$ {netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${
                              isProfit
                                ? "bg-emerald-50 text-emerald-850 border border-emerald-150"
                                : "bg-rose-50/70 text-rose-800 border border-rose-150"
                            }`}>
                              {isProfit ? "✅ Lucro Líquido" : "⚠️ Prejuízo"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional mathematical guidelines card */}
                <div className="bg-emerald-500/5 border border-emerald-150 rounded-2xl p-4 flex gap-3 text-emerald-850 text-xs text-balance">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 self-start shrink-0">
                    <Info className="w-4 h-4 font-bold" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-emerald-900 mb-1">Dicas financeiras do Chiquinho para sua Rifa</h5>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-850 leading-relaxed font-sans">
                      <li><strong>Análise de elasticidade:</strong> Se a margem estiver muito baixa, experimente abaixar ligeiramente o número total de cotas ou aumentar o preço unitário em R$ 2,00.</li>
                      <li><strong>Volume vs Valor:</strong> Rifas de 10.000 cotas têm excelente aceitação quando o ticket unitário custa de R$ 0,50 a R$ 2,00. Rifas de 100 a 1.000 cotas suportam tickets mais altos de R$ 10,00 a R$ 50,00.</li>
                      <li><strong>Incentive compras em bando:</strong> Lembre-se de configurar os Descontos Progressivos (Ex: Leve 5 por R$ 40 em vez de R$ 50) para acelerar a captação e atingir o break-even duas vezes mais rápido!</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "expressDraw" && (
          /* SECTION 9: INTERACTIVE LIVE EXPRESS DRAWING SCREEN */
          <div className="space-y-8 animate-fadeIn text-slate-800">
            {/* Header info */}
            <div>
              <h2 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                Painel do Sorteador Inteligente (Campanhas Expressas) ⚡
              </h2>
              <p className="text-xs text-slate-400">
                Visualize as campanhas expressas fechadas ou ativas, confira a lista de compradores confirmados e realize o sorteio animado em tempo real.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* LEFT COLUMN: LIST OF EXPRESS CAMPAIGNS FOR DRAWING */}
              <div className="lg:col-span-5 space-y-5">
                <div className="border-b border-slate-150 pb-3">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    Campanhas Expressas Disponíveis
                  </h3>
                </div>

                {(() => {
                  const expressCampList = campaigns.filter(c => c.drawMode === "express");
                  const activeExpress = expressCampList.filter(c => c.status !== "drawn");

                  if (activeExpress.length === 0) {
                    return (
                      <div className="bg-slate-50 border border-slate-205 border-dashed rounded-2xl p-6 text-center text-xs text-slate-400 space-y-2">
                        <Trophy className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-bold">Nenhuma campanha expressa pendente de sorteio!</p>
                        <p className="text-[10px] text-slate-400/80 leading-snug">
                          Apenas campanhas ativas configuradas no modo 'Expressa' que ainda não foram sorteadas aparecerão aqui para serem contempladas.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {activeExpress.map((camp) => {
                        const ticketsList = allReservations[camp.id] || [];
                        const confirmedTickets = ticketsList.filter(t => t.status === "confirmed");
                        const reservedTickets = ticketsList.filter(t => t.status === "reserved");
                        const confirmedPercentage = Math.min(100, Math.ceil((confirmedTickets.length / camp.totalTickets) * 100));

                        const isSelected = selectedExpressCamp?.id === camp.id;

                        return (
                          <div
                            key={camp.id}
                            className={`bg-white border rounded-2xl p-5 transition shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden ${
                              isSelected
                                ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/5"
                                : "border-slate-200"
                            }`}
                            onClick={() => {
                              setSelectedExpressCamp(camp);
                              setExpressCelebrationWinner(null);
                              setSpinningTicket(null);
                            }}
                          >
                            <div>
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="font-extrabold text-xs text-slate-800 line-clamp-1">{camp.title}</h4>
                                <span className={`shrink-0 font-extrabold text-[8.5px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  confirmedPercentage === 105
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-150"
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-150"
                                }`}>
                                  {confirmedPercentage === 100 ? "100% Vendido" : "Ativa"}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                Preço unitário: R$ {camp.ticketPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </p>
                            </div>

                            {/* Status progress indicator bar */}
                            <div className="space-y-1 text-[10px]">
                              <div className="flex justify-between text-slate-500 font-semibold">
                                <span>Progresso de Vendas Pagas:</span>
                                <strong className="font-mono text-slate-800">{confirmedTickets.length} / {camp.totalTickets} ({confirmedPercentage}%)</strong>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-150">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    confirmedPercentage === 100 ? "bg-emerald-500" : "bg-indigo-550"
                                  }`}
                                  style={{ width: `${confirmedPercentage}%` }}
                                />
                              </div>
                              <div className="flex gap-4 text-[9.5px] text-slate-400 font-medium">
                                <span>Confirmadas: <strong className="text-slate-650 font-mono">{confirmedTickets.length}</strong></span>
                                <span>Reservadas: <strong className="text-slate-650 font-mono">{reservedTickets.length}</strong></span>
                              </div>
                            </div>

                            {/* Ticket scroll preview if selected */}
                            {isSelected && confirmedTickets.length > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 space-y-1.5 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Compradores Elegíveis ({confirmedTickets.length}):</span>
                                <div className="max-h-[110px] overflow-y-auto divide-y divide-slate-150 text-[10px] scrollbar-thin">
                                  {confirmedTickets.map((t) => (
                                    <div key={t.number} className="py-1 flex justify-between font-medium">
                                      <span className="text-slate-700 truncate max-w-[150px]">{t.buyerName || "Consumidor"}</span>
                                      <span className="font-mono text-indigo-700 font-bold">#{t.number}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              className={`w-full py-2.5 rounded-xl font-extrabold text-[11px] leading-tight transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                                isSelected
                                  ? "bg-indigo-650 hover:bg-indigo-700 text-white font-black"
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-755 border border-slate-200"
                              }`}
                            >
                              <Trophy className="w-3.5 h-3.5 shrink-0" />
                              <span>{isSelected ? "Pronto no Terminal" : "Carregar no Terminal"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* RIGHT COLUMN: INTERACTIVE DRAW WORKING AREA */}
              <div className="lg:col-span-7">
                <div className="border-b border-slate-150 pb-3 mb-5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    Terminal Eletrônico de Sorteios
                  </h3>
                </div>

                {!selectedExpressCamp ? (
                  <div className="bg-slate-50 border border-slate-150 border-dashed rounded-3xl p-10 text-center flex flex-col items-center justify-center min-h-[420px] text-slate-400 space-y-4 shadow-inner">
                    <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-350 shadow-sm animate-pulse">
                      <Zap className="w-8 h-8 text-indigo-400/80" />
                    </div>
                    <div className="max-w-md space-y-1.5">
                      <h4 className="font-black text-slate-800 text-sm">Nenhum sorteio selecionado</h4>
                      <p className="text-xs text-slate-400 flex-wrap text-center leading-relaxed">
                        Escolha uma das campanhas da modalidade Expressa listadas à esquerda do painel para carregar as cotas no sistema de computação gráfica e realizar o sorteio aleatório auditável.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-950 rounded-3xl p-6 md:p-8 space-y-6 text-white shadow-2xl relative overflow-hidden animate-fadeIn">
                    
                    {/* Background Neon Grid Accents */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Active Campaign Info Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-extrabold">Terminal Conectado</span>
                        </div>
                        <h4 className="font-black text-base text-slate-100 tracking-tight leading-tight mt-1">{selectedExpressCamp.title}</h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isExpressSpinning) return;
                          setSelectedExpressCamp(null);
                          setExpressCelebrationWinner(null);
                          setSpinningTicket(null);
                        }}
                        disabled={isExpressSpinning}
                        className="text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 transition font-semibold disabled:opacity-50"
                      >
                        Desconectar
                      </button>
                    </div>

                    {/* Módulo de Prevenção de Ganhadores Repetidos e Dados Viciados (Anti-Vício) */}
                    <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 space-y-3.5 select-none animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div>
                            <span className="text-xs font-extrabold text-slate-200 block">Módulo Anti-Vício Avançado</span>
                            <span className="text-[10px] text-slate-500 block">Distribuição justa de prêmios com alta entropia</span>
                          </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={antiVicioActive}
                            onChange={(e) => setAntiVicioActive(e.target.checked)}
                            disabled={isExpressSpinning}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-650 peer-checked:after:bg-indigo-100" />
                        </label>
                      </div>

                      <div className="text-[10px] text-slate-400 leading-normal space-y-1 bg-white/5 p-2 rounded-xl border border-white/[0.03]">
                        <p className="font-semibold text-slate-300">Como funciona a prevenção:</p>
                        <p>
                          1. **Detecção de Frequência**: Evita que o mesmo cliente (detectado por CPF, Telefone ou Nome) ganhe repetidamente se houverem outros compradores pagos elegíveis que ainda não foram contemplados.
                        </p>
                        <p>
                          2. **Entropia Criptográfica**: Gera a semente de sorteamento utilizando `window.crypto.getRandomValues()` (computação de bytes físicos de segurança), blindando o algoritmo contra dados viciados ou padrões previsíveis.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-[9.5px] font-mono text-indigo-400">
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                        </span>
                        <span>API de Amostragem Criptográfica: {window.crypto ? "Ativa e Confiável" : "Emulação Ativa"}</span>
                      </div>
                    </div>

                    {/* Center slot machine / display */}
                    <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl relative min-h-[220px]">
                      
                      {!isExpressSpinning && !expressCelebrationWinner && (
                        <div className="space-y-4 animate-fadeIn">
                          <div className="p-4 bg-white/5 border border-white/5 rounded-2xl max-w-sm mx-auto animate-fadeIn">
                            <span className="text-[10px] font-mono tracking-wider text-slate-400 block uppercase">Cotas Elegíveis para o Sorteio</span>
                            <span className="text-3xl font-black text-white block mt-1 font-mono">
                              {(allReservations[selectedExpressCamp.id] || []).filter(t => t.status === "confirmed").length}
                            </span>
                            <span className="text-[9px] text-slate-500 block mt-1 leading-normal">
                              Bilhetes participantes (com status confirmados/pagos) de sua campanha. Sorteio aleatório em base de dados auditável.
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 leading-normal max-w-md mx-auto">
                            Ao pressionar o botão de início, o sorteador executará o algoritmo de deceleramento por slot, exibindo os participantes na tela e selecionando o vencedor.
                          </p>
                        </div>
                      )}

                      {isExpressSpinning && (
                        <div className="space-y-4 animate-pulse select-none">
                          <span className="text-[10px] font-mono tracking-wider text-amber-400 font-extrabold uppercase animate-bounce block">SORTEANDO - AGUARDE</span>
                          
                          <div className="p-5 bg-gradient-to-r from-amber-500/20 to-indigo-500/20 border border-indigo-500/30 rounded-2xl shadow-indigo-500/10 shadow-lg min-w-[280px]">
                            <span className="text-4xl font-extrabold font-mono tracking-tight text-white block scale-105 transition-transform duration-75">
                              {spinningTicket ? `#${spinningTicket.number}` : "#----"}
                            </span>
                            <span className="text-sm font-semibold tracking-wide text-indigo-200 block truncate mt-2 max-w-[240px] mx-auto">
                              {spinningTicket?.buyerName || "Buscando vencedor..."}
                            </span>
                          </div>

                          <p className="text-[9.5px] text-slate-400 font-mono tracking-normal">
                            Processando semente de segurança aleatória...
                          </p>
                        </div>
                      )}

                      {expressCelebrationWinner && (
                        <div className="space-y-5 animate-scaleUp select-none w-full">
                          <div className="flex flex-col items-center">
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 mb-2">
                              <Trophy className="w-8 h-8 text-amber-400 animate-bounce" />
                            </div>
                            <span className="text-xs font-black tracking-widest text-emerald-400 uppercase font-mono">🎉 PARABÉNS AO CONTEMPLADO! 🎉</span>
                          </div>

                          <div className="p-5 bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/40 rounded-3xl shadow-amber-500/10 shadow-2xl relative overflow-hidden max-w-md mx-auto">
                            {/* Decorative sparkles */}
                            <Sparkles className="absolute top-2 left-2 text-amber-500/30 w-5 h-5 animate-spin" />
                            <Sparkles className="absolute bottom-2 right-2 text-amber-500/30 w-5 h-5 animate-spin" />

                            <span className="text-4xl font-extrabold font-mono text-amber-400 block tracking-wider drop-shadow-md">
                              #{expressCelebrationWinner.ticket.number}
                            </span>
                            <h5 className="text-base font-bold text-slate-100 truncate mt-2.5 max-w-[280px] mx-auto uppercase leading-tight">
                              {expressCelebrationWinner.name}
                            </h5>
                            
                            <div className="grid grid-cols-2 gap-3 text-left border-t border-white/10 pt-3.5 mt-4 text-[10.5px] text-slate-300 font-medium font-sans">
                              <div>
                                <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider">Telefone Comprador:</span>
                                <span className="font-mono">{formatPhone(expressCelebrationWinner.ticket.buyerPhone)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider">Documento (CPF):</span>
                                <span className="font-mono">{expressCelebrationWinner.ticket.buyerCpf ? formatCPF(expressCelebrationWinner.ticket.buyerCpf) : "Não Informado"}</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 select-none max-w-sm mx-auto">
                            <a
                              href={`https://wa.me/55${expressCelebrationWinner.ticket.buyerPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full text-center flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-extrabold text-xs shadow-md shadow-emerald-950/20 transition cursor-pointer font-sans"
                            >
                              <span>Entrar em contato via WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Bottom CTA trigger button */}
                    {!expressCelebrationWinner && (
                      <button
                        type="button"
                        disabled={isExpressSpinning}
                        onClick={() => {
                          const ticketsList = allReservations[selectedExpressCamp.id] || [];
                          const confirmedTickets = ticketsList.filter(t => t.status === "confirmed");
                          const confirmedCount = confirmedTickets.length;
                          
                          if (confirmedCount === 0) {
                            alert("Não é possível realizar sorteio sem nenhuma cota confirmada (paga) na campanha.");
                            return;
                          }

                          if (window.confirm(`Deseja iniciar o sorteio agora? O ganhador será definido através do sistema anti-vício de alta entropia entre as ${confirmedCount} cotas vagas.`)) {
                            // Run the animation
                            setIsExpressSpinning(true);
                            setExpressCelebrationWinner(null);
                            setSpinningTicket(null);

                            // Collect recent winners across all other campaigns to prevent frequent repetition (anti-vicio module)
                            const recentWinnersList = campaigns
                              .filter(c => c.status === "drawn" && c.id !== selectedExpressCamp.id)
                              .map(c => {
                                const tList = allReservations[c.id] || [];
                                const winTicket = tList.find(t => t.number === c.winningNumber);
                                return winTicket;
                              })
                              .filter(Boolean); // Array of Ticket objects who won other campaigns

                            const recentWinnerPhones = new Set(recentWinnersList.map(t => t?.buyerPhone).filter(Boolean));
                            const recentWinnerCpfs = new Set(recentWinnersList.map(t => t?.buyerCpf).filter(Boolean));
                            const recentWinnerNames = new Set(recentWinnersList.map(t => t?.buyerName).filter(Boolean));

                            // Decide eligible pools of candidates
                            let eligiblePoolInput = [...confirmedTickets];

                            if (antiVicioActive) {
                              const nonWinnerPool = confirmedTickets.filter(t => {
                                const hasPhone = t.buyerPhone && recentWinnerPhones.has(t.buyerPhone);
                                const hasCpf = t.buyerCpf && recentWinnerCpfs.has(t.buyerCpf);
                                const hasName = t.buyerName && recentWinnerNames.has(t.buyerName);
                                return !(hasPhone || hasCpf || hasName);
                              });

                              // If we have at least 1 buyer who has NOT won recently, we strictly narrow the pool to them
                              // to prevent repetitive distribution. Otherwise, we gracefully fall back to the whole pool.
                              if (nonWinnerPool.length > 0) {
                                eligiblePoolInput = nonWinnerPool;
                              }
                            }

                            // Cryptographically secure secure pseudo-random number generator
                            const getSecureRandomIndex = (maxRange: number): number => {
                              if (window.crypto && window.crypto.getRandomValues) {
                                const array = new Uint32Array(1);
                                window.crypto.getRandomValues(array);
                                return array[0] % maxRange;
                              }
                              return Math.floor(Math.random() * maxRange);
                            };

                            const secureWinnerIndex = getSecureRandomIndex(eligiblePoolInput.length);
                            const realWinnerObj = eligiblePoolInput[secureWinnerIndex];

                            let currentIdx = 0;
                            const animLength = 22;
                            let delayTime = 50;

                            const performStep = () => {
                              // Display randomized elements during spin to match user expectation (high visual fidelity)
                              const randomPreviewIndex = getSecureRandomIndex(confirmedTickets.length);
                              const randomPreview = confirmedTickets[randomPreviewIndex];
                              setSpinningTicket(randomPreview);
                              currentIdx++;

                              if (currentIdx < animLength) {
                                delayTime += (currentIdx < 12 ? 8 : 45); // decelerates rapidly at the end
                                setTimeout(performStep, delayTime);
                              } else {
                                // animation completes
                                setSpinningTicket(realWinnerObj);
                                
                                const now = new Date();
                                const drawDateStr = now.toLocaleDateString("pt-BR");
                                const drawHourStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                                updateDoc(doc(db, "campaigns", selectedExpressCamp.id), {
                                  status: "drawn",
                                  winningNumber: realWinnerObj.number,
                                  drawDate: drawDateStr,
                                  drawHour: drawHourStr
                                }).then(() => {
                                  setIsExpressSpinning(false);
                                  setExpressCelebrationWinner({
                                    ticket: realWinnerObj,
                                    name: realWinnerObj.buyerName || "Cliente Desconhecido"
                                  });
                                }).catch((err) => {
                                  console.error("Firestore update error:", err);
                                  setIsExpressSpinning(false);
                                  alert("Erro ao gravar resultado no banco.");
                                });
                              }
                            };

                            setTimeout(performStep, delayTime);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2.5 py-4 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition cursor-pointer"
                      >
                        {isExpressSpinning ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white animate-fadeIn" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Girando Roleta...</span>
                          </>
                        ) : (
                          <>
                            <Trophy className="w-4.5 h-4.5 text-white animate-pulse" />
                            <span>SORTEAR GANHADOR AGORA 🔮</span>
                          </>
                        )}
                      </button>
                    )}

                    {expressCelebrationWinner && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpressCelebrationWinner(null);
                          setSpinningTicket(null);
                          setSelectedExpressCamp(null);
                        }}
                        className="w-full py-3 bg-white/10 hover:bg-white/15 text-slate-100 rounded-xl font-bold text-xs transition cursor-pointer font-sans"
                      >
                        Finalizar e Voltar para Lista
                      </button>
                    )}

                  </div>
                )}
              </div>

            </div>

            {/* LOWER SECTION: HISTORY OF COMPLETED EXPRESS DRAWS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs">
              <div>
                <h3 className="font-extrabold text-slate-850 text-sm flex items-center gap-2">
                  <Trophy className="w-4.5 h-4.5 text-indigo-600" />
                  Histórico de Sorteios Expressos Concluídos
                </h3>
                <p className="text-xs text-slate-400">
                  Todas as campanhas da modalidade expressas que já foram sorteadas são arquivadas abaixo para auditoria e controle.
                </p>
              </div>

              {(() => {
                const expressCompleteList = campaigns.filter(c => c.drawMode === "express" && c.status === "drawn");
                
                if (expressCompleteList.length === 0) {
                  return (
                    <p className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-2xl font-sans">
                      Nenhum sorteio expresso foi realizado ainda.
                    </p>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 font-sans">
                    {expressCompleteList.map((ca) => {
                      const tList = allReservations[ca.id] || [];
                      const winnersList = tList.filter(t => t.number === ca.winningNumber);
                      const winnerTicketObj = winnersList[0];

                      return (
                        <div key={ca.id} className="bg-slate-50 rounded-2xl border border-slate-150 p-5 space-y-4 shadow-xs relative">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-bold text-xs text-slate-800 line-clamp-1">{ca.title}</h4>
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-150 text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                              Sorteada
                            </span>
                          </div>

                          <div className="bg-white rounded-xl p-3 border border-slate-200 text-xs space-y-1.5 font-sans">
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Bilhete Contemplado:</span>
                              <strong className="font-mono text-indigo-700 font-extrabold">#{ca.winningNumber}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Data / Hora:</span>
                              <span className="text-slate-650 font-bold">{ca.drawDate || "----"} às {ca.drawHour || "----"}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5">
                              <span className="text-slate-400 font-medium">Ganhador:</span>
                              <strong className="text-slate-800 truncate max-w-[120px]">{winnerTicketObj?.buyerName || "Cliente"}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Telefone:</span>
                              <span className="font-mono text-slate-600 font-semibold">{winnerTicketObj?.buyerPhone ? formatPhone(winnerTicketObj.buyerPhone) : "----"}</span>
                            </div>
                          </div>

                          <div className="flex gap-2 text-xs pt-1">
                            {winnerTicketObj && (
                              <a
                                href={`https://wa.me/55${winnerTicketObj.buyerPhone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10.5px] shadow-xs transition"
                              >
                                <span>Contatar</span>
                              </a>
                            )}
                            <button
                              onClick={() => handleRevertDraw(ca)}
                              className="flex-1 text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold text-[10.5px] transition cursor-pointer"
                              title="Reverter Sorteio"
                            >
                              <X className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                              <span>Reverter</span>
                            </button>
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
      </div>

      {/* Edit Client Modal Overlay */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs select-none animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserIcon className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Editar Perfil do Cliente</h3>
                  <span className="text-[10px] text-indigo-300 block -mt-0.5 font-bold uppercase tracking-wide">ID: {editingClient.uid.slice(0, 8)}...</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-4 text-xs md:text-sm">
              {editClientError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium text-[11px] flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{editClientError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50"
                    placeholder="Nome completo do participante"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editClientEmail}
                    onChange={(e) => setEditClientEmail(e.target.value)}
                    className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50"
                    placeholder="E-mail de autenticação e contato"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">CPF</label>
                    <input
                      type="text"
                      maxLength={14}
                      value={editClientCpf}
                      onChange={(e) => setEditClientCpf(formatCPF(e.target.value))}
                      className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs bg-slate-50"
                      placeholder="000.000.000-00"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">WhatsApp/Celular</label>
                    <input
                      type="tel"
                      value={editClientPhone}
                      onChange={(e) => setEditClientPhone(formatPhone(e.target.value))}
                      className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs bg-slate-50"
                      placeholder="(00) 90000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Cidade / UF</label>
                    <input
                      type="text"
                      value={editClientCity}
                      onChange={(e) => setEditClientCity(e.target.value)}
                      className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50"
                      placeholder="Ex: Porto Alegre/RS"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Tipo de Membro</label>
                    <select
                      value={editClientRole}
                      onChange={(e) => setEditClientRole(e.target.value as "client" | "admin")}
                      className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50"
                    >
                      <option value="client">Cliente Comum (Apoiador)</option>
                      <option value="admin">Administrador Geral</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-3 justify-end text-xs">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="px-4.5 py-2.5 border border-slate-250 hover:bg-slate-100 rounded-xl font-bold text-slate-600 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveClientEdit}
                className="bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lançar Cotas Modal Overlay */}
      {showIssueTicketsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs select-none animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-emerald-700 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Lançar Cotas Manuais</h3>
                  <span className="text-[10px] text-emerald-200 block -mt-0.5 font-bold uppercase tracking-wide">Lançamento administrativo direto</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIssueTicketsModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-4 text-xs md:text-sm animate-fadeIn">
              {issueError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium text-[11px] flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{issueError}</span>
                </div>
              )}

              {issueSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium text-[11px] flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{issueSuccess}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* 1. Select Client */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">Cliente Beneficiário</label>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateClientName("");
                        setCreateClientCpf("");
                        setCreateClientPhone("");
                        setCreateClientCity("");
                        setCreateClientEmail("");
                        setCreateClientError("");
                        setCreateClientSuccess("");
                        setShowCreateClientModal(true);
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <span>+ Cadastrar Cliente</span>
                    </button>
                  </div>
                  <select
                    value={issueSelectedClient?.uid || ""}
                    onChange={(e) => {
                      const found = clients.find(cl => cl.uid === e.target.value);
                      if (found) {
                        setIssueSelectedClient(found);
                        setIssueSuccess(null);
                        setIssueError(null);
                      }
                    }}
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-bold text-slate-800"
                  >
                    <option value="" disabled>-- Selecione o Cliente --</option>
                    {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(cl => (
                      <option key={cl.uid} value={cl.uid}>
                        {cl.name} (CPF: {cl.cpf ? `${cl.cpf.slice(0,3)}.${cl.cpf.slice(3,6)}...` : "S/CPF"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Campaign/Rifa */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Rifa / Campanha Alvo</label>
                  <select
                    value={issueCampaignId}
                    onChange={(e) => {
                      setIssueCampaignId(e.target.value);
                      setIssueSuccess(null);
                      setIssueError(null);
                    }}
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-semibold text-slate-850"
                  >
                    <option value="" disabled>-- Selecione a Campanha --</option>
                    {campaigns.map(camp => (
                      <option key={camp.id} value={camp.id}>
                        {camp.title} ({camp.status === "active" ? "Ativa" : "Pausada"} - {camp.totalTickets} números)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Choose Issue Type */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">Método de Escolha das Cotas</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIssueNumbersType("specific");
                        setIssueSuccess(null);
                        setIssueError(null);
                      }}
                      className={`py-2 px-3 rounded-xl border font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        issueNumbersType === "specific"
                          ? "bg-slate-950 text-white border-slate-950"
                          : "bg-white text-slate-600 border-slate-250 hover:bg-slate-50"
                      }`}
                    >
                      Números Específicos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIssueNumbersType("random");
                        setIssueSuccess(null);
                        setIssueError(null);
                      }}
                      className={`py-2 px-3 rounded-xl border font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        issueNumbersType === "random"
                          ? "bg-slate-950 text-white border-slate-950"
                          : "bg-white text-slate-600 border-slate-250 hover:bg-slate-50"
                      }`}
                    >
                      Aleatório (Automático)
                    </button>
                  </div>
                </div>

                {/* 4. Inputs according to selection */}
                {issueNumbersType === "specific" ? (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Deseja lançar quais números?</label>
                    <input
                      type="text"
                      value={issueSpecificNumbers}
                      onChange={(e) => {
                        setIssueSpecificNumbers(e.target.value);
                        setIssueSuccess(null);
                        setIssueError(null);
                      }}
                      className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs bg-slate-50 text-slate-800 font-medium"
                      placeholder="Ex: 05, 12, 45, 99"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">Intercale os números desejados usando vírgulas. Todos serão formatados com o preencimento de zeros correspondente.</span>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Quantidade de Cotas Aleatórias</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={issueRandomCount}
                      onChange={(e) => {
                        setIssueRandomCount(Math.max(1, parseInt(e.target.value, 10) || 1));
                        setIssueSuccess(null);
                        setIssueError(null);
                      }}
                      className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs bg-slate-50 text-slate-800 font-medium"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">O sistema buscará as cotas atualmente livres e as reservará em instantes.</span>
                  </div>
                )}

                {/* 5. Choose Ticket status */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Situação / Status do Lançamento</label>
                  <select
                    value={issueStatus}
                    onChange={(e) => {
                      setIssueStatus(e.target.value as TicketStatus);
                      setIssueSuccess(null);
                      setIssueError(null);
                    }}
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-bold text-slate-800"
                  >
                    <option value="confirmed">Confirmado / Pago (Forte Recomendação)</option>
                    <option value="reserved">Reservado / Pendente</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-3 justify-end text-xs">
              <button
                type="button"
                onClick={() => setShowIssueTicketsModal(false)}
                className="px-4.5 py-2.5 border border-slate-250 hover:bg-slate-100 rounded-xl font-bold text-slate-600 transition"
              >
                Fechar / Voltar
              </button>
              <button
                type="button"
                onClick={handleSaveIssueTickets}
                disabled={issueLoading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-350 text-white font-extrabold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {issueLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Lançando...</span>
                  </>
                ) : (
                  <span>Salvar e Lançar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cadastrar Novo Cliente Modal Overlay */}
      {showCreateClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-xs select-none animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-indigo-700 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5 text-indigo-300" />
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">Cadastrar Novo Participante</h3>
                  <span className="text-[10px] text-indigo-200 block -mt-0.5 font-bold uppercase tracking-wide">Novo cadastro administrativo</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateClientModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-white text-sm font-extrabold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs md:text-sm">
              {createClientError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium text-[11px] flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{createClientError}</span>
                </div>
              )}

              {createClientSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium text-[11px] flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{createClientSuccess}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={createClientName}
                    onChange={(e) => {
                      setCreateClientName(e.target.value);
                      setCreateClientError("");
                      setCreateClientSuccess("");
                    }}
                    placeholder="Ex: João Silva Santos"
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-medium text-slate-800"
                  />
                </div>

                {/* CPF */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">CPF (Apenas números ou formatado)</label>
                  <input
                    type="text"
                    value={createClientCpf}
                    onChange={(e) => {
                      setCreateClientCpf(e.target.value);
                      setCreateClientError("");
                      setCreateClientSuccess("");
                    }}
                    placeholder="Ex: 123.456.789-00"
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-medium text-slate-800"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">WhatsApp / Celular (Com DDD)</label>
                  <input
                    type="text"
                    value={createClientPhone}
                    onChange={(e) => {
                      setCreateClientPhone(e.target.value);
                      setCreateClientError("");
                      setCreateClientSuccess("");
                    }}
                    placeholder="Ex: (51) 99999-9999"
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-medium text-slate-800"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Cidade / Estado</label>
                  <input
                    type="text"
                    value={createClientCity}
                    onChange={(e) => {
                      setCreateClientCity(e.target.value);
                      setCreateClientError("");
                      setCreateClientSuccess("");
                    }}
                    placeholder="Ex: Porto Alegre / RS"
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-medium text-slate-800"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">E-mail</label>
                  <input
                    type="email"
                    value={createClientEmail}
                    onChange={(e) => {
                      setCreateClientEmail(e.target.value);
                      setCreateClientError("");
                      setCreateClientSuccess("");
                    }}
                    placeholder="Ex: joao@email.com"
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-3 justify-end text-xs">
              <button
                type="button"
                onClick={() => setShowCreateClientModal(false)}
                className="px-4.5 py-2.5 border border-slate-250 hover:bg-slate-100 rounded-xl font-bold text-slate-600 transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCreateClient}
                disabled={createClientLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-350 text-white font-extrabold px-6 py-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {createClientLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Cadastro</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emitir Recibo Premium Modal Overlay */}
      {showReceiptModal && receiptCampaign && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full overflow-hidden flex flex-col md:flex-row my-8 max-h-[90vh]">
            
            {/* Left Column: Configuration Controls */}
            <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto border-r border-slate-100 space-y-6">
              <div>
                <span className="bg-indigo-100 text-indigo-805 text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full">
                  Painel de Emissão
                </span>
                <h3 className="text-xl font-black text-slate-800 mt-2">Personalizar Comprovante</h3>
                <p className="text-xs text-slate-400 mt-0.5">Defina as cores e detalhes do recibo de pagamento.</p>
              </div>

              <div className="space-y-4">
                {/* 1. Theme Picker */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2">Tema / Paleta de Cores</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "emerald", label: "Verde", color: "bg-emerald-600" },
                      { id: "indigo", label: "Azul/Roxo", color: "bg-indigo-600" },
                      { id: "amber", label: "Dourado", color: "bg-amber-500" },
                      { id: "slate", label: "Grafite", color: "bg-slate-700" }
                    ].map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setReceiptTheme(th.id as any)}
                        className={`p-2.5 border rounded-xl flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
                          receiptTheme === th.id
                            ? "border-slate-400 bg-slate-50 font-extrabold text-slate-800"
                            : "border-slate-150 hover:bg-slate-50 text-slate-500 text-xs font-semibold"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full ${th.color} shadow-xs`} />
                        <span className="text-[10px]">{th.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Receipt Status */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Status de Pagamento</label>
                  <select
                    value={receiptStatus}
                    onChange={(e) => setReceiptStatus(e.target.value as any)}
                    className="w-full px-3.5 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 font-bold text-slate-800"
                  >
                    <option value="confirmed">Pago & Confirmado</option>
                    <option value="reserved">Reservado / Aguardando PIX</option>
                  </select>
                </div>

                {/* 3. Buyer details preview / override */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150/60 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Dados do Cliente</span>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Nome</label>
                      <input
                        type="text"
                        value={receiptClientName}
                        onChange={(e) => setReceiptClientName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Telefone</label>
                      <input
                        type="text"
                        value={receiptClientPhone}
                        onChange={(e) => setReceiptClientPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-0.5">CPF</label>
                      <input
                        type="text"
                        value={receiptClientCpf}
                        onChange={(e) => setReceiptClientCpf(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 block mb-0.5">E-mail</label>
                      <input
                        type="text"
                        value={receiptClientEmail}
                        onChange={(e) => setReceiptClientEmail(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Message extra */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nota extra de agradecimento</label>
                  <textarea
                    rows={2}
                    value={receiptCustomNote}
                    onChange={(e) => setReceiptCustomNote(e.target.value)}
                    placeholder="Ex: Obrigado pela confiança e boa sorte!"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-xs bg-slate-50 text-slate-700"
                  />
                </div>
              </div>

              {/* Action output buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Imprimir ou Salvar PDF</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadReceiptImage("png")}
                    className="py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-2xl transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span>Baixar PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadReceiptImage("jpeg")}
                    className="py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-2xl transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span>Baixar JPEG</span>
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition text-xs cursor-pointer"
                >
                  Fechar Painel
                </button>
              </div>
            </div>

            {/* Right Column: Beautiful Live Preview */}
            <div className="w-full md:w-1/2 bg-slate-50 p-6 md:p-8 flex flex-col items-center justify-start overflow-y-auto max-h-[60vh] md:max-h-full py-8">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pré-visualização do voucher</span>
              
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-[360px] overflow-hidden border border-slate-150 flex flex-col relative select-none">
                
                {/* Header stripe based on theme */}
                <div className={`p-5 text-white ${
                  receiptTheme === "emerald" ? "bg-emerald-600" :
                  receiptTheme === "indigo" ? "bg-indigo-600" :
                  receiptTheme === "amber" ? "bg-amber-500" :
                  "bg-slate-700"
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] uppercase tracking-widest font-bold opacity-80">Comprovante Oficial</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                      receiptStatus === "confirmed" ? "bg-emerald-500/30 text-white" : "bg-red-500 text-white"
                    }`}>
                      {receiptStatus === "confirmed" ? "Pago" : "Pendente"}
                    </span>
                  </div>
                  <h4 className="text-base font-black tracking-wide uppercase mt-1">COMPROVANTE</h4>
                  <p className="text-[10px] opacity-90 font-mono mt-0.5">www.rifadochiquinho.com.br</p>
                </div>

                {/* Body details */}
                <div className="p-5 space-y-4 text-[11px] text-slate-600 flex-1">
                  
                  {/* Client summary */}
                  <div className="space-y-1 bg-slate-50/60 p-3 rounded-xl border border-dashed border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Comprador</span>
                    <div className="font-bold text-slate-800">{receiptClientName}</div>
                    {receiptClientPhone && <div className="text-slate-500 font-mono text-[10px]">{receiptClientPhone}</div>}
                    {receiptClientCpf && <div className="text-slate-400 font-mono text-[9px]">CPF: {receiptClientCpf}</div>}
                    {(() => {
                      const firstReservedAt = receiptTickets.find(t => t.reservedAt)?.reservedAt;
                      if (firstReservedAt) {
                        try {
                          const rStr = new Date(firstReservedAt).toLocaleString("pt-BR");
                          return <div className="text-slate-500 font-mono text-[9px] mt-1 pt-1 border-t border-slate-100">Reserva: {rStr}</div>;
                        } catch (e) {
                          return <div className="text-slate-500 font-mono text-[9px] mt-1 pt-1 border-t border-slate-100">Reserva: {firstReservedAt}</div>;
                        }
                      }
                      return null;
                    })()}
                  </div>

                  {/* Campaign summary */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Iniciativa / Rifa</span>
                    <p className="font-bold text-slate-800 line-clamp-1">{receiptCampaign.title}</p>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>{receiptTickets.length} cota(s)</span>
                      <span className="font-bold">
                        R$ {(() => {
                          try {
                            const isRcvVip = clients.some((cl) => {
                              if (!cl.isVip) return false;
                              const cleanClPhone = cl.phone?.replace(/\D/g, "");
                              const cleanRcvPhone = receiptClientPhone?.replace(/\D/g, "");
                              const phoneMatch = cleanClPhone && cleanRcvPhone && cleanClPhone === cleanRcvPhone;
                              const cpfMatch = cl.cpf && receiptClientCpf && cl.cpf.replace(/\D/g, "") === receiptClientCpf.replace(/\D/g, "");
                              const emailMatch = cl.email && receiptClientEmail && cl.email.trim().toLowerCase() === receiptClientEmail.trim().toLowerCase();
                              const uidMatch = receiptTickets.length > 0 && cl.uid === receiptTickets[0].buyerUid;
                              return phoneMatch || cpfMatch || emailMatch || uidMatch;
                            });
                            return getDiscountedPrice(
                              receiptTickets.length,
                              receiptCampaign.ticketPrice,
                              receiptCampaign.progressiveDiscounts,
                              isRcvVip,
                              settings.vipDiscountPercentage
                            ).totalPrice.toFixed(2);
                          } catch (e) {
                            return (receiptCampaign.ticketPrice * receiptTickets.length).toFixed(2);
                          }
                        })()}
                      </span>
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Ticket Numbers Slots */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Cotas Solicitadas</span>
                    <div className="flex flex-wrap gap-1">
                      {receiptTickets.map((tk) => (
                        <span
                          key={tk.id}
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            receiptTheme === "emerald" ? "bg-emerald-50 text-emerald-850 border-emerald-100" :
                            receiptTheme === "indigo" ? "bg-indigo-50 text-indigo-850 border-indigo-100" :
                            receiptTheme === "amber" ? "bg-amber-50 text-amber-850 border-amber-100" :
                            "bg-slate-50 text-slate-850 border-slate-100"
                          }`}
                        >
                          #{tk.number}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Message Card block */}
                  {receiptCustomNote && (
                    <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-150 text-[10px] italic text-slate-500 text-center">
                      "{receiptCustomNote}"
                    </div>
                  )}

                  <div className="text-[8px] text-slate-400 text-center mt-3 pt-2 border-t border-slate-100">
                    Obrigado pela sua participação! Guarde seu comprovante.
                  </div>
                </div>

                {/* Classic Voucher layout notch cuts */}
                <div className="absolute left-0 top-[60px] w-3 h-6 bg-slate-50 rounded-r-full border-y border-r border-slate-150 -ml-1.5" />
                <div className="absolute right-0 top-[60px] w-3 h-6 bg-slate-50 rounded-l-full border-y  border-l border-slate-150 -mr-1.5" />

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
