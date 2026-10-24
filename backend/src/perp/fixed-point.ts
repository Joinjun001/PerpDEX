/** Explicit, lossless atomic-unit arithmetic for the local perpetual prototype. */
export class FixedPointError extends Error {
  constructor(message: string) { super(message); this.name = 'FixedPointError'; }
}

export type RoundingMode = 'DOWN' | 'UP' | 'TOWARD_ZERO' | 'AWAY_FROM_ZERO';
export const MAX_UINT256 = (1n << 256n) - 1n;
export const MIN_INT256 = -(1n << 255n);
export const MAX_INT256 = (1n << 255n) - 1n;
const UNSIGNED = /^(0|[1-9][0-9]*)$/;
const SIGNED = /^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;

export function uint256(value: unknown, name = 'value', positive = false): bigint {
  if (typeof value !== 'string' || !UNSIGNED.test(value)) {
    throw new FixedPointError(`${name}: canonical unsigned decimal required`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256 || (positive && parsed === 0n)) {
    throw new FixedPointError(`${name}: uint256 out of range`);
  }
  return parsed;
}

export function int256(value: unknown, name = 'value'): bigint {
  if (typeof value !== 'string' || !SIGNED.test(value)) {
    throw new FixedPointError(`${name}: canonical signed decimal required`);
  }
  const parsed = BigInt(value);
  if (parsed < MIN_INT256 || parsed > MAX_INT256) {
    throw new FixedPointError(`${name}: int256 out of range`);
  }
  return parsed;
}

export function decimalScale(decimals: unknown): bigint {
  if (!Number.isSafeInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 36) {
    throw new FixedPointError('decimals must be an integer between 0 and 36');
  }
  return 10n ** BigInt(decimals as number);
}

/** Input/result constrained to uint256; BigInt intermediate keeps 512-bit products exact. */
export function mulDivUnsigned(a: bigint, b: bigint, divisor: bigint, rounding: 'DOWN' | 'UP'): bigint {
  if (a < 0n || a > MAX_UINT256 || b < 0n || b > MAX_UINT256 ||
      divisor <= 0n || divisor > MAX_UINT256) {
    throw new FixedPointError('mulDiv unsigned operand or denominator out of uint256 range');
  }
  if (rounding !== 'DOWN' && rounding !== 'UP') throw new FixedPointError('explicit unsigned rounding required');
  const numerator = a * b;
  const answer = numerator / divisor + (rounding === 'UP' && numerator % divisor !== 0n ? 1n : 0n);
  if (answer > MAX_UINT256) throw new FixedPointError('mulDiv unsigned result overflow');
  return answer;
}

/** TOWARD_ZERO / AWAY_FROM_ZERO are explicit for signed PnL and funding. */
export function mulDivSigned(a: bigint, b: bigint, divisor: bigint, rounding: 'TOWARD_ZERO' | 'AWAY_FROM_ZERO'): bigint {
  if (a < MIN_INT256 || a > MAX_INT256 || b < MIN_INT256 || b > MAX_INT256 ||
      divisor <= 0n || divisor > MAX_INT256) {
    throw new FixedPointError('mulDiv signed operand or denominator out of range');
  }
  if (rounding !== 'TOWARD_ZERO' && rounding !== 'AWAY_FROM_ZERO') {
    throw new FixedPointError('explicit signed rounding required');
  }
  const numerator = a * b;
  const magnitude = (numerator < 0n ? -numerator : numerator);
  const rounded = magnitude / divisor + (rounding === 'AWAY_FROM_ZERO' && magnitude % divisor !== 0n ? 1n : 0n);
  const answer = numerator < 0n ? -rounded : rounded;
  if (answer < MIN_INT256 || answer > MAX_INT256) throw new FixedPointError('mulDiv signed result overflow');
  return answer;
}

export interface NotionalUnits {
  baseDecimals: number;
  priceDecimals: number;
  collateralDecimals: number;
}

/**
 * quote/collateral atomic notional = baseAtomic * priceAtomic * 10^collateralDecimals
 *                                 / (10^baseDecimals * 10^priceDecimals).
 * No floating-point financial arithmetic, no implicit rounding assumptions.
 */
export function collateralNotional(
  baseAtomic: string, priceAtomic: string, units: NotionalUnits, rounding: 'DOWN' | 'UP',
): string {
  const quantity = uint256(baseAtomic, 'baseAtomic', true);
  const price = uint256(priceAtomic, 'priceAtomic', true);
  if (!units || typeof units !== 'object') throw new FixedPointError('unit specification required');
  const numeratorScale = decimalScale(units.collateralDecimals);
  const denominator = decimalScale(units.baseDecimals) * decimalScale(units.priceDecimals);
  const numerator = quantity * price * numeratorScale;
  if (rounding !== 'DOWN' && rounding !== 'UP') throw new FixedPointError('rounding must be explicit');
  const value = numerator / denominator + (rounding === 'UP' && numerator % denominator !== 0n ? 1n : 0n);
  if (value > MAX_UINT256 || value === 0n) {
    throw new FixedPointError('collateral notional overflow or rounds to zero');
  }
  return value.toString();
}
