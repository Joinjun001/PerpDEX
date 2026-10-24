# M5-T3-A — SIMULATION_ONLY 영속 Reduce-only 예약 수량·가상 소진·취소

상태: A 로컬 구현. **M3 현금 예약/이체, M4 실제 포지션 체결, M2 주문 접수와 비연결.** B~C 후속.

## M5-T3 작업 분할

- **A (이번 회차)**: 모의 Reduce-only 수량의 단일 계정/시장 행 잠금, position/margin/policy/oracle 고정 및 영속 예약, 취소, 가상 부분 소진/중복 재전송·복구와 버전 무결성. 실 체결/금전 이동 불가.
- **B (후속)**: M4 양측 atomic position clearing과 reduce-only quote/reservation을 *동일 DB 트랜잭션*으로 연계, consuming journal이 실제 양측 포지션 상태·양측 OI/체결 ID/상대방 위험과 일치하도록 보증. 기존 M4 별도 writer가 M5 예약을 우회하지 못하도록 모든 writer 통합. 독립 승인/전체 실패 QA 이전에는 실 체결 없음.
- **C (후속)**: M3 margin reserve/unreserve·pending opening orders/fees/funding·trusted oracle snapshot과 실제 order-admission을 동일 DB 상태로 묶고 자산 이중계상·인출 우회 방지. 사람 승인 없는 정책·온체인 연결 불가.
- **M5-T4**: 사용자 승인된 임시 Unix-socket-only PostgreSQL에서 lock/경합/장애/재시작/성능 검증.

## 실제 설계·보안 불변식

- `backend/sql/012_perp_reduce_reservations.sql`는 market+chain+verifyingContract+collateral+account 단위 `perp_reduce_guards`(앵커 포지션 version/size/revision/config hash/누적 가상 소진량), `perp_reduce_orders`(원주문·남은/소진/취소 수량·가격/side/정책/오라클/마진 스냅샷 해시·상태), `perp_reduce_events`(immutable CONSUME/CANCEL 이벤트, 같은 계정 도메인의 eventId 유일성) 세 테이블을 추가.
- PostgreSQL 명시적 PK/FK·CHECK와 `requested = remaining + consumed + cancelled` 정수 회계, `OPEN`이면 남은 수량 양수, `CANCELLED`/`EXHAUSTED`는 잔량 0. 소비 이력은 M4 append-only 트리거를 재사용해 UPDATE/DELETE 거부.
- `reserveSimReduceOnly`는 **단 한 `withTransaction`**에서 신규 account guard 먼저 `INSERT ON CONFLICT DO NOTHING` → `SELECT ... FOR UPDATE`, 이어서 기존 실제 DB의 포지션 `FOR UPDATE`와 세 M3 margin bucket `FOR SHARE` 및 `getIsolatedMarginBalances`을 조회. 허위 신규 포지션/잔고를 생성하지 않음. 영속 포지션 이력/latest consistency 검사 후 M5-T2의 `evaluateSimPreTrade(... reduceOnly:true)`로 위험 판정. 계정별 `SUM(OPEN remaining) + guard.consumed + 신규 주문 전체량 <= abs(anchor position size)`를 확인. 주문 ID 중복은 canonical 입력·hash·margin fingerprint 동일해야 replay 반환.
- risk quote는 저장된 포지션 version, 정책 revision/hash, trusted 모의 가격 snapshot의 `sourceSequence`, mark/index, timestamp/confidence 및 M3 margin bucket `balance + version` 해시로 결속. 소진 요청은 모두 여기에 현재 context/DB를 재대조해 stale 또는 위험 변화에 대해 fail-closed; 외부 키·실 거래 데이터 사용 없음.
- `consumeSimReduceReservation`는 **실 체결이 아니며 position size를 바꾸지 않음**. 완전히 가상인 리허설 이벤트로 원주문의 `remaining`을 줄이고 `consumed`와 guard `consumed`를 동시 증가시킨다. 사용된 용량을 다시 예약 가능량으로 돌려주지 않으므로 M4 양측 clearing 통합 전까지 **이중 감소 불가**. 동일 event ID replay는 기존 상태만 반환, 신규 ID/중복 소진/로트 무효·SQL 실패는 거부/롤백.
- `cancelSimReduceReservation`는 아직 소진되지 않은 `remaining`만 `cancelled`로 옮겨 재예약 여력을 복원하며, `consumed`에는 영향이 없다. 원장 행 상태 종료 후 새 event ID의 이중 취소는 거부. 단, 이미 성공한 동일 event ID는 재조회 가능.
- 포지션 version/size/정책이 이미 변경되면 모든 신규 예약/가상 소진·취소 상태 전이를 정지하고 승인된 **B 포지션 화해(reconciliation)**를 요구. 취소는 oracle/마진 fingerprint 드리프트에 대해 위험 평가를 재사용하지 않으므로 허용하지만 **현재 유효한 trusted context와 원래 포지션 앵커**는 필요.
- 이 보존식은 M5-T3-A의 자체 모의 예약 서비스 간에만 강제된다. 별도로 실행되는 기존 M4 paired clearing/단독 원장 서비스, M3 bucket update를 DB 자체에서 전면 금지하지 않음. 따라서 **실 매칭·M4 영속 position 변경·실 collateral 움직임에 연결해서는 안 된다.**

## QA·운영 경계

- 신규 PGlite: 여러 예약 합계/15건 경합, 중복 주문/소진/취소, LONG·SHORT, 부분 가상 소진→취소→재예약, cancel/consume 경합, 실패 SQL rollback, snapshot/margin/position stale, close/reopen 뒤 사용량·중복 재전송, DB CHECK/append-only. `npm run build`, 전체 `npm test`, `git diff --check` 통과해야 완료.
- 실제 deposit/withdraw, collateral bucket 이동, 수수료·펀딩, M2 EIP-712 실 주문, M4 체결 및 외부 RPC/운영 DB/배포/원격 push 전부 제외.
