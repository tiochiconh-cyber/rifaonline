/**
 * spec-compliant client-side TOTP (RFC 6238) validator.
 * Uses native browser Web Crypto API with high-performance pure-JS SHA-1 / HMAC fallback.
 */

// Pure-JS SHA-1 Implementation
function sha1(buffer: Uint8Array): Uint8Array {
  const words = new Uint32Array(80);
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);

  // Pre-processing
  const n = buffer.length;
  const padLen = ((n + 8) >> 6) + 1;
  const message = new Uint8Array(padLen << 6);
  message.set(buffer);
  message[n] = 0x80;
  
  // Append length in bits as 64-bit big-endian
  const totalBits = n * 8;
  message[message.length - 4] = (totalBits >>> 24) & 0xff;
  message[message.length - 3] = (totalBits >>> 16) & 0xff;
  message[message.length - 2] = (totalBits >>> 8) & 0xff;
  message[message.length - 1] = totalBits & 0xff;

  const dataView = new DataView(message.buffer);

  for (let i = 0; i < message.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      words[j] = dataView.getUint32(i + j * 4);
    }
    for (let j = 16; j < 80; j++) {
      const val = words[j - 3] ^ words[j - 8] ^ words[j - 14] ^ words[j - 16];
      words[j] = (val << 1) | (val >>> 31);
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];

    for (let j = 0; j < 80; j++) {
      let f = 0;
      let k = 0;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + words[j]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }

  const result = new Uint8Array(20);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h[0]);
  resultView.setUint32(4, h[1]);
  resultView.setUint32(8, h[2]);
  resultView.setUint32(12, h[3]);
  resultView.setUint32(16, h[4]);
  return result;
}

// Pure-JS HMAC-SHA-1 Implementation
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  let keyBlock = key;
  if (key.length > 64) {
    keyBlock = sha1(key);
  }
  const paddedKey = new Uint8Array(64);
  paddedKey.set(keyBlock);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const innerMessage = new Uint8Array(64 + message.length);
  innerMessage.set(iKeyPad);
  innerMessage.set(message, 64);
  const innerHash = sha1(innerMessage);

  const outerMessage = new Uint8Array(64 + innerHash.length);
  outerMessage.set(oKeyPad);
  outerMessage.set(innerHash, 64);
  return sha1(outerMessage);
}

// Decodes a Base32 string to a Uint8Array
export function base32ToBuf(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanStr = base32.toUpperCase().replace(/=+$/, "");
  const len = cleanStr.length;
  const buf = new Uint8Array(Math.floor((len * 5) / 8));
  
  let view = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < len; i++) {
    const val = alphabet.indexOf(cleanStr[i]);
    if (val === -1) continue; // Skip invalid chars

    view = ((view << 5) | val) & 0xffffffff;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      buf[index++] = (view >>> bits) & 0xff;
    }
  }

  return buf;
}

// Generate the HOTP code for a secret key byte array and a number count
export async function getHOTP(keyBytes: Uint8Array, counter: number): Promise<string> {
  // Convert counter to 8-byte big-endian buffer
  const counterBuf = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  let signatureBytes: Uint8Array;

  // Import key into Web Crypto API if available
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    try {
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: { name: "SHA-1" } },
        false,
        ["sign"]
      );
      const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, counterBuf);
      signatureBytes = new Uint8Array(signature);
    } catch (e) {
      console.warn("Native subtle crypto failed, falling back to pure-JS HMAC-SHA1:", e);
      signatureBytes = hmacSha1(keyBytes, counterBuf);
    }
  } else {
    signatureBytes = hmacSha1(keyBytes, counterBuf);
  }

  // Dynamic truncation
  const offset = signatureBytes[signatureBytes.length - 1] & 0xf;
  const binary =
    ((signatureBytes[offset] & 0x7f) << 24) |
    ((signatureBytes[offset + 1] & 0xff) << 16) |
    ((signatureBytes[offset + 2] & 0xff) << 8) |
    (signatureBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

// Generate current standard 30-sec interval counter TOTP
export async function generateTOTP(secret: string): Promise<string> {
  const keyBytes = base32ToBuf(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  return getHOTP(keyBytes, counter);
}

// Validate a user-provided 6-digit TOTP code against a secret
// Allows an expanded drift window of +/- 6 steps (3 minutes) of 30 seconds for clock offset correction
export async function verifyTOTP(secret: string, userCode: string): Promise<boolean> {
  const keyBytes = base32ToBuf(secret);
  const baseCounter = Math.floor(Date.now() / 1000 / 30);

  const trimmedCode = userCode.trim();
  if (trimmedCode.length !== 6 || isNaN(Number(trimmedCode))) {
    return false;
  }

  // Check counter with robust drift window to ensure reliability on active clocks
  for (let drift = -6; drift <= 6; drift++) {
    const code = await getHOTP(keyBytes, baseCounter + drift);
    if (code === trimmedCode) {
      return true;
    }
  }

  return false;
}

// Generates a random standard 16-character base32 secret
export function generateRandomSecret(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < 16; i++) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    secret += alphabet[randomIndex];
  }
  return secret;
}

