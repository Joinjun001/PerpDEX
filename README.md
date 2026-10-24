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
npm run start:dev
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

**서버 실행 전 반드시 순서대로 `backend/sql/001_order_nonces.sql`부터 `004_order_book.sql`까지 적용되어 있어야 합니다.** 운영 DB 변경은 수동 승인 작업이며 API는 마이그레이션을 자동 실행하지 않습니다. 로컬 PGlite/HTTP 테스트는 `cd backend && npm run build && npm test`로 확인합니다. 프로덕션 PostgreSQL 다중 연결·다중 프로세스 검증과 정산 연동은 아직 미완료입니다.

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
