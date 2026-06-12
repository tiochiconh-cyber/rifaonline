export type UserRole = "client" | "admin";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  cpf: string;
  city: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  isBlocked?: boolean;
}

export type CampaignStatus = "active" | "paused" | "drawn";

export interface Campaign {
  id: string;
  title: string;
  description: string;
  ticketPrice: number;
  totalTickets: number; // e.g. 100 or 1000
  imageUrl?: string;
  status: CampaignStatus;
  drawDate?: string;
  federalLotteryDrawId?: string;
  winningNumber?: string;
  federalLotteryNumber?: string;
  prizeExpenses?: number; // Cost/expenses spent on the prizes of this campaign
  createdAt: string;
  progressiveDiscounts?: { minQuantity: number; discountPrice: number; discountPercentage?: number }[];
}

export type TicketStatus = "available" | "reserved" | "confirmed";

export interface Ticket {
  id: string; // padding aligned: e.g. "00" through "99", or "000" through "999"
  number: string;
  status: TicketStatus;
  buyerUid?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerCpf?: string;
  buyerEmail?: string;
  reservedAt?: string;
  confirmedAt?: string;
}

export interface AdminConfig {
  uid: string;
  totpSecret: string;
  totpEnabled: boolean;
}

export interface GlobalSettings {
  pixKey: string;
  bankName: string;
  receiverName: string;
  expirationHours: number;
  supportContact: string;
  rulesText: string;
  backgroundAudioUrl?: string;
}
