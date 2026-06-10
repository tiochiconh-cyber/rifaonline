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
