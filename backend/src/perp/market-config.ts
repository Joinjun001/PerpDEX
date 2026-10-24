import {getAddress} from 'viem';
import type {OrderSigningDomainInput} from '../orders/signature.ts';
import {validateOrderSigningDomain} from '../orders/signature.ts';
import {decimalScale, uint256} from './fixed-point.ts';

export class MarketConfigError extends Error {
  constructor(message: string) {super(message); this.name = 'MarketConfigError';}
}

/** Supplied only by a trusted configuration source; never from public order JSON. */
export interface PerpMarketConfig {
  market: string;
  baseAsset: string;
  quoteAsset: string;
  collateralToken: string;
  chainId: number;
  verifyingContract: string;
  sourceId: string;
  oracleSourceId: string;
  revision: number;
  status: 'APPROVED' | 'DRAFT' | 'REVOKED';
  validFrom: number;
  validUntil: number;
  baseDecimals: number;
  priceDecimals: number;
  collateralDecimals: number;
  tickSize: string;
  lotSize: string;
  minQuantity: string;
  maxQuantity: string;
  maxOpenInterest: string;
  initialMarginBps: number;
  maintenanceMarginBps: number;
  maxLeverage: number;
  maxPriceDeviationBps: number;
  maxConfidenceBps: number;
  maxOracleAgeSeconds: number;
}

const LABEL = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const SOURCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new MarketConfigError(`${label}: invalid integer`);
  }
  return value as number;
}
function asset(value: unknown, label: string): string {
  if (typeof value !== 'string' || !LABEL.test(value) || value.length > 32) {
    throw new MarketConfigError(`${label}: invalid identifier`);
  }
  return value;
}

/**
 * `trustedSourceId` is obtained from the server, not from the submitted config.
 * APPROVED text alone does not establish trust. Real values need operator approval.
 */
export function validatePerpMarketConfig(
  raw: unknown, domainInput: OrderSigningDomainInput, trustedSourceId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Readonly<PerpMarketConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MarketConfigError('config required');
  if (typeof trustedSourceId !== 'string' || !SOURCE.test(trustedSourceId)) {
    throw new MarketConfigError('trusted source must come from server config');
  }
  const p = raw as Record<string,unknown>;
  const domain = validateOrderSigningDomain(domainInput);
  integer(nowSeconds,'nowSeconds',0,Number.MAX_SAFE_INTEGER);
  if (p.status !== 'APPROVED' || p.sourceId !== trustedSourceId) {
    throw new MarketConfigError('approved policy from trusted source required');
  }
  const revision = integer(p.revision,'revision',1,Number.MAX_SAFE_INTEGER);
  const from = integer(p.validFrom,'validFrom',1,Number.MAX_SAFE_INTEGER);
  const until = integer(p.validUntil,'validUntil',1,Number.MAX_SAFE_INTEGER);
  if (from > nowSeconds || until <= nowSeconds || until <= from) throw new MarketConfigError('expired/inactive market policy');
  if (p.chainId !== domain.chainId || typeof p.verifyingContract !== 'string' ||
      p.verifyingContract.toLowerCase() !== domain.verifyingContract.toLowerCase()) {
    throw new MarketConfigError('market signing domain mismatch');
  }
  let collateralToken: string;
  try { collateralToken = getAddress(p.collateralToken as `0x${string}`).toLowerCase(); }
  catch { throw new MarketConfigError('invalid collateral address'); }
  if (collateralToken === ZERO) throw new MarketConfigError('collateral cannot be zero address');
  const market = asset(p.market,'market');
  const baseAsset = asset(p.baseAsset,'baseAsset');
  const quoteAsset = asset(p.quoteAsset,'quoteAsset');
  if (baseAsset === quoteAsset || market !== `${baseAsset}-${quoteAsset}-PERP`) {
    throw new MarketConfigError('market pair naming inconsistent');
  }
  if (typeof p.oracleSourceId !== 'string' || !SOURCE.test(p.oracleSourceId)) {
    throw new MarketConfigError('trusted oracle source identifier required');
  }
  const baseDecimals = integer(p.baseDecimals,'baseDecimals',0,36);
  const priceDecimals = integer(p.priceDecimals,'priceDecimals',0,36);
  const collateralDecimals = integer(p.collateralDecimals,'collateralDecimals',0,36);
  decimalScale(baseDecimals);decimalScale(priceDecimals);decimalScale(collateralDecimals);
  const tick = uint256(p.tickSize,'tickSize',true);
  const lot = uint256(p.lotSize,'lotSize',true);
  const min = uint256(p.minQuantity,'minQuantity',true);
  const max = uint256(p.maxQuantity,'maxQuantity',true);
  const oi = uint256(p.maxOpenInterest,'maxOpenInterest',true);
  if (min > max || max > oi || min % lot !== 0n || max % lot !== 0n) {
    throw new MarketConfigError('lot/quantity/open interest limits inconsistent');
  }
  // Tick must resolve to nonzero price units and never be merely a decimal fraction.
  if (tick < 1n) throw new MarketConfigError('invalid tick');
  const initial = integer(p.initialMarginBps,'initialMarginBps',1,10000);
  const maintenance = integer(p.maintenanceMarginBps,'maintenanceMarginBps',1,9999);
  if (maintenance >= initial) throw new MarketConfigError('maintenance must be smaller than initial margin');
  const maxLeverage = integer(p.maxLeverage,'maxLeverage',1,1000);
  if (BigInt(maxLeverage)*BigInt(initial) > 10000n) {
    throw new MarketConfigError('leverage cap contradicts initial margin requirement');
  }
  const maxPriceDeviationBps=integer(p.maxPriceDeviationBps,'maxPriceDeviationBps',0,10000);
  const maxConfidenceBps=integer(p.maxConfidenceBps,'maxConfidenceBps',0,10000);
  const maxOracleAgeSeconds=integer(p.maxOracleAgeSeconds,'maxOracleAgeSeconds',1,3600);
  return Object.freeze({market,baseAsset,quoteAsset,collateralToken,chainId:domain.chainId,
    verifyingContract:domain.verifyingContract.toLowerCase(),sourceId:trustedSourceId,
    oracleSourceId:p.oracleSourceId,revision,status:'APPROVED',validFrom:from,validUntil:until,
    baseDecimals,priceDecimals,collateralDecimals,tickSize:tick.toString(),lotSize:lot.toString(),
    minQuantity:min.toString(),maxQuantity:max.toString(),maxOpenInterest:oi.toString(),
    initialMarginBps:initial,maintenanceMarginBps:maintenance,maxLeverage,
    maxPriceDeviationBps,maxConfidenceBps,maxOracleAgeSeconds});
}

/** Separate executable rule: order size and price obey trusted lot and tick. */
export function validatePerpOrderUnits(
  config: Readonly<PerpMarketConfig>,priceAtomic: string,baseAtomic: string,
): void {
  const price=uint256(priceAtomic,'priceAtomic',true);
  const quantity=uint256(baseAtomic,'baseAtomic',true);
  if (price % BigInt(config.tickSize)!==0n || quantity % BigInt(config.lotSize)!==0n ||
    quantity < BigInt(config.minQuantity) || quantity > BigInt(config.maxQuantity)) {
    throw new MarketConfigError('order violates tick, lot or quantity bounds');
  }
}
