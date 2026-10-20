/**
 * Code 128 (code set B) encoder.
 *
 * Written by hand rather than pulled from npm because the label sheet renders
 * on the server: DOM-based barcode libraries cannot run inside a React Server
 * Component. The output is a run-length list of bar/space widths in modules,
 * which is resolution independent — the caller decides how wide a module is.
 *
 * Pattern table: the 107 symbols of ISO/IEC 15417 (103 data symbols, 3 start
 * symbols, 1 stop). Cross-checked against two independent published tables, so
 * a mis-transcribed entry would show up as a mis-scan on the shop floor.
 */
const PATTERNS: readonly string[] = [
  "11011001100",
  "11001101100",
  "11001100110",
  "10010011000",
  "10010001100",
  "10001001100",
  "10011001000",
  "10011000100",
  "10001100100",
  "11001001000",
  "11001000100",
  "11000100100",
  "10110011100",
  "10011011100",
  "10011001110",
  "10111001100",
  "10011101100",
  "10011100110",
  "11001110010",
  "11001011100",
  "11001001110",
  "11011100100",
  "11001110100",
  "11101101110",
  "11101001100",
  "11100101100",
  "11100100110",
  "11101100100",
  "11100110100",
  "11100110010",
  "11011011000",
  "11011000110",
  "11000110110",
  "10100011000",
  "10001011000",
  "10001000110",
  "10110001000",
  "10001101000",
  "10001100010",
  "11010001000",
  "11000101000",
  "11000100010",
  "10110111000",
  "10110001110",
  "10001101110",
  "10111011000",
  "10111000110",
  "10001110110",
  "11101110110",
  "11010001110",
  "11000101110",
  "11011101000",
  "11011100010",
  "11011101110",
  "11101011000",
  "11101000110",
  "11100010110",
  "11101101000",
  "11101100010",
  "11100011010",
  "11101111010",
  "11001000010",
  "11110001010",
  "10100110000",
  "10100001100",
  "10010110000",
  "10010000110",
  "10000101100",
  "10000100110",
  "10110010000",
  "10110000100",
  "10011010000",
  "10011000010",
  "10000110100",
  "10000110010",
  "11000010010",
  "11001010000",
  "11110111010",
  "11000010100",
  "10001111010",
  "10100111100",
  "10010111100",
  "10010011110",
  "10111100100",
  "10011110100",
  "10011110010",
  "11110100100",
  "11110010100",
  "11110010010",
  "11011011110",
  "11011110110",
  "11110110110",
  "10101111000",
  "10100011110",
  "10001011110",
  "10111101000",
  "10111100010",
  "11110101000",
  "11110100010",
  "10111011110",
  "10111101110",
  "11101011110",
  "11110101110",
  "11010000100", // START A
  "11010010000", // START B
  "11010011100", // START C
  "1100011101011", // STOP (13 modules)
];

const START_B = 104;
const STOP = 106;
const MODULO = 103;

export type BarcodeRun = { width: number; bar: boolean };

/**
 * Code set B carries ASCII 32–126 at value = code - 32. It is enough for the
 * EAN/UPC digit strings and internal SKUs this shop prints, and keeps the
 * encoder free of code-set switching.
 */
function valueOf(char: string): number | null {
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) return null;
  return code - 32;
}

export function canEncode(value: string): boolean {
  if (value.length === 0) return false;
  for (const char of value) {
    if (valueOf(char) === null) return false;
  }
  return true;
}

/** Symbol ids in the order they are printed: start, data, checksum, stop. */
export function code128SymbolIds(value: string): number[] | null {
  const values: number[] = [];
  for (const char of value) {
    const v = valueOf(char);
    if (v === null) return null;
    values.push(v);
  }
  if (values.length === 0) return null;

  // Position-weighted checksum, as required by the spec: the start symbol and
  // the first data symbol are both weighted 1.
  const checksum =
    (START_B + values.reduce((sum, v, index) => sum + v * (index + 1), 0)) %
    MODULO;

  return [START_B, ...values, checksum, STOP];
}

/** Bar/space widths in modules, starting and ending with a bar. */
export function encodeCode128(value: string): BarcodeRun[] | null {
  const symbols = code128SymbolIds(value);
  if (!symbols) return null;

  const runs: BarcodeRun[] = [];

  for (const symbol of symbols) {
    const pattern = PATTERNS[symbol];
    let bar = true;
    let width = 0;
    for (const bit of pattern) {
      if ((bit === "1") === bar) {
        width += 1;
      } else {
        runs.push({ width, bar });
        bar = !bar;
        width = 1;
      }
    }
    runs.push({ width, bar });
  }

  return runs;
}

export function moduleCount(runs: BarcodeRun[]): number {
  return runs.reduce((sum, run) => sum + run.width, 0);
}
