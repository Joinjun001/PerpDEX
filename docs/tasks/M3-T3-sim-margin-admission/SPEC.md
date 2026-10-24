# M3-T3 — 무기한 선물 서명 주문과 격리 증거금의 원자적 연결

상태: **M3-T3-A 로컬 구현 및 PGlite 검증**, B/C 후속.

## TASK 분할

- **A (이번 회차)**: M2 v1 서명·공개 API와 분리된 **SIMULATION_ONLY** 주문 v2 EIP-712, trusted MarketConfig와 mock PriceSnapshot의 검증, 주문 nonce 점유·별도 shadow order 영속 저장·초기 증거금 예약을 하나의 PostgreSQL 트랜잭션에서 수행. 서명된 v2 주문 취소 시 해당 shadow 주문만 CANCELED로 변경하고, nonce tombstone과 예약 잔액 RELEASE를 동일 트랜잭션에 포함.
- **B (M4/M5 선행 의존)**: 실제 주문 v2의 포지션·잔액/체결/상대방 위험검사 원자적 연결 및 *부분 체결에 따른 예약 감소→포지션 증거금 할당*. 현재는 매칭·체결이 전혀 없는 shadow order이므로 **부분 체결 조정을 구현하지 않는다**. 이후 실제 포지션·PnL 회계/위험 엔진과 독립 검증 뒤 진행.
- **C (M3-T4)**: 실제 로컬 PostgreSQL 다중 연결로 shadow order 경합/동시 서명 취소/rollback/스냅샷 복구, nonce 공유 안전성 테스트. 운영 DB 마이그레이션은 사용자 승인 없이 금지.

## M3-T3-A 데이터 계약 및 기능

- 신규 `009_perp_sim_orders.sql`: M2 `order_nonces` FK를 갖는 격리된 `perp_sim_orders` 저장소. `OPEN/CANCELED`만 지원, **M2 실제 `orders`/`order_book_entries`/`order_fills`에는 삽입하지 않음**. `executionMode='SIMULATION_ONLY'`는 서명에 고정되며 이 주문으로 실제 담보 이동·정산·매칭은 할 수 없음.
- 신규 `backend/src/perp/sim-order.ts`: `PerpSimOrder` EIP-712 domain version `2`와 독립 `CancelPerpSimOrder` 서명. 공개 M2 v1의 EIP-712 서명은 인정되지 않으며, domain·nonce·시장·가격·수량·만료시각·담보·marginMode·config revision·**전체 config 해시**·SIMULATION_ONLY가 주문 서명에 결속된다. `reduceOnly=true`는 포지션 엔진이 없어 검증 불가능하므로 금지한다.
- 실 마켓 위험 숫자는 서버의 **신뢰된 정책 레지스트리**에서 따로 승인을 받아야 한다. 이 내부 helper에 전달되는 trusted source ID/config/snapshot은 신뢰된 테스트 오케스트레이터에서만 공급하며, public HTTP 값으로 취급해서는 안 된다.
- 가격 검증: mock PriceSnapshot chain/market/source/revision/freshness/band 일치, 주문 limit 가격의 mark deviation 한도 및 tick/lot/수량 검증. 초기 예약금은 `ceil(max(limitPrice, markPrice) × quantity × initialMarginBps /10000)`를 명시된 base/price/collateral 스케일로 변환하여 BigInt 계산한다. 실제 수수료·펀딩비·계약 포지션 노출·변동성/슬리피지/증거금 하한/청산 요구액 검증은 미구현이므로 **로컬 시뮬레이션 근사치이지 실제 마진 승인액 아님**.
- `admitSimPerpOrder`: 서버 신뢰 정책·오라클 입력 검증 → EIP-712 서명 검증 → `withTransaction(db)` 내부에서 `PostgresNonceRegistry.consume` → shadow order 저장 → 기존 `margin-ledger.ts` RESERVE 두 분개. 그중 어느 단계 실패해도 nonce/order/journal/balances 모두 롤백한다. 같은 서명 재요청은 거부하고 재예약 없음.
- `cancelSimPerpOrder`: orderId/nonce/계정/expiry를 포함한 **별도 v2 취소 서명** 필요. shadow order `OPEN` 행을 FOR UPDATE 후 M2 영속 nonce tombstone, shadow CANCELED, 마진 RELEASE 두 분개가 한 트랜잭션으로 저장된다. 두 번째 취소·잘못된 서명·불일치 주문은 실패하고 자금 상태가 그대로 유지된다.
- 필수 SQL 경계: `001_order_nonces.sql`, `008_perp_margin_ledger.sql`, `009_perp_sim_orders.sql`. 정규 마이그레이터에는 009 추가하지만 운영 DB에 적용하지 않는다.

## 안전/인수 제한

- 실제 토큰 예치/지급/배포/원격 push/키/RPC 미사용. PGlite 테스트에서만 직접 주입한 임시 시작 잔액 사용.
- 현재 **실거래 마진 시스템이 아니다**. 특히 old `CollateralVault.withdraw()`는 DB의 reserved margin을 강제하지 않으며, 포지션 엔진 없는 부분 체결 예약 조정·자동 해제는 금지.
- 사용자 취소 요청을 공개 HTTP 경로에 연결하지 않고, 재시작 복구 및 장애 rollback을 로컬에서만 검증한다.
