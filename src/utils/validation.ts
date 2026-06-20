import { Campaign, Ticket } from "../types";

/**
 * Brazilian CPF validation and formatting helper functions.
 */

export function validateCPF(cpfRaw: string): boolean {
  // Remove formatting characters
  const cpf = cpfRaw.replace(/[^\d]+/g, "");

  if (cpf.length !== 11) return false;

  // Reject standard invalid CPFs
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Validate first digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;

  // Validate second digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;

  return true;
}

export function formatCPF(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function maskWinnerName(value: string): string {
  if (!value) return "";
  const parts = value.trim().split(/\s+/);
  if (parts.length <= 1) {
    const first = parts[0];
    if (first.length <= 3) return first + "*";
    return first.slice(0, 3) + "*".repeat(first.length - 3);
  }
  const firstName = parts[0];
  const maskedRest = parts.slice(1).map((part) => "*".repeat(part.length)).join(" ");
  return `${firstName} ${maskedRest}`;
}

export function maskPhoneNumber(value: string): string {
  if (!value) return "";
  const clean = value.replace(/\D/g, "");
  let ddd = "";
  if (clean.length >= 10) {
    if (clean.startsWith("55") && clean.length >= 12) {
      ddd = clean.slice(2, 4);
    } else {
      ddd = clean.slice(0, 2);
    }
  } else {
    ddd = clean.slice(0, 2);
  }
  if (!ddd || ddd.length < 2) ddd = "XX";
  return `(${ddd}) *****-****`;
}

export function formatPhone(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
}

export function validatePhone(phoneRaw: string): boolean {
  const clean = phoneRaw.replace(/\D/g, "");
  
  // A valid Brazilian mobile number/WhatsApp has exactly 11 digits: (DD) 9XXXX-XXXX
  if (clean.length !== 11) return false;
  
  // Reject simple repeated numbers like "11111111111"
  if (/^(\d)\1{10}$/.test(clean)) return false;
  
  // Verify DDD (first two digits) against official ANATEL DDD list
  const validDDDs = [
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ];
  const ddd = parseInt(clean.substring(0, 2));
  if (!validDDDs.includes(ddd)) return false;

  // The 3rd digit (first digit of the number itself) must be '9' for cell/whatsapp numbers in Brazil
  if (clean.charAt(2) !== "9") return false;

  return true;
}

/**
 * Checks if ticket sales are suspended due to the Federal Lottery draw.
 * Drawings happen on Wednesdays and Saturdays at 19:00 Brasilia Time.
 * Sales must be suspended between 18:45 and 21:00 Brasilia Time on these days.
 */
export function isLotterySalesSuspended(salesSuspensionBlocked?: boolean): { suspended: boolean; reason?: string } {
  if (salesSuspensionBlocked) {
    return { suspended: false };
  }

  // Get current date/time on UTC and apply Brasilia Time offset (UTC-3)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brTime = new Date(utc - (3 * 3600000));

  const day = brTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 3 = Wednesday, ..., 6 = Saturday
  const hours = brTime.getHours();
  const minutes = brTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (day === 3 || day === 6) {
    const startMinutes = 18 * 60 + 45; // 18:45 -> 1125
    const endMinutes = 21 * 60;        // 21:00 -> 1260

    if (totalMinutes >= startMinutes && totalMinutes < endMinutes) {
      return {
        suspended: true,
        reason: `Vendas suspensas temporariamente das 18:45 às 21:00 devido ao sorteio da Loteria Federal de hoje (${day === 3 ? "quarta-feira" : "sábado"}).`
      };
    }
  }

  return { suspended: false };
}

export interface DrawProjection {
  currentProgressPercent: number;
  totalSoldTickets: number;
  elapsedDays: number;
  salesVelocity: number;
  daysRemainingEst: number;
  probableDrawDateBr: Date;
  formattedProbableDrawDate: string;
  confidenceRating: "low" | "medium" | "high";
  hasEnoughData: boolean;
}

/**
 * Calculates the probable draw date based on sales flow/velocity.
 * Federal lottery drawings always happen on Wednesdays and Saturdays at 19:00 Brasilia Time (UTC-3).
 */
export function getCampaignDrawProjection(campaign: Campaign, campaignTickets: Ticket[]): DrawProjection {
  const total = campaign.totalTickets || 100;
  
  // count both reserved and confirmed as sales flow
  const soldCount = campaignTickets.filter(t => t.status === "confirmed" || t.status === "reserved").length;
  const currentProgressPercent = total > 0 ? parseFloat(((soldCount / total) * 100).toFixed(1)) : 0;

  // calculate elapsed days since creation
  const createdDate = campaign.createdAt ? new Date(campaign.createdAt) : new Date(Date.now() - 3 * 24 * 3600000);
  const diffTime = Math.abs(Date.now() - createdDate.getTime());
  // Ensure a minimum of 0.5 days (12 hours) so early sales don't trigger massive velocity spikes
  const elapsedDays = Math.max(0.5, diffTime / (24 * 60 * 60 * 1000));
  
  // Velocity = tickets sold per day
  const salesVelocity = parseFloat((soldCount / elapsedDays).toFixed(2));

  let daysRemainingEst = 0;
  const hasEnoughData = soldCount >= 3; // At least 3 sold tickets to provide a somewhat stable rating
  
  if (soldCount === 0) {
    // Speculative: if zero tickets sold, we estimate custom baseline (e.g. 1.5 tickets per day)
    daysRemainingEst = total / 1.5;
  } else {
    const remaining = Math.max(0, total - soldCount);
    const computedVelocity = salesVelocity > 0 ? salesVelocity : 0.2; 
    daysRemainingEst = Math.min(365, remaining / computedVelocity);
  }

  // Target date for completing sales
  const targetCompletedDate = new Date(Date.now() + daysRemainingEst * 24 * 60 * 60 * 1000);

  // Find subsequent Wednesday (3) or Saturday (6) at 19:00 Brasilia Time (UTC-3)
  const targetCompletedUtc = targetCompletedDate.getTime() + (targetCompletedDate.getTimezoneOffset() * 60000);
  const brTarget = new Date(targetCompletedUtc - (3 * 3600000));

  let drawBr = new Date(brTarget);
  drawBr.setMinutes(0);
  drawBr.setSeconds(0);
  drawBr.setMilliseconds(0);

  let iterations = 0;
  while (iterations < 100) {
    const day = drawBr.getDay(); // 0 = Sun, 1 = Mon, ..., 3 = Wed, 6 = Sat
    if (day === 3 || day === 6) {
      const isSameDay = drawBr.toDateString() === brTarget.toDateString();
      if (isSameDay) {
        if (brTarget.getHours() < 19) {
          drawBr.setHours(19, 0, 0, 0);
          break;
        } else {
          drawBr.setDate(drawBr.getDate() + 1);
          continue;
        }
      } else {
        drawBr.setHours(19, 0, 0, 0);
        break;
      }
    }
    drawBr.setDate(drawBr.getDate() + 1);
    iterations++;
  }

  // Confidence based on sales percentage & sample size
  let confidenceRating: "low" | "medium" | "high" = "low";
  if (soldCount >= total * 0.4 && soldCount >= 10) {
    confidenceRating = "high";
  } else if (soldCount >= total * 0.15 && soldCount >= 4) {
    confidenceRating = "medium";
  }

  const weekdayNamesBr = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const formattedDayOfWeek = weekdayNamesBr[drawBr.getDay()] || "";
  
  const dStr = String(drawBr.getDate()).padStart(2, "0");
  const mStr = String(drawBr.getMonth() + 1).padStart(2, "0");
  const yStr = drawBr.getFullYear();
  const formattedProbableDrawDate = `${formattedDayOfWeek}, ${dStr}/${mStr}/${yStr} às 19:00h`;

  return {
    currentProgressPercent,
    totalSoldTickets: soldCount,
    elapsedDays: parseFloat(elapsedDays.toFixed(1)),
    salesVelocity,
    daysRemainingEst: Math.round(daysRemainingEst),
    probableDrawDateBr: drawBr,
    formattedProbableDrawDate,
    confidenceRating,
    hasEnoughData
  };
}

/**
 * Splits a list of tickets into separate batches depending on their batchId or reservation timestamp window.
 */
export function splitTicketsIntoBatches(tickets: Ticket[]): Ticket[][] {
  const batchesMap: { [batchId: string]: Ticket[] } = {};
  const noBatchTickets: Ticket[] = [];

  tickets.forEach((t) => {
    if (t.batchId) {
      if (!batchesMap[t.batchId]) {
        batchesMap[t.batchId] = [];
      }
      batchesMap[t.batchId].push(t);
    } else {
      noBatchTickets.push(t);
    }
  });

  const finalBatches: Ticket[][] = Object.values(batchesMap);

  if (noBatchTickets.length > 0) {
    // Sort by reservedAt
    noBatchTickets.sort((a, b) => {
      const aTime = a.reservedAt ? new Date(a.reservedAt).getTime() : 0;
      const bTime = b.reservedAt ? new Date(b.reservedAt).getTime() : 0;
      return aTime - bTime;
    });

    let currentBatch: Ticket[] = [];
    let lastTime = 0;

    noBatchTickets.forEach((t) => {
      const tTime = t.reservedAt ? new Date(t.reservedAt).getTime() : 0;
      // If within 5 seconds of the previous one, group into same batch
      if (currentBatch.length === 0 || Math.abs(tTime - lastTime) < 5000) {
        currentBatch.push(t);
      } else {
        finalBatches.push(currentBatch);
        currentBatch = [t];
      }
      lastTime = tTime;
    });

    if (currentBatch.length > 0) {
      finalBatches.push(currentBatch);
    }
  }

  // Sort batches so newer ones appear first (highest timestamp)
  return finalBatches.sort((a, b) => {
    const aMax = a.reduce((max, t) => {
      const time = t.reservedAt ? new Date(t.reservedAt).getTime() : 0;
      return time > max ? time : max;
    }, 0);
    const bMax = b.reduce((max, t) => {
      const time = t.reservedAt ? new Date(t.reservedAt).getTime() : 0;
      return time > max ? time : max;
    }, 0);
    return bMax - aMax;
  });
}


