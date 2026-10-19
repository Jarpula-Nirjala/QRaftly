import { div, mul, pow2 } from './gf.ts';

/**
 * Reed–Solomon codes over GF(256) as QR codes use them: the generator polynomial has roots α^0 … α^(n-1),
 * codewords are written highest-degree coefficient first.
 */

/** Coefficients of the generator ∏(x − α^i), highest degree first, without the leading 1. */
export function generator(degree: number): number[] {
  if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1; // starts as the polynomial 1
  let root = 1;
  for (let i = 0; i < degree; i++) {
    // Multiply the current product by (x − root), i.e. (x + root) in GF(2^8).
    for (let j = 0; j < result.length; j++) {
      result[j] = mul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = mul(root, 0x02);
  }
  return result;
}

/** The error-correction codewords for `data`: the remainder of data·x^n divided by the generator. */
export function remainder(data: ArrayLike<number>, gen: number[]): number[] {
  const result = new Array<number>(gen.length).fill(0);
  for (let k = 0; k < data.length; k++) {
    const factor = data[k] ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < gen.length; i++) result[i] ^= mul(gen[i], factor);
  }
  return result;
}

/** Evaluates a polynomial stored lowest-degree first. */
function evalLow(poly: number[], x: number): number {
  let y = 0;
  for (let i = poly.length - 1; i >= 0; i--) y = mul(y, x) ^ poly[i];
  return y;
}

export interface RsResult {
  /** The corrected codeword (data followed by error-correction codewords). */
  codeword: number[];
  /** How many codewords were wrong and have been fixed. */
  corrected: number;
}

/**
 * Corrects up to ⌊n/2⌋ wrong codewords in a received block, where n is the number of error-correction
 * codewords: syndromes, Berlekamp–Massey for the error locator, Chien search for the positions and Forney's
 * formula for the values. Throws when there are more errors than the code can repair.
 */
export function decode(received: ArrayLike<number>, eccLen: number): RsResult {
  const c = Array.from(received);
  const n = c.length;
  // Syndromes S_j = c(α^j), j = 0 … eccLen-1.
  const syn = new Array<number>(eccLen);
  let clean = true;
  for (let j = 0; j < eccLen; j++) {
    const x = pow2(j);
    let y = 0;
    for (let i = 0; i < n; i++) y = mul(y, x) ^ c[i];
    syn[j] = y;
    if (y) clean = false;
  }
  if (clean) return { codeword: c, corrected: 0 };

  // Berlekamp–Massey: the shortest LFSR (error locator Λ, lowest degree first) generating the syndromes.
  let lambda = [1];
  let prev = [1];
  let errors = 0;
  let shift = 1;
  let prevDiscrepancy = 1;
  for (let k = 0; k < eccLen; k++) {
    let d = syn[k];
    for (let i = 1; i <= errors; i++) d ^= mul(lambda[i] ?? 0, syn[k - i]);
    if (d === 0) {
      shift++;
      continue;
    }
    const coef = div(d, prevDiscrepancy);
    const next = lambda.slice();
    for (let i = 0; i < prev.length; i++) {
      while (next.length <= i + shift) next.push(0);
      next[i + shift] ^= mul(coef, prev[i]);
    }
    if (2 * errors <= k) {
      prev = lambda;
      errors = k + 1 - errors;
      prevDiscrepancy = d;
      shift = 1;
    } else shift++;
    lambda = next;
  }
  while (lambda.length > 1 && lambda[lambda.length - 1] === 0) lambda.pop();
  if (errors * 2 > eccLen || lambda.length - 1 !== errors) throw new Error('Too many errors to correct');

  // Chien search: position p (power of x, counted from the end) is wrong when Λ(α^-p) = 0.
  const positions: number[] = [];
  for (let p = 0; p < n; p++) if (evalLow(lambda, pow2(-p)) === 0) positions.push(p);
  if (positions.length !== errors) throw new Error('Too many errors to correct');

  // Forney: Ω(x) = S(x)·Λ(x) mod x^eccLen, error value e = X·Ω(X⁻¹) / Λ'(X⁻¹) for roots starting at α^0.
  const omega = new Array<number>(eccLen).fill(0);
  for (let i = 0; i < lambda.length; i++) for (let j = 0; j < eccLen - i; j++) omega[i + j] ^= mul(lambda[i], syn[j]);
  const deriv: number[] = [];
  for (let i = 1; i < lambda.length; i++) deriv.push(i % 2 ? lambda[i] : 0);
  for (const p of positions) {
    const X = pow2(p);
    const Xinv = pow2(-p);
    const den = evalLow(deriv, Xinv);
    if (den === 0) throw new Error('Too many errors to correct');
    c[n - 1 - p] ^= mul(X, div(evalLow(omega, Xinv), den));
  }
  // The repaired block must be a valid codeword.
  for (let j = 0; j < eccLen; j++) {
    const x = pow2(j);
    let y = 0;
    for (let i = 0; i < n; i++) y = mul(y, x) ^ c[i];
    if (y) throw new Error('Too many errors to correct');
  }
  return { codeword: c, corrected: errors };
}
