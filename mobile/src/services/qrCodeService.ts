/**
 * WuzzChat Mobile Pure TypeScript QR Code Generator
 * 
 * Standards:
 * - ISO/IEC 18004 QR Code specification
 * - Byte encoding mode (8-bit)
 * - Reed-Solomon error correction
 * - Generates clean 2D boolean matrix for zero-native-dependency React Native rendering
 */

// GF(256) Galois Field operations for Reed-Solomon Error Correction
const GF256_EXP: number[] = new Array(512);
const GF256_LOG: number[] = new Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) {
      x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF256_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCalculateEC(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecCount; i++) {
      res[i] ^= gfMul(gen[i], factor);
    }
  }
  return res;
}

// QR Code Version specs (Version 1 to 5, Error Correction Level M)
interface QRVersionSpec {
  version: number;
  size: number;
  totalBytes: number;
  dataBytes: number;
  ecBytes: number;
  alignPos?: number[];
}

const QR_SPECS: QRVersionSpec[] = [
  { version: 1, size: 21, totalBytes: 26, dataBytes: 16, ecBytes: 10 },
  { version: 2, size: 25, totalBytes: 44, dataBytes: 28, ecBytes: 16, alignPos: [6, 18] },
  { version: 3, size: 29, totalBytes: 70, dataBytes: 44, ecBytes: 26, alignPos: [6, 22] },
  { version: 4, size: 33, totalBytes: 100, dataBytes: 64, ecBytes: 36, alignPos: [6, 26] },
  { version: 5, size: 37, totalBytes: 134, dataBytes: 86, ecBytes: 48, alignPos: [6, 30] },
];

/**
 * Generate a 2D boolean matrix representing the QR Code.
 * @param text The input string to encode
 * @returns 2D array of booleans (true = dark module, false = light module)
 */
export function generateQRMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);

  // Pick smallest fitting version
  let spec = QR_SPECS[0];
  let found = false;
  for (const s of QR_SPECS) {
    // 4 bits mode + 8 bits length + data
    const needed = textBytes.length + 2;
    if (needed <= s.dataBytes) {
      spec = s;
      found = true;
      break;
    }
  }

  if (!found) {
    spec = QR_SPECS[QR_SPECS.length - 1];
  }

  // 1. Bitstream encoding: Byte mode (0100) + Character Count Indicator + Data
  const bits: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(4, 4);
  // Character count indicator (8 bits for V1-V9 in byte mode)
  const len = Math.min(textBytes.length, spec.dataBytes - 2);
  pushBits(len, 8);
  // Data bytes
  for (let i = 0; i < len; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const capacityBits = spec.dataBytes * 8;
  const padZeros = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < padZeros; i++) bits.push(0);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to data bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    dataBytes.push(b);
  }

  // Pad data words alternating 0xEC (236) and 0x11 (17)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < spec.dataBytes) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Calculate Error Correction Codewords
  const ecBytes = rsCalculateEC(dataBytes, spec.ecBytes);
  const finalCodewords = dataBytes.concat(ecBytes);

  // 2. Initialize Matrix and Function Patterns
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array(size).fill(null)
  );

  function fillFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          if (
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[mr][mc] = true;
          } else {
            matrix[mr][mc] = false;
          }
        }
      }
    }
  }

  // Place 3 Finder Patterns
  fillFinderPattern(0, 0);
  fillFinderPattern(0, size - 7);
  fillFinderPattern(size - 7, 0);

  // Alignment Pattern (if version >= 2)
  if (spec.alignPos && spec.alignPos.length > 0) {
    const positions: number[] = spec.alignPos;
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        const ar = positions[i];
        const ac = positions[j];
        if (matrix[ar][ac] === null) {
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const mr = ar + dr;
              const mc = ac + dc;
              if (
                Math.abs(dr) === 2 ||
                Math.abs(dc) === 2 ||
                (dr === 0 && dc === 0)
              ) {
                matrix[mr][mc] = true;
              } else {
                matrix[mr][mc] = false;
              }
            }
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[4 * spec.version + 9][8] = true;

  // Format info areas (Level M, Mask 0: 000 | 101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  let fIdx = 0;
  for (let c = 0; c <= 8; c++) {
    if (c !== 6) matrix[8][c] = formatBits[fIdx++] === 1;
  }
  for (let r = 7; r >= 0; r--) {
    if (r !== 6) matrix[r][8] = formatBits[fIdx++] === 1;
  }

  fIdx = 0;
  for (let r = size - 1; r >= size - 7; r--) {
    matrix[r][8] = formatBits[fIdx++] === 1;
  }
  for (let c = size - 8; c < size; c++) {
    matrix[8][c] = formatBits[fIdx++] === 1;
  }

  // 3. Place Data Codewords (zigzag traversal)
  const allDataBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      allDataBits.push((cw >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const colList = [right, right - 1];
    const rowList = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rowList) {
      for (const c of colList) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allDataBits.length ? allDataBits[bitIdx++] : 0;
          // Apply standard Mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? bit === 0 : bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // Convert to clean boolean matrix (fallback null to false)
  return matrix.map((row) => row.map((m) => Boolean(m)));
}
