import type {OrderSigningDomainInput} from '../orders/signature.ts';
import {validateOrderSigningDomain} from '../orders/signature.ts';
import {uint256} from './fixed-point.ts';
import type {PerpMarketConfig} from './market-config.ts';

export class PriceSnapshotError extends Error {
  constructor(message: string) {super(message);this.name='PriceSnapshotError';}
}
export interface PerpPriceSnapshot {
  chainId: number;
  verifyingContract: string;
  market: string;
  configRevision: number;
  sourceId: string;
  indexPrice: string;
  markPrice: string;
  publishedAt: number;
  sourceSequence: string;
  confidenceBps: number;
}

/** Only caller-owned trusted local snapshots. This function never fetches prices. */
export function validateMockPriceSnapshot(
  raw: unknown, config: Readonly<PerpMarketConfig>, domainInput: OrderSigningDomainInput,
  nowSeconds: number, previous?: Readonly<PerpPriceSnapshot>,
): Readonly<PerpPriceSnapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PriceSnapshotError('price snapshot required');
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new PriceSnapshotError('invalid clock');
  const p=raw as Record<string,unknown>;
  const domain=validateOrderSigningDomain(domainInput);
  if (p.chainId!==domain.chainId || p.verifyingContract!==domain.verifyingContract.toLowerCase() ||
      p.market!==config.market || p.configRevision!==config.revision || p.sourceId!==config.oracleSourceId ||
      config.chainId!==domain.chainId || config.verifyingContract!==domain.verifyingContract.toLowerCase()) {
    throw new PriceSnapshotError('price source, market, policy revision or chain mismatch');
  }
  if (!Number.isSafeInteger(p.publishedAt) || (p.publishedAt as number)<1 ||
      (p.publishedAt as number)>nowSeconds || nowSeconds-(p.publishedAt as number)>config.maxOracleAgeSeconds) {
    throw new PriceSnapshotError('stale or future oracle publication');
  }
  if (!Number.isSafeInteger(p.confidenceBps) || (p.confidenceBps as number)<0 ||
      (p.confidenceBps as number)>config.maxConfidenceBps) {
    throw new PriceSnapshotError('oracle confidence exceeds policy');
  }
  const index=uint256(p.indexPrice,'indexPrice',true);
  const mark=uint256(p.markPrice,'markPrice',true);
  const seq=uint256(p.sourceSequence,'sourceSequence',true);
  const deviation=mark >= index ? mark-index : index-mark;
  if (deviation*10000n>index*BigInt(config.maxPriceDeviationBps)){
    throw new PriceSnapshotError('mark price deviates beyond permitted band');
  }
  if(previous && (previous.market!==config.market || previous.sourceId!==config.oracleSourceId ||
    previous.chainId!==domain.chainId || previous.verifyingContract!==domain.verifyingContract.toLowerCase() ||
    previous.configRevision!==config.revision ||
    BigInt(previous.sourceSequence)>=seq || previous.publishedAt>(p.publishedAt as number))) {
    throw new PriceSnapshotError('stale, replayed, or cross-scope oracle sequence');
  }
  return Object.freeze({chainId:domain.chainId,verifyingContract:domain.verifyingContract.toLowerCase(),
    market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
    indexPrice:index.toString(),markPrice:mark.toString(),publishedAt:p.publishedAt as number,
    sourceSequence:seq.toString(),confidenceBps:p.confidenceBps as number});
}
