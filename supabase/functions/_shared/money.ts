// Money helpers. Amounts travel as integer MINOR units (bigint-safe numbers).

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD']);

export function minorDigits(currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/**
 * Convert a major-unit amount ("1,500", 1500, "2.5k", 100.5) to integer minor
 * units WITHOUT floating-point arithmetic on the fractional part.
 * Returns null when the value is not a clean, non-negative amount.
 */
export function toMinor(value: unknown, currency: string): number | null {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  let multiplier = 1n;
  if (/^[\d.]+k$/.test(s)) { multiplier = 1000n; s = s.slice(0, -1); }
  else if (/^[\d.]+(m|mn)$/.test(s)) { multiplier = 1_000_000n; s = s.replace(/mn?$/, ''); }
  else if (/^[\d.]+(lac|lakh|lakhs)$/.test(s)) { multiplier = 100_000n; s = s.replace(/(lac|lakhs?|lakh)$/, ''); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const digits = minorDigits(currency);
  const [whole, frac = ''] = s.split('.');
  // Scale the fraction by the multiplier first (e.g. 2.5k = 2500), then to minor units.
  const scale = 10n ** BigInt(digits);
  const fracDigits = BigInt(frac.length);
  const numerator = (BigInt(whole) * 10n ** fracDigits + BigInt(frac || '0')) * multiplier * scale;
  const denominator = 10n ** fracDigits;
  if (numerator % denominator !== 0n) return null;       // more precision than the currency allows
  const minor = numerator / denominator;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor);
}

const SYMBOLS: Record<string, string> = {
  PKR: 'Rs', INR: '₹', USD: '$', GBP: '£', EUR: '€', AED: 'AED', SAR: 'SAR', BDT: '৳', NGN: '₦', KES: 'KSh',
};

export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '—';
  const digits = minorDigits(currency);
  const neg = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const scale = 10n ** BigInt(digits);
  const whole = (abs / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = abs % scale;
  const fracStr = digits > 0 && frac !== 0n ? '.' + frac.toString().padStart(digits, '0') : '';
  const sym = SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
  const sep = sym.length > 1 && /^[A-Z]+$/.test(sym) ? ' ' : (sym === 'Rs' || sym === 'KSh' ? ' ' : '');
  return `${neg ? '-' : ''}${sym}${sep}${whole}${fracStr}`;
}
