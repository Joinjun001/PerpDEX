# Perp DEX

Ethereum 기반 하이브리드 DEX 프로젝트.

- 주문/매칭: Off-chain
- 자금 보관/정산: On-chain
- 네트워크: Ethereum Sepolia

## Tech Stack

- Solidity + Foundry
- TypeScript
- Next.js
- NestJS
- PostgreSQL
- Prisma
- Docker
- MetaMask / wagmi / viem

## Structure

```text
.
├── contracts/
├── backend/
├── frontend/
└── docker-compose.yml
```

## Initial Goal

```text
Deposit
→ Limit Order
→ Matching
→ Settlement
→ Withdraw
```

## Run

### Contracts

```bash
cd contracts
forge build
forge test
```

### Sepolia 배포 준비

실제 비밀값은 저장소에 커밋하지 않고 루트의 `.env.example`을 복사해 로컬 `.env`에만 채운다.

```bash
cp .env.example .env
```

필요한 환경 변수:

- `SEPOLIA_RPC_URL`: Sepolia RPC endpoint
- `DEPLOYER_PRIVATE_KEY`: 배포 계정 private key
- `SETTLEMENT_EXECUTOR`: `CollateralVault`의 초기 settlement executor 주소

배포 전 현재 셸에 환경 변수를 로드한 뒤 Foundry script를 실행한다.

