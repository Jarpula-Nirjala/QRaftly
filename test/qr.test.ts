import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jsQRModule from 'jsqr';
import { div, mul } from '../shared/qr/gf.ts';
import { decode as rsDecode, generator, remainder } from '../shared/qr/rs.ts';
import { addEccAndInterleave, encodeText } from '../shared/qr/encode.ts';
import { decodeMatrix } from '../shared/qr/decode.ts';
import { rasterize } from '../shared/qr/raster.ts';
import { makeSegment, toCodewords } from '../shared/qr/segments.ts';
import { blockLayout, ECLS } from '../shared/qr/tables.ts';

// jsQR is CommonJS; its default export is the decoder function.
const jsQR = jsQRModule as unknown as (data: Uint8ClampedArray, width: number, height: number, opts?: { inversionAttempts?: string }) => { data: string; binaryData: number[] } | null;

/** Reads a matrix with jsQR, an independent decoder, from a rendered image. */
function readWithJsQR(modules: boolean[][]) {
  const img = rasterize(modules, 3, 4);
  return jsQR(img.rgba, img.width, img.height, { inversionAttempts: 'dontInvert' });
}

describe('GF(256) and Reed–Solomon', () => {
  it('multiplication and division are inverse', () => {
    for (let a = 1; a < 256; a++) for (const b of [1, 2, 3, 29, 142, 255]) assert.equal(div(mul(a, b), b), a);
    assert.equal(mul(0, 77), 0);
  });

  it('matches the reference error-correction codewords for "HELLO WORLD" at 1-M', () => {
    // The worked example from the standard's tutorials (thonky.com "QR Code Tutorial").
    const data = toCodewords(makeSegment('HELLO WORLD'), 1, blockLayout(1, 'M').dataCodewords);
    assert.deepEqual(data, [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    assert.deepEqual(remainder(data, generator(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    assert.deepEqual(addEccAndInterleave(data, 1, 'M').slice(16), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('repairs up to ⌊n/2⌋ wrong codewords and refuses more', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (const ecc of [7, 10, 16, 22, 30]) {
      const data = Array.from({ length: 40 }, () => Math.floor(rand() * 256));
      const word = data.concat(remainder(data, generator(ecc)));
      for (let errs = 0; errs <= ecc / 2; errs++) {
        const bad = word.slice();
        const where = new Set<number>();
        while (where.size < errs) where.add(Math.floor(rand() * bad.length));
        for (const p of where) bad[p] ^= 1 + Math.floor(rand() * 255);
        const fixed = rsDecode(bad, ecc);
        assert.deepEqual(fixed.codeword, word, `ecc ${ecc}, ${errs} errors`);
        assert.equal(fixed.corrected, errs);
      }
      const tooMany = word.slice();
      for (let p = 0; p <= ecc / 2; p++) tooMany[p * 2] ^= 0x5a;
      assert.throws(() => {
        const r = rsDecode(tooMany, ecc);
        assert.notDeepEqual(r.codeword, word);
        throw new Error('decoded to a different codeword');
      });
    }
  });
});

describe('QR encoder (checked by an independent decoder)', () => {
  it('every version 1–40 at every level reads back exactly', () => {
    for (let v = 1; v <= 40; v++)
      for (const ecl of ECLS) {
        // Fill most of the capacity in byte mode so every block is used.
        const capacity = blockLayout(v, ecl).dataCodewords - 3;
        const text = Array.from({ length: Math.max(1, capacity) }, (_, i) => String.fromCharCode(97 + ((i * 7 + v) % 26))).join('');
        const qr = encodeText(text, { ecl, minVersion: v, maxVersion: v, boostEcl: false });
        assert.equal(qr.version, v);
        assert.equal(qr.ecl, ecl);
        assert.equal(decodeMatrix(qr.modules).text, text, `own decoder at ${v}-${ecl}`);
        // jsQR cannot locate any version 23-L symbol, whatever the mask or text (its tables match ours: 4×121 + 5×122
        // data codewords, 30 ecc each). OpenCV's QR decoder reads our 23-L symbols correctly; see README "Verification".
        if (v === 23 && ecl === 'L') continue;
        const theirs = readWithJsQR(qr.modules);
        assert.ok(theirs, `jsQR could not read version ${v}-${ecl}`);
        assert.equal(theirs.data, text, `jsQR read wrong text at ${v}-${ecl}`);
      }
  });

  it('numeric, alphanumeric, byte and UTF-8 text', () => {
    for (const text of ['0', '01234567', '8675309012345678901234', 'HELLO WORLD', 'HTTPS://QRFORGE.APP/R/ABC123', 'https://example.com/?q=a&b=c', 'नमस्ते दुनिया — QR ✓ 😀', '']) {
      const qr = encodeText(text, { ecl: 'M' });
      assert.equal(decodeMatrix(qr.modules).text, text);
      const theirs = readWithJsQR(qr.modules);
      assert.ok(theirs, `jsQR: ${text}`);
      assert.deepEqual(Buffer.from(theirs.binaryData), Buffer.from(new TextEncoder().encode(text)), `jsQR bytes: ${text}`);
    }
    assert.equal(encodeText('01234567').mode, 'numeric');
    assert.equal(encodeText('HELLO WORLD').mode, 'alphanumeric');
    assert.equal(encodeText('hello').mode, 'byte');
  });

  it('every mask produces a valid symbol', () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeText('Mask test 123', { mask, ecl: 'Q' });
      assert.equal(qr.mask, mask);
      assert.equal(readWithJsQR(qr.modules)?.data, 'Mask test 123');
      assert.equal(decodeMatrix(qr.modules).mask, mask);
    }
  });

  it('chooses the smallest version and boosts the level when it is free', () => {
    const small = encodeText('hi', { ecl: 'L' });
    assert.equal(small.version, 1);
    assert.equal(small.ecl, 'H');
    assert.throws(() => encodeText('x'.repeat(3000), { ecl: 'H' }), /does not fit/);
  });

  it('survives damage: a scratched patch is repaired by error correction', () => {
    const text = 'https://qraftly.app/r/damage-test';
    const qr = encodeText(text, { ecl: 'H', boostEcl: false });
    // A 5×5 scratch in the middle of the data area, every module inverted.
    const damaged = qr.modules.map((r) => r.slice());
    const c = Math.floor(qr.size / 2) - 2;
    for (let y = c; y < c + 5; y++) for (let x = c; x < c + 5; x++) if (!qr.isFunction[y][x]) damaged[y][x] = !damaged[y][x];
    const mine = decodeMatrix(damaged);
    assert.equal(mine.text, text);
    assert.ok(mine.correctedPerBlock.some((n) => n > 0));
    assert.equal(readWithJsQR(damaged)?.data, text);
  });
});
