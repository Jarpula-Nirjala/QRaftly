/**
 * Arithmetic in GF(2^8), the finite field QR codes use for error correction: 256 elements, addition is XOR,
 * multiplication is defined modulo the primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), and 2 (α)
 * generates every non-zero element. Products go through log/antilog tables built once.
 */
const PRIMITIVE = 0x11d;

export const EXP = new Uint8Array(512);
export const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE;
  }
  // Doubling the table lets mul() skip a modulo.
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

export function div(a: number, b: number): number {
  if (b === 0) throw new RangeError('Division by zero in GF(256)');
  return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255];
}

/** α^n for any integer n (negative powers included). */
export function pow2(n: number): number {
  return EXP[((n % 255) + 255) % 255];
}