```bash
set -a
source .env
set +a

cd contracts
forge script script/DeployCollateralVault.s.sol:DeployCollateralVault \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

`--broadcast`는 실제 Sepolia 트랜잭션을 발생시키므로 사람 확인 후 수동으로 실행한다. AutoPilot에서는 실제 배포를 수행하지 않는다.

### Backend

```bash
cd backend
npm run start
```

### Frontend

```bash
cd frontend
npm run dev
```

### Database

```bash
docker compose up -d
```

## 로컬 주문 API와 매칭 (M2-T4-C)

`POST /api/orders`는 서버 설정 도메인으로 EIP-712 서명을 검증하고 **하나의 트랜잭션**에서 Nonce 예약·주문 저장·시장별 순서 등록·가격/시간 우선 매칭·체결 원장을 반영합니다. 생성 응답 201은 주문의 현재 `status`, `filledQuantity`, `remainingQuantity`, `arrivalSequence`, `fills`를 추가로 반환합니다. 동일 서명 재전송은 중복 체결하지 않고 저장된 현재 상태의 멱등 응답을 반환합니다. 이는 오프체인 체결 기록이며 온체인 잔액 정산을 의미하지 않습니다.

**서버 실행 전 주문 API에는 001~004가 필수이고, 로컬 모의 정산까지 사용하려면 005~007도 차례대로 필요합니다.** 운영 DB 변경은 수동 승인 작업이며 API는 마이그레이션을 자동 실행하지 않습니다. 로컬 PGlite/HTTP 테스트는 `cd backend && npm run build && npm test`로 확인합니다. 프로덕션 PostgreSQL 다중 연결·다중 프로세스 검증과 정산 연동은 아직 미완료입니다.

## M2-T5-A — 정산 후보 영속 Outbox (로컬 검증)

- SQL `backend/sql/005_settlement_outbox.sql`은 `order_fills.fill_id`에 연결된 정산 **준비 작업**을 영속화합니다. `backend/scripts/migrate.ts`에 수동 적용 순서를 등록했으며 서버/API 요청 중 자동 마이그레이션하지 않습니다. 운영 DB 적용은 별도 승인 사항입니다.
- 내부 `backend/src/settlement/outbox.ts`는 원장 검증 후 중복 없는 Outbox 생성과 `PENDING_POLICY → PREPARING → WAITING_POLICY` 또는 `RETRYABLE → PREPARING` 상태 전이만 제공합니다. 준비 작업을 선점한 워커의 UUID 임대가 만료되면 재선점 가능하지만, 오래된 토큰은 작업을 완료할 수 없습니다.
- **주의:** `WAITING_POLICY`는 승인이나 온체인 성공을 뜻하지 않습니다. ERC-20 담보 자산, 정밀도, 수수료, 증거금·위험 및 송금 방향 정책이 없는 상태이므로 트랜잭션 전송·서명·잔고 이전 기능은 없습니다.
- 검증: `cd backend && npm run build && npm test`; 개별 Outbox 검증: `node --experimental-strip-types --test test/settlement-outbox.test.ts`.

## M2-T5-B — 신뢰 정책 및 체결별 승인 검증

- `backend/src/settlement/policy.ts`는 **운영자가 관리하는 신뢰된 정책**의 도메인·vault/asset/정밀도·수수료/외부 위험모델·한도·방향/유효 기간을 검증합니다. 정산 금액은 외부 신뢰된 리스크 승인자가 해당 `tradeId`/정책 해시/참여자/가격·수량에 EIP-712 서명한 **명시적인 uint256 최소 단위 금액**만 허용합니다. 가격×수량으로 자동 산출하지 않습니다.
- `prepareSettlementInstructionFromLedger`는 커밋된 체결원장 + `WAITING_POLICY` Outbox + 맞는 정책·승인 서명이 모두 있는 경우에만 **데이터 전용** `SettlementInstruction`을 반환합니다. 실제 컨트랙트 호출/전송·정산 완료 또는 chain balance 검증은 아닙니다. 체인 전송 및 운영 정책 선택은 아직 구현하지 않았습니다.
- 정책 `status=APPROVED`를 클라이언트 입력으로 받으면 신뢰성을 보장할 수 없으므로, 정책/신뢰 승인자 주소는 반드시 별도의 서버 보호 설정에서 공급해야 합니다. 현재 실제 운영 정책 값/서명은 구성되어 있지 않습니다.

## M2-T5-C — 로컬 정산 의도 dry-run (송신 기능 없음)

`backend/sql/006_settlement_intents.sql`은 승인 검증이 끝난 정산 지시를 `fill_id`/`trade_id` 단위로 한 번만 영속 등록하고 지시 해시·실행 상태를 저장합니다. 수동 마이그레이션 목록에는 006이 추가되지만 API가 DB를 자동 변경하지 않고 **운영 DB 마이그레이션은 실행되지 않았습니다**.

`backend/src/settlement/dry-run.ts`의 `recordApprovedSettlementIntent`는 신뢰된 정책·per-fill 승인 서명을 기존 체결원장과 Outbox에 대조한 뒤 `PREPARED`로 기록합니다. `executeSettlementDryRun`은 `CollateralVault.settle`의 calldata만 **로컬에서 인코딩**하고 `SIMULATED` 결과 해시를 영속화합니다. 이는 **체인 트랜잭션 hash/receipt/성공을 의미하지 않습니다**. `SIMULATING` 중단·오류 발생 시 자동 재실행을 허용하지 않으며 명시적 격리 API를 통해 `UNKNOWN` 처리합니다. 실제 지갑·RPC·가스·배포 권한 사용 기능은 제공하지 않습니다.

로컬 검증: `cd backend && npm run build && npm test` 또는 `node --experimental-strip-types --test test/settlement-dry-run.test.ts`. 006 스키마의 실제 운영 DB 적용·실제 체인 송신·영수증 처리는 아직 승인 및 후속 단계가 필요합니다.

## M2-T5-D — 모의 영수증 조회·재조정 (실제 체인 검증 아님)

`backend/sql/007_settlement_reconciliations.sql`은 출처가 `MOCK_READONLY`인 관측 결과만 영속 기록합니다. `backend/src/settlement/reconcile.ts`의 `InMemoryMockReceiptProvider`는 오로지 메모리 fixture를 읽고, `reconcileMockSettlement`은 실제 M1 Vault의 `Settled(tradeId, token, from, to, amount)` 이벤트 필드/상태/확인 횟수 및 정산 의도·도메인과의 일치를 검증합니다. **MOCK_VERIFIED와 MOCK_FAILED는 실제 체인 정산 결과가 아닙니다.** 모의 영수증 누락·네트워크 부재·블록 충돌은 재확인/UNKNOWN으로 기록하고 자동 전송하거나 다시 실행하지 않습니다. 운영 환경의 영수증 검증·최종성·체인 재구성, Foundry 및 실제 RPC/settledTrades 검증은 별도 승인·실행이 필요합니다.

로컬 테스트: `cd backend && npm run build && npm test` (신규 `test/settlement-reconcile.test.ts`). 스키마 007은 운영 DB에 적용하지 않았습니다.

## M2 로컬 종단간 인수 (M2-T5-E)

- `cd backend && node --experimental-strip-types --test test/m2-end-to-end.test.ts`는 **실제 HTTP 서명 주문 → 체결 → 영속 정산 대기 → 승인 서명 검증 → 로컬 ABI 모의 실행 → 모의 영수증 결과/불확실 상태 → DB 재시작 및 DDL 재적용**을 검증합니다.
- 전체 절차·운영 승인 게이트는 [`docs/releases/M2-LOCAL-ACCEPTANCE.md`](docs/releases/M2-LOCAL-ACCEPTANCE.md)에 작성했습니다.
- 현재 M2는 **로컬 테스트/모의 정산까지만 통과**했으며 실제 온체인 자금 이동이나 운영 릴리스는 구현·검증·승인되지 않았습니다.

## M2 로컬 실 PostgreSQL/Foundry 검증 (운영 DB 사용 금지)

실제 PostgreSQL의 복수 연결·잠금·트랜잭션과 Foundry 컨트랙트 검증을 위한 절차/결과는 [`docs/releases/M2-LOCAL-PG-FOUNDRY-QA.md`](docs/releases/M2-LOCAL-PG-FOUNDRY-QA.md)를 참고하세요. 기존 `npm test`는 PGlite/HTTP 기반이며, 실제 PostgreSQL 검증은 **명시적으로 생성한 임시 Unix 소켓 전용 서버**와 전용 테스트 DB가 있어야 실행할 수 있습니다.

```bash
cd backend
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket npm run test:postgres-local
cd ../contracts
forge build && forge test -vv
```

`test:postgres-local`은 고정 이름의 개발 DB와 임의의 고유 스키마에서만 작동하며 운영 `DATABASE_URL`을 사용하지 않습니다. 외부 RPC/배포/실토큰 이동은 하지 않습니다.

## M3-T2 — 격리 증거금 내부 원장 (실제 자금 아님)

`backend/sql/008_perp_margin_ledger.sql`은 계정/시장/담보/체인별 가용(AVAILABLE)·예약(RESERVED)·포지션(POSITION) 원자 단위 잔액과 2-leg 이중 분개를 기록하는 영속 스키마입니다. 관리용 마이그레이션 목록에만 등록했으며 운영 DB에는 적용하지 않았습니다.

`backend/src/perp/margin-ledger.ts`는 멱등 `operationId`, 트랜잭션/행 잠금, 잔액 보존 검사를 통해 내부 계정의 `RESERVE`, `RELEASE`, `ALLOCATE`, `UNALLOCATE`만 지원합니다. **실제 자금 입금·잔액 발행/지급 API는 없고**, `backend/test/perp-margin-ledger.test.ts`의 테스트용 시작 잔액은 PGlite 테스트 코드에서만 주입하는 검증되지 않은 fixture입니다. 공개 주문·체결·청산·출금 경로에도 연결하지 않았습니다. `RELEASE`/`UNALLOCATE`가 향후 허가된 주문 취소·포지션 종료와 원자적으로 연결되기 전에는 거래소 기능으로 노출하면 안 됩니다.

검증: `cd backend && npm run build && npm test` (전체 백엔드 174/174). 실제 거래소의 담보 보호는 M8 ClearingHouse 및 승인된 정책/실자산 검증 전까지 미구현입니다.

## M3-T3 — 서명 선물 주문의 모의 예약/취소 (실거래 아님)

`backend/src/perp/sim-order.ts`는 **SIMULATION_ONLY EIP-712 v2** 주문·취소 서명과 신뢰된 시장 정책 전체 해시/로컬 oracle 검증을 사용합니다. 주문 nonce/새로운 `perp_sim_orders` 저장/이중 분개 증거금 예약이 한 트랜잭션에서 성공 또는 함께 롤백되고, 별도 주문 취소 서명이 nonce tombstone/정확한 원래 예약금 해제를 원자적으로 처리합니다. `009_perp_sim_orders.sql`은 수동 관리자 마이그레이션 목록에만 추가되었고 운영 DB는 변경하지 않았습니다.

이 함수는 **공개 주문 API, M2 v1 matching/fill, Vault, 실제 자산/온체인 실행에 연결하지 않았습니다**. 포지션·위험 엔진 없는 부분 체결 후 예약 증감은 구현하지 않았고, 실거래용 collateral/수수료/청산 정책이 승인되지 않았으므로 모의 계산액을 실제로 사용할 수 없습니다. 테스트: `cd backend && node --experimental-strip-types --test test/perp-sim-order.test.ts`.

## M3-T4 — 실 PostgreSQL 다중 연결 shadow 주문·마진 QA

승인된 개발용 PostgreSQL 15(Unix 소켓, TCP 비활성, 테스트 DB, 별도 `perpdex_qa_<12hex>` 스키마)에서 EIP-712 v2 **SIMULATION_ONLY** 주문의 동시 Nonce 접수·예약/취소 경합·잔액 초과 방지·이중 분개 실패 롤백 및 PostgreSQL 서버 재시작 복구를 검증했습니다. 명령: `cd backend && PERPDEX_TEST_PG_SOCKET=... PERPDEX_TEST_PG_SCHEMA=... PERPDEX_TEST_PG_PHASE=seed npm run test:postgres-perp`; 실제 서버 재시작 후 같은 스키마로 `PERPDEX_TEST_PG_PHASE=verify` 실행합니다. 결과/사람 승인 게이트: `docs/tasks/M3-T4-postgres-margin-concurrency/QA.md`. 개발용 검증만으로 포지션·온체인·운영 출금이 활성화되지 않습니다.

## M4-T3 — 양측 모의 포지션 체결 및 시장 OI

`backend/src/perp/paired-clearing.ts`는 신뢰된 테스트용 정책과 시세를 받아 같은 `fillId`, 수량, 가격의 BUY/SELL을 서로 다른 두 계정에 **하나의 PostgreSQL 트랜잭션**으로 적용하고 시장별 LONG/SHORT Open Interest가 일치하는지 검증합니다. 신규 `backend/sql/011_perp_pair_clearing.sql`은 시장별 OI/PAIRED·UNPAIRED 모드와 append-only 공통 모의 체결 기록을 저장합니다. M4-T2 기존 단일 계정 원장과 시장 모드를 섞지 않도록 DB 락 및 고유 시장 상태로 차단합니다.

이는 **실제 거래나 증거금 이동이 없는 SIMULATION_ONLY 구현**이며, 실제 체결 검증·양측 담보/위험 승인·펀딩·청산·온체인 정산에 연결하지 않았습니다. 로컬 PGlite 신규 15/15, 전체 백엔드 233/233 통과. 실제 PostgreSQL 다중 연결은 M4-T4에 별도 검증합니다.

## M4-T4 — 로컬 PostgreSQL 실제 양측 체결/시장 OI QA

개발용 PostgreSQL 15.19 임시 Unix 소켓만 사용해 `010`, `011` 스키마와 `paired-clearing.ts`의 동시 중복 체결/다른 ID 충돌, 시장 모드 최초 접근, 한쪽 journal 실패 시 전체 롤백 및 서버 재시작 후 체결 ID/OI 복구를 확인했습니다. 옵트인 명령은 `cd backend && PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket PERPDEX_TEST_PG_SCHEMA=perp_qa_<새 12자리 hex> PERPDEX_TEST_PG_PHASE=seed npm run test:postgres-paired`이며, 실제 테스트 서버 재시작 뒤 같은 schema로 `PERPDEX_TEST_PG_PHASE=verify` 실행합니다. 개발용 전용 DB에서만 사용 가능하며 **실거래/운영 DB에 적용하지 않습니다**. 자세한 검증 범위: `docs/tasks/M4-T4-postgres-paired-concurrency/QA.md`.

## M5-T1 — 로컬 무기한 선물 IM/MM·레버리지 위험 평가

`backend/src/perp/risk-engine.ts`는 테스트용 trusted MarketConfig/모의 오라클·M4 LONG/SHORT 포지션·M3 3-버킷 격리 마진 스냅샷을 받아 명목가치, 초기·유지증거금, 아직 계상되지 않은 실현손익과 미실현손익을 포함한 Equity, 레버리지·증거금 부족 등급을 **순수 계산만** 수행합니다. 항상 `SIMULATION_ONLY`와 `executionAuthorized:false`이므로 주문 승인·실 자금/증거금 이전·청산 권한은 없습니다. 테스트용 IM/MM/레버리지 비율을 운영 설정으로 사용하지 않습니다. 회계 전제·정밀도: `docs/tasks/M5-T1-isolated-risk-engine/SPEC.md`.

## M5-T2 — 로컬 reduce-only 및 체결 후 위험 시뮬레이션

`backend/src/perp/pre-trade-risk.ts`의 `evaluateSimPreTrade`는 **주문 전체 수량과 가상 부분 체결 수량을 구분**하고, LONG/SHORT 포지션의 reduce-only 위반/무단 반전·IM/MM/Equity/레버리지·reserved margin 위험을 체결 **전후** 순수 계산으로 평가합니다. 결과 `SIMULATION_ELIGIBLE`은 입력된 **모의 단일 체결의 진단**일 뿐 승인이나 실행권한이 아니며, `executionAuthorized:false`가 고정입니다. 실제 API 주문 접수·M3/M4 원장·실자산·체인·펀딩/수수료/청산에 연결하지 않았습니다. 검증 및 제약: `docs/tasks/M5-T2-pre-trade-risk/{SPEC,QA}.md`.

## M5-T3-A — Reduce-only 모의 예약 수량 원장

`backend/src/perp/reduce-reservations.ts`와 수동 SQL `backend/sql/012_perp_reduce_reservations.sql`는 **SIMULATION_ONLY**에서 단일 계정의 `미체결 reduce-only 합계 + 가상 소진 누적 <= 해당 버전 포지션 절댓값`을 영속 계정 잠금으로 검증합니다. M3 마진 3버킷·M4 포지션 스냅샷/이력·M5-T2 위험계산을 읽기 잠금 안에서 재검증합니다. 주문 예약·가상 부분 소진·미소진 취소/이벤트 중복 처리만 제공하며 **M2 실주문, M4 실제 양측 체결/포지션 변경, M3 자금 버킷 이동, Vault/온체인 거래에 연결하지 않았습니다**. 가상 소진은 실제 체결을 뜻하지 않습니다. 잔여 위험과 검증 범위는 `docs/tasks/M5-T3-reduce-capacity-ledger/SPEC.md`에 기록했습니다.

## M5-T3-B1 — 제한된 양측 Reduce-only 모의 체결의 원자적 연결

`backend/src/perp/reserved-paired-clearing.ts`는 기존 `PAIRED` 시장에서 양쪽 계정의 **단일 온전한 Reduce-only 예약을 각각 전량 소진하는 모의 포지션 축소**만 지원합니다. M4 양측 포지션·시장 OI·공통 영수증과 M5-T3-A의 두 계정 예약 소진 이벤트를 하나의 DB 트랜잭션에서 원자 저장합니다. 예약 guard가 존재하는 계정은 기존 M4의 직접 paired 및 standalone 공개 writer 경로를 거부합니다. 여러 주문의 부분 체결·일반 주문과의 매칭·실 증거금/자금 이동·온체인 송신은 미구현이며, 실 PostgreSQL 다중 연결과 모든 저수준 writer 우회 차단은 후속 검증이 필요합니다. `docs/tasks/M5-T3-B-reserved-paired/SPEC.md`를 참조하세요.

## M5-T3-B2 — 다중 Reduce-only 예약 부분 체결·위험 화해 (모의 전용)

`backend/src/perp/partial-reserved-paired-clearing.ts`는 양쪽 모두 기존 포지션을 줄이는 **SIMULATION_ONLY** 체결에서 여러 열린 Reduce-only 주문의 예약 용량을 같은 M4 양측 포지션·OI 트랜잭션 안에서 유지합니다. 일부 체결 후 남은 주문 각각을 새 포지션/증거금/오라클/정책 조건으로 재검사하여 `SUM(남은 예약) <= abs(새 포지션)`을 보장합니다. 체결 없는 shadow consume는 기존 position fill 기록으로 인정하지 않습니다. **실 주문·실 자금·M3 자금 버킷 이동·저수준 writer 전체 잠금은 아직 지원하지 않습니다.** 세부 내용: `docs/tasks/M5-T3-B2-partial-reservations/SPEC.md`.

## M5-T3-B3-A — 모의 영속 포지션의 DB 커밋 무결성 방어

`backend/sql/013_perp_guarded_position_commit.sql`은 Reduce-only guard 계정의 M4 포지션/시장 OI 변경에 대해 COMMIT 시점에 M5 주문 소진 영수증·양측 체결 ID/수량·포지션 버전을 검증하는 지연 제약 트리거입니다. `backend/src/perp/paired-clearing.ts`의 임의 `guarded=true` 옵션을 제거하고 양측 예약 ID를 실제 검증하도록 바꿨습니다. **SQL 013 설치/활성이 필요하며, 실 거래·실 자금·체인 실행을 승인하는 기능이 아닙니다.** DB 고권한 역할/트리거 비활성화 및 guard/events 원장 자체 위변조를 막을 권한 설계, 기존 DB 일치성 검사, 실제 PostgreSQL 다중 연결/부하 QA는 미완료입니다. 상세 내용: `docs/tasks/M5-T3-B3-guarded-position-commit/SPEC.md`.

## M5-T3-B3-B — Reduce-only 원장 직접 조작 방어 (모의 전용)

`backend/sql/014_perp_reduce_ledger_integrity.sql`은 예약 guard·주문·이벤트에 대한 독립 SQL 변조를 커밋 단계에서 차단하도록 신원 불변성·영속 수량 보존·정책/포지션 버전·paired/shadow 소진 합계를 검사합니다. 내부 양측 Reduce-only 모의 체결은 이제 SQL 013과 014의 필수 제약 활성 여부를 모두 확인합니다. **DB 역할별 접근 통제·동시 고권한 조작·실 자금 안전을 보장하지는 않습니다.** 실제 PostgreSQL 비소유자 계정·기존 데이터 감사·마이그레이션 및 트리거 성능은 별도 승인/검증 대상입니다. `docs/tasks/M5-T3-B3-B-reduce-ledger-integrity/`에 범위·QA·역할 계획을 기록했습니다.
