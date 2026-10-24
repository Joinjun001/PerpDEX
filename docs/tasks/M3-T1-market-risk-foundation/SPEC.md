# M3-T1 SPEC — 무기한 선물 시장·가격·단위/정밀도 기반

상태: Local Implementation Completed. M3 첫 구현은 기존 M2 API/SQL의 동작을 변경하지 않는 순수 검증 모듈로 구현했다.

## 구현 목적

안전한 격리 증거금 회계(M3-T2)를 시작하기 전에 시장 스펙, 가격 신뢰·유효성, 정수형 단위 변환의 공통 계약을 먼저 만든다. 향후 포지션·레버리지·펀딩·청산에서 **동일한 값**을 다르게 해석하지 않도록 강제한다.

## 범위

1. `backend/src/perp/market-config.ts`: 시장명/quote/baseAsset(식별자), USDC 모의 담보 단위, tickSize/lotSize, base/quote/price scale, risk limit enum/range 및 승인된 config revision·trusted source 검증. 실제 정책값 미확정 시 검증 실패.
2. `backend/src/perp/price-snapshot.ts`: 입력 유효성 검증(index, mark, timestamp, source, confidence, sequence), 시장/도메인 일치, staleness·미래시각·중복/역행·가격차·비정상 신뢰도 차단. **모의 snapshot만**; 외부 HTTP/RPC 없음.
3. `backend/src/perp/fixed-point.ts`: canonical unsigned/signed decimal 파서, BigInt overflow, 정확한 mul/div 및 반올림 방향, base quantity × price → quote notional 검증. 매직 스케일/Number 금융 산술 금지.
4. 순수 단위/검증 모듈 테스트: 가장 작은 단위·초대형 uint256·0/음수·틱 불일치·stale/future·market mismatch·confidence·가격 deviation·정밀도/스케일 오류. `npm run build`, `npm test` 수행.
5. 기존 M2 주문/SQL/지갑·Vault 동작은 변경하지 않고, 신규 public API도 열지 않는다.

## 완료 기준

- 타입·정수 정확성·신뢰된 시장/가격 스냅샷 입력의 positive/negative/boundary 테스트.
- 어떠한 미승인 운영 위험 파라미터도 내장하지 않음.
- 테스트/빌드 통과 및 M3-T1 TODO·QA·RESULT·PROJECT_STATE 갱신 후 변경 파일만 로컬 커밋.
- 실제 체인 송신, 실자산 이동, 스테이징/운영 DB 변경, 원격 push 금지.

참고: `docs/architecture/PERPETUAL-MVP-DESIGN.md`.

## 실제 구현 계약 — 2026-10-24

- `fixed-point.ts`: 정규 10진 문자열 `uint256`/`int256` (부호/선행 0/범위 거부), 0~36 소수 자릿수, explicit rounding mulDiv 및 `quantityAtomic × priceAtomic × 10^collateralDecimals / (10^baseDecimals × 10^priceDecimals)` 명목가치. 부호·결과 overflow·0으로 잘리는 명목가치 차단. `Number` 기반 금전 연산 금지.
- `market-config.ts`: trusted `sourceId`와 서명 도메인·명시적 `status=APPROVED`, revision/유효기간, `BASE-QUOTE-PERP`, ERC-20 collateral EVM 주소·소수점, tick/lot/min/max/OI, IM/MM/leverage·price deviation·confidence·snapshot age 필드의 완전성·범위 검사. 서버가 제공하는 trustedSourceId는 요청자 입력으로 받아서는 안 된다. 위험 수치는 테스트용 픽스처 외 실제 운영 기본값으로 내장하지 않음.
- `price-snapshot.ts`: local mock snapshot만 검증하며 chain/contract/market/policy revision/oracleSource 정확한 일치, price uint256, 미래/오래된 publish, 신뢰도·mark/index deviation, sequence/timestamp 재사용·역행 차단. 외부 oracle RPC/HTTP 연결 금지.
- `validatePerpOrderUnits`: 순수 가격 tick·lot 배수/수량 제한 검사. 아직 M2 v1 signed order 생성/매칭 API에는 연결하지 않음. M3-T2에서 원장/격리 마진 예약에 이어서 사용하며 실제 운영 주문 활성화는 M5 위험 엔진 이후로 미룬다.
