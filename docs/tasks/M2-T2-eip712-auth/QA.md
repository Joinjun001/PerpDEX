# M2-T2 QA

상태: In Progress — EIP-712 서명 기능 검증 완료, Replay 방지 미구현

## 이번 회차 검증 (2026-10-24)
- `cd backend && npm test`: **17 passed / 0 failed** (기존 9개 + 신규 8개).
- `cd backend && npm run build`: **성공**. 현재 build 스크립트는 Node.js `--experimental-strip-types --check` 기반 *구문 검사*이며 전체 TypeScript 타입 검사는 아니다.
- 검증한 내용: EIP-712 Order 스키마 필드와 타입, BUY/SELL side 매핑, 정확한 256-bit 정수 값, 정상 임시 지갑 서명 인증, 가격/수량/side/nonce/만료시각/market 변조 거부, chainId 및 verifyingContract 변경 거부, 잘못된 서명자 거부, 만료 주문 거부, 잘못된 도메인/zero address 거부, uint256 overflow 검출.
- 실제 사용자 비밀키나 RPC, 실배포를 사용하지 않았다. 서명 테스트 계정은 테스트 프로세스 안에서만 임시 생성된다.
- `forge`가 실행 환경에 없어 Foundry 테스트는 **미실행**. 이번 회차에 온체인 Solidity 변경은 없다.

## 남은 검증
- `nonce` 영속 저장, 중복 사용 원자성, 서버 재시작/동시성 경계 테스트.
- 주문 인증과 다음 REST API의 통합(서명 검증 도메인은 신뢰할 수 있는 서버 설정에서만 주입).
- ERC-1271 컨트랙트 지갑 지원은 이 EOA 전용 검증 기능의 범위에 포함하지 않는다.

## 2026-10-24 — PostgreSQL NonceRegistry 및 Replay 방지

- `cd backend && npm test`: **23 passed / 0 failed** (기존 17개 + Nonce/PGlite 신규 6개).
- `cd backend && npm run build`: **성공** (`tsc --noEmit`를 통해 실제 TypeScript 타입 검사; 기존 구문 전용 검사에서 개선).
- PostgreSQL schema: `backend/sql/001_order_nonces.sql`. 복합 기본키 `(chain_id, verifying_contract, account, nonce)`, 비가역 상태 `USED/CANCELED/EXPIRED`, 영구 Nonce tombstone.
- `backend/src/orders/nonce-registry.ts`: SQL 파라미터 바인딩 및 `INSERT ... ON CONFLICT DO NOTHING RETURNING` 기반 원자적 점유, cancel/expire 전이, 상태 조회.
- `backend/src/orders/order-auth.ts`: EIP-712 서명 검증 후에만 Nonce 소비. 잘못된 서명은 DB Nonce를 소비하지 않음.
- `backend/src/orders/postgres-adapter.ts`: 운영용 `pg.Pool`과 저장소를 연결하는 인터페이스 제공. 실제 PG 서버 접속은 미검증.
- 테스트: 정상 소비 후 중복 차단, **12개 동시 요청에서 1개만 성공**, 체인·검증 컨트랙트·계정·Nonce 각각의 스코프 분리, 잘못된 서명에 대한 Nonce 보존, 취소 전/후 재사용 차단, 만료 시점 전/후 상태 전이, DB 종료/재개방 후에도 Nonce 재사용 불가.
- 테스트용 저장소: **PGlite 내장 PostgreSQL 엔진** (임시 디렉터리 저장/다시 열기). 실제 PostgreSQL 서버의 연결·네트워크·여러 프로세스 통합 검증과 동일한 것은 아님.
- 실제 운영 DB 마이그레이션은 **미실행**. 환경에 `psql`, Docker, 서버 PostgreSQL이 없음. `forge`도 없어 온체인 회귀 검증은 미실행. 이번 단계에서 Solidity 파일은 변경하지 않음.

## 후속 통합·보안 확인 사항

1. `cancel()`은 저장소의 내부 연산만 구현. HTTP에서 사용할 때는 반드시 서명된 취소 의사 또는 별도 소유자 인증을 거쳐야 함. 현재 직접적인 외부 API 없음.
2. M2-T3에서 서명 도메인을 신뢰할 수 있는 서버 설정으로 고정하고, **주문 DB INSERT와 Nonce INSERT를 동일 연결/트랜잭션에서 커밋**해야 함. 현재 서비스의 독립 Nonce 예약과 주문 저장의 원자성은 아직 미구현.
3. `pg.Pool` 운영 서버(PostgreSQL) 마이그레이션 및 다중 연결/서버 재시작 테스트는 차후 별도 환경에서 실시.
4. ERC-1271 스마트컨트랙트 지갑은 현재 지원하지 않음.
