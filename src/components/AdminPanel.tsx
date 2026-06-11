import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Ticket, UserProfile, TicketStatus } from "../types";
import { validateCPF, formatCPF, formatPhone, validatePhone, getCampaignDrawProjection } from "../utils/validation";
import RichTextEditor from "./RichTextEditor";
import { getDiscountedPrice } from "./ClientDashboard";
import DashboardOverview from "./DashboardOverview";
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
  Download
} from "lucide-react";

interface AdminPanelProps {
  onLogout: () => void;
}

export default function AdminPanel({ onLogout }: AdminPanelProps) {
  // Navigation tabs: metris, reservations, config, campaigns, winners, clients
  const [activeTab, setActiveTab] = useState<"metrics" | "reservations" | "config" | "campaigns" | "winners" | "clients" | "backup">("metrics");

  // Databases States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allReservations, setAllReservations] = useState<{ [campaignId: string]: Ticket[] }>({});

  // Global dynamically editable settings
  const [settings, setSettings] = useState({
    pixKey: "formaturapix@suaformatura.com",
    bankName: "Banco Central",
    receiverName: "Comissão de Formatura Integrada",
    expirationHours: 24,
    supportContact: "51999999999",
    rulesText: "Os bilhetes reservados têm prazo de validade. Caso a transferência via PIX não seja comprovada, a cota retornará à disponibilidade geral automaticamente."
  });

  const [groupReservationsByBuyer, setGroupReservationsByBuyer] = useState(false);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);

  // Filter / Search strings
  const [campaignSearch, setCampaignSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [reservationFilter, setReservationFilter] = useState<"all" | "reserved" | "confirmed">("all");

  // Modals / Forms controllers
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignDesc, setNewCampaignDesc] = useState("");
  const [newCampaignPrice, setNewCampaignPrice] = useState(10.0);
  const [newCampaignTotal, setNewCampaignTotal] = useState(100);
  const [newCampaignDrawDate, setNewCampaignDrawDate] = useState("");
  const [newCampaignDrawId, setNewCampaignDrawId] = useState("");
  const [newCampaignImage, setNewCampaignImage] = useState("");
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Progressive Discount options for Create Form
  const [newCampaignDiscounts, setNewCampaignDiscounts] = useState<{ minQuantity: number; discountPrice: number; discountPercentage?: number }[]>([]);
  const [newCampaignDiscountEnabled, setNewCampaignDiscountEnabled] = useState(false);

  // Edit Campaign State Controllers
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editCampaignTitle, setEditCampaignTitle] = useState("");
  const [editCampaignDesc, setEditCampaignDesc] = useState("");
  const [editCampaignPrice, setEditCampaignPrice] = useState(10.0);
  const [editCampaignTotal, setEditCampaignTotal] = useState(100);
  const [editCampaignDrawDate, setEditCampaignDrawDate] = useState("");
  const [editCampaignDrawId, setEditCampaignDrawId] = useState("");
  const [editCampaignImage, setEditCampaignImage] = useState("");
  const [editCampaignDiscounts, setEditCampaignDiscounts] = useState<{ minQuantity: number; discountPrice: number; discountPercentage?: number }[]>([]);
  const [editCampaignDiscountEnabled, setEditCampaignDiscountEnabled] = useState(false);
  const [editImageUploadLoading, setEditImageUploadLoading] = useState(false);
  const [editImageError, setEditImageError] = useState<string | null>(null);

  // States for Data Export and Backup
  const [selectedExportCampaign, setSelectedExportCampaign] = useState<string>("all");
  const [selectedExportStatus, setSelectedExportStatus] = useState<"all" | "confirmed" | "reserved">("all");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ step: string; current: number; total: number } | null>(null);

  // States for Ranking Clear Action
  const [rankingClearCampaignId, setRankingClearCampaignId] = useState<string>("all");
  const [isClearingRanking, setIsClearingRanking] = useState(false);
  const [clearRankingError, setClearRankingError] = useState<string | null>(null);
  const [clearRankingSuccess, setClearRankingSuccess] = useState<string | null>(null);

  // Client Management States
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editClientCpf, setEditClientCpf] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientCity, setEditClientCity] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientRole, setEditClientRole] = useState<"client" | "admin" | "">("client");
  const [editClientError, setEditClientError] = useState("");

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
    const baseHeight = 520; // header details, text notes, etc.
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
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("COMPROVANTE DE PARTICIPAÇÃO", 30, 50);
    
    ctx.font = "semibold 14px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText("SISTEMA DE COTAS E RIFAS", 30, 75);

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
    let calcPrice = { totalPrice: receiptCampaign.ticketPrice * ticketsCount, unitPrice: receiptCampaign.ticketPrice, appliedDiscount: false };
    try {
      calcPrice = getDiscountedPrice(
        ticketsCount,
        receiptCampaign.ticketPrice,
        receiptCampaign.progressiveDiscounts
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
          if (isNaN(numVal) || numVal < 0 || numVal >= totalTickets) {
            setIssueError(`O número "${p}" é inválido. Para esta rifa, os números devem ir de 0 a ${totalTickets - 1}.`);
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
        for (let i = 0; i < totalTickets; i++) {
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
    setEditCampaignDrawDate(camp.drawDate || "");
    setEditCampaignDrawId(camp.federalLotteryDrawId || "");
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
      createdAt: new Date().toISOString()
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
      setNewCampaignDrawDate("");
      setNewCampaignDrawId("");
      setNewCampaignImage("");
      setNewCampaignDiscounts([]);
      setNewCampaignDiscountEnabled(false);
      setShowCampaignForm(false);
    } catch (err) {
      console.error("Error creating campaign:", err);
      handleFirestoreError(err, OperationType.WRITE, `campaigns/${campaignId}`);
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
        federalLotteryDrawId: drawWinnerContestId.trim()
      });
      setDrawingCampaignId(null);
      setDrawWinnerCode("");
      setDrawWinnerDate("");
      setDrawWinnerContestId("");
    } catch (err) {
      console.error("Error drawing campaign:", err);
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${id}`);
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

      // Group filteredTickets by a key that represents the buyer
      const groups: { [key: string]: Ticket[] } = {};
      filteredTickets.forEach((t) => {
        const key = t.buyerPhone || t.buyerCpf || t.buyerEmail || t.buyerName || "Mapeado manualmente";
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(t);
      });

      Object.entries(groups).forEach(([buyerKey, tList]) => {
        const firstTicket = tList[0];
        const reservedCount = tList.filter((t) => t.status === "reserved").length;
        const confirmedCount = tList.filter((t) => t.status === "confirmed").length;

        list.push({
          campaign: ca,
          buyerName: firstTicket.buyerName || "Mapeado manualmente",
          buyerPhone: firstTicket.buyerPhone,
          buyerCpf: firstTicket.buyerCpf,
          buyerEmail: firstTicket.buyerEmail,
          buyerUid: firstTicket.buyerUid,
          tickets: tList,
          statusSummary: {
            reservedCount,
            confirmedCount,
          },
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

  const filteredClients = clients.filter((cl) =>
    cl.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    cl.cpf.includes(clientSearch) ||
    cl.email.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Admin header */}
      <header className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1.5 flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded-2xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Painel Administrativo da Formatura</h1>
            <p className="text-slate-400 text-xs">Arrecadação de Fundos & Gestão de Bilhetes</p>
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
        <div className="flex bg-slate-100 rounded-2xl p-1.5 gap-1.5 min-w-[700px] md:min-w-0">
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
            onClick={() => setActiveTab("clients")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[11px] tracking-wide uppercase transition cursor-pointer ${
              activeTab === "clients" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Clientes ({clients.length})
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
          />
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
                      const batchId = `${batch.campaign.id}_${batch.buyerPhone || batch.buyerEmail || batch.buyerName}`;
                      const reservedTickets = batch.tickets.filter((t) => t.status === "reserved");
                      const reservedIds = reservedTickets.map((t) => t.id);
                      const allIds = batch.tickets.map((t) => t.id);
                      const isCurrentlyLoading = batchLoading === batchId;

                      const calcPrice = getDiscountedPrice(
                        batch.tickets.length,
                        batch.campaign.ticketPrice,
                        batch.campaign.progressiveDiscounts
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
                    const batchId = `${batch.campaign.id}_${batch.buyerPhone || batch.buyerEmail || batch.buyerName}`;
                    const reservedTickets = batch.tickets.filter((t) => t.status === "reserved");
                    const reservedIds = reservedTickets.map((t) => t.id);
                    const allIds = batch.tickets.map((t) => t.id);
                    const isCurrentlyLoading = batchLoading === batchId;
                    
                    const cleanPhone = batch.buyerPhone ? batch.buyerPhone.replace(/\D/g, "") : "";
                    const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : "";

                    const calcPrice = getDiscountedPrice(
                      batch.tickets.length,
                      batch.campaign.ticketPrice,
                      batch.campaign.progressiveDiscounts
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
                <label className="block font-bold text-slate-700">Chave PIX Oficial da Formatura</label>
                <input
                  type="text"
                  required
                  value={settings.pixKey}
                  onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
                  className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="Ex: formaturapix@suaformatura.com ou celular ou CNPJ"
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
                  placeholder="Ex: Comissão de Formatura Estácio de Sá 2026"
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
                <p className="text-xs text-slate-400">Aqui você cria e pausa as campanhas ativas de arrecadação da formatura.</p>
              </div>
              <button
                onClick={() => setShowCampaignForm(!showCampaignForm)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition cursor-pointer self-start sm:self-center shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nova Campanha
              </button>
            </div>

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

                <div className="md:col-span-2 space-y-1.5">
                  <label className="block font-semibold text-slate-600">Descrição / Prêmios</label>
                  <RichTextEditor
                    value={newCampaignDesc}
                    onChange={setNewCampaignDesc}
                    placeholder="Detalhes do prêmio principal, marcas, modelos, cotas premiadas e regras específicas da rifa."
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Quantidade de Números (Total de Ingressos)</label>
                  <select
                    value={newCampaignTotal}
                    onChange={(e) => setNewCampaignTotal(Number(e.target.value))}
                    className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value={10}>10 bilhetes (00-09)</option>
                    <option value={100}>100 bilhetes (00-99)</option>
                    <option value={1000}>1000 bilhetes (000-999)</option>
                    <option value={10000}>10000 bilhetes (0000-9999)</option>
                  </select>
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
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sorteio Federal</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((ca) => {
                    const tRegistered = allReservations[ca.id] || [];
                    const tConfirmed = tRegistered.filter(r => r.status === "confirmed").length;

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
                            {ca.status !== "drawn" && (
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

                                <button
                                  onClick={() => handleOpenDrawingModal(ca)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-100 rounded transition cursor-pointer"
                                  title="Definir Ganhador (Loteria Federal)"
                                >
                                  <Trophy className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => handleStartEditCampaign(ca)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-55 rounded transition cursor-pointer"
                                  title="Editar Campanha"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              </>
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

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {ca.status !== "drawn" && (
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

                          <button
                            onClick={() => handleOpenDrawingModal(ca)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200/50 hover:bg-indigo-100 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            <Trophy className="w-3.5 h-3.5 text-indigo-650" />
                            <span>Sorteio</span>
                          </button>

                          <button
                            onClick={() => handleStartEditCampaign(ca)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 text-indigo-750 border border-slate-200 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        </>
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

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Data do Sorteio</label>
                        <input
                          type="date"
                          value={drawWinnerDate}
                          onChange={(e) => setDrawWinnerDate(e.target.value)}
                          className="w-full py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Nº Concurso</label>
                        <input
                          type="text"
                          value={drawWinnerContestId}
                          onChange={(e) => setDrawWinnerContestId(e.target.value)}
                          className="w-full py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium"
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

                    <div className="md:col-span-2 space-y-1.5 font-sans">
                      <label className="block font-semibold text-slate-600">Descrição / Prêmios</label>
                      <RichTextEditor
                        value={editCampaignDesc}
                        onChange={setEditCampaignDesc}
                        placeholder="Detalhes do prêmio principal, marcas, modelos, cotas premiadas e regras específicas da rifa."
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Quantidade de Números (Total de Ingressos)</label>
                      <select
                        value={editCampaignTotal}
                        onChange={(e) => setEditCampaignTotal(Number(e.target.value))}
                        className="w-full bg-white p-2.5 border border-slate-300 rounded-lg text-xs"
                      >
                        <option value={10}>10 bilhetes (00-09)</option>
                        <option value={100}>100 bilhetes (00-99)</option>
                        <option value={1000}>1000 bilhetes (000-999)</option>
                        <option value={10000}>10000 bilhetes (0000-9999)</option>
                      </select>
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

                        {winnerTicket && (
                          <div className="pt-1 select-none">
                            <a
                              href={`https://wa.me/55${winnerTicket.buyerPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full text-center flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
                            >
                              <span>Entrar em contato para entregar prêmio</span>
                            </a>
                          </div>
                        )}
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

            <div className="relative max-w-md text-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar clientes por nome, CPF ou E-mail..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full bg-slate-50"
              />
            </div>

            <div className="hidden md:block overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Nome completo / E-mail</th>
                    <th className="py-3 px-4">CPF (Validador)</th>
                    <th className="py-3 px-4">Endereço (Cidade/UF)</th>
                    <th className="py-3 px-4">Celular (WhatsApp)</th>
                    <th className="py-3 px-4">Cadastro Data</th>
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
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">{cl.email}</div>
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
                          </h4>
                          <span className="text-[10px] text-slate-400 block">{cl.email}</span>
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
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditClient(cl)}
                          className="flex items-center justify-center gap-1.5 px-2.5 py-2 hover:bg-slate-100 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 shadow-xs transition"
                        >
                          <Edit className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBlockClient(cl)}
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl font-bold transition shadow-xs ${
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
                          className="flex items-center justify-center gap-1.5 px-2.5 py-2 hover:bg-rose-50 text-rose-700 bg-white border border-rose-100 shadow-xs rounded-xl font-bold transition"
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
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">E-mail (Inalterável)</label>
                  <input
                    type="email"
                    value={editClientEmail}
                    disabled
                    className="w-full px-3.5 py-4 border border-slate-200 rounded-2xl font-mono text-xs bg-slate-105 text-slate-400 cursor-not-allowed"
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
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Cliente Beneficiário</label>
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
                  <h4 className="text-sm font-black tracking-wide uppercase mt-1">Sorteio de Cotas</h4>
                  <p className="text-[10px] opacity-75 font-mono mt-1">CÓD VERIFICAÇÃO: EXPROV</p>
                </div>

                {/* Body details */}
                <div className="p-5 space-y-4 text-[11px] text-slate-600 flex-1">
                  
                  {/* Client summary */}
                  <div className="space-y-1 bg-slate-50/60 p-3 rounded-xl border border-dashed border-slate-200">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Comprador</span>
                    <div className="font-bold text-slate-800">{receiptClientName}</div>
                    {receiptClientPhone && <div className="text-slate-500 font-mono text-[10px]">{receiptClientPhone}</div>}
                    {receiptClientCpf && <div className="text-slate-400 font-mono text-[9px]">CPF: {receiptClientCpf}</div>}
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
                            return getDiscountedPrice(
                              receiptTickets.length,
                              receiptCampaign.ticketPrice,
                              receiptCampaign.progressiveDiscounts
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
