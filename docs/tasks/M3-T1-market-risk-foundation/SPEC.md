# M3-T1 SPEC — 무기한 선물 시장·가격·단위/정밀도 기반

상태: Planned. M3 첫 실제 구현 TASK. 이번 설계 회차에서는 소스 코드·스키마를 변경하지 않는다.

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
