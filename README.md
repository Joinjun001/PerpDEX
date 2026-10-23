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
