# M2-T2 RESULT

상태: In Progress

## 2026-10-24 — EIP-712 주문 서명 검증 구현
- 기존 M2-T1 결과 및 깨끗한 Git 작업 트리 확인.
- M2-T2 `SPEC.md`, `TODO.md`, `RESULT.md`, `QA.md` 작성.
- 검증된 `viem@2.57.10` 의존성을 백엔드에 고정 버전으로 추가(`package-lock.json` 포함).
- `backend/src/orders/signature.ts` 추가:
  - EIP-712 도메인 `PerpDEX / 1 / chainId / verifyingContract` 검증 및 Typed Data 생성
  - 서명 주문의 market·side·price·quantity·nonce·expiresAt 정규화와 uint256 경계 검증
  - EOA 지갑의 EIP-712 서명 복원/주소 확인 및 주문·체인·검증 컨트랙트 변조 거부
  - 잘못된 서명·만료 주문·잘못된 도메인 거부
- `backend/test/signature.test.ts` 신규 테스트 8개 추가, 전체 17개 통과.
- `npm run build` 성공(현재는 Node.js strip-types 구문 검증).
- Foundry는 `forge` 미설치로 미실행. 원격 push, 실제 배포 및 실제 지갑 개인키 사용 없음.

## 다음 개발 단계
- DB 기반의 **영속적·원자적 NonceRegistry** 도입: (chainId, verifyingContract, account, nonce) 고유 제약과 중복 삽입 실패 처리.
- 취소·만료/수명주기 처리를 분리하고 동일 nonce의 동시 승인 요청에서 하나만 성공하는 테스트 작성.
- 서버 설정에서만 EIP-712 도메인을 선택하도록 후속 API 계층에 연결.
- 위 기능이 완료되기 전에는 `verifyOrderSignature`만으로 Replay 공격을 방지했다고 주장하지 않는다.

## 2026-10-24 — Nonce 영속 저장 및 Replay 차단

- 신규 PostgreSQL migration `backend/sql/001_order_nonces.sql`과 수동 적용 스크립트 `backend/scripts/migrate.ts` 추가 (실행은 하지 않음).
- `pg@8.16.3` 운영 DB 드라이버, `@electric-sql/pglite@0.5.11` 테스트용 PostgreSQL 엔진, TypeScript 및 타입 선언 패키지를 고정 버전으로 추가.
- `PostgresNonceRegistry` 구현: 복합 고유키 범위의 원자적 Nonce 소비, 취소/만료 영구 tombstone 유지 및 상태 조회.
- 운영용 `pg.Pool` 어댑터(`src/orders/postgres-adapter.ts`) 추가. 트랜잭션 단위 연결은 다음 회차에서 구현.
- `authenticateAndConsumeOrder` 구현: 주문 검증 → EIP-712 서명 검증 → Nonce 점유의 순서. 잘못된 서명은 Nonce를 소모하지 않으며 중복 사용은 `NonceAlreadyUsedError`로 거부.
- PGlite 엔진을 활용해 영속성(디렉터리 DB 종료 및 재개방), 12개 동시 호출에서 한 개만 성공, 도메인/계정별 스코프 분리, 취소/만료 후 재사용 차단을 검증.
- `npm test`: **23/23 통과**, `npm run build`: `tsc --noEmit` **성공**.
- 저장소 README에 수동 DB migration 적용법과 도메인/취소 인증 경계를 기록.
- 본 회차는 Nonce 기능만 완료; 운영 PostgreSQL 서버 접속 및 주문 API 통합은 미구현/미검증. 실제 DB 운영 migration, 원격 push, Solidity 배포, 개인키 사용을 수행하지 않았다.

## 다음 개발 우선순위
- M2-T3 주문 API의 주문 INSERT·Nonce 예약을 하나의 PostgreSQL 트랜잭션으로 통합하여 실패 시 원자적 rollback 구현.
- 인증된 취소 요청 경계를 확립하고 nonce 취소를 인증된 사용자 요청으로 연결.
- 운영 PostgreSQL 서버의 연결·다중 프로세스·재시작 E2E 검증. 실환경이 없다면 미검증으로 기록하고 단위/embedded PostgreSQL 범위에서 가능한 기능 구현 지속.

## 2026-10-24 — 주문 저장 + Nonce 소비 트랜잭션 통합 (3회차)

- Git 초기 상태: 작업 트리 깨끗함, 이전 커밋 `1a1845a`.
- `backend/sql/002_orders.sql`: 주문 테이블, 주문 상태·가격·수량·서명 형식 검사, Nonce 복합키를 참조하는 외래키, 시장/상태/생성시각 인덱스 추가. 동일 canonical order ID가 서로 다른 EIP-712 도메인에서 발생할 수 있으므로 global unique로 묶지 않음.
- `backend/src/orders/order-store.ts`: 트랜잭션 범위 SqlRunner를 주입받아 주문 저장 및 Nonce 기준 조회.
- `backend/src/orders/order-transactions.ts`: `pg.Pool.connect()`로 얻은 단일 연결에서 BEGIN → callback → COMMIT, 오류 시 ROLLBACK, finally release. 롤백 자체가 실패하면 원래 오류와 함께 AggregateError 전달.
- `backend/src/orders/accept-order.ts`: EIP-712 서명 검증·Nonce 예약·주문 INSERT를 동일 트랜잭션 콜백으로 수행. 검증 도메인은 서비스에 전달되는 신뢰된 서버 설정이어야 함.
- `backend/scripts/migrate.ts`: 001/002 스키마를 같은 마이그레이션 트랜잭션으로 적용하도록 수정. 실제 운영 DB에는 실행하지 않음.
- 신규 `backend/test/order-transaction.test.ts` 7개: 정상 저장, 실제 SQL constraint failure→Nonce 포함 rollback·재시도, 12개 동시 요청에서 단 1개 원자적 성공, 디스크 DB 종료/재개방, 서로 다른 체인 도메인에서 동일 canonical ID 수용, 외래키 검증, pg pool adapter의 동일 연결 COMMIT/ROLLBACK/release.
- `npm run build`의 `tsc --noEmit` 통과, `npm test` **30 passed / 0 failed** (기존 23개 + 신규 7개).
- 운영 PostgreSQL 서버, 서로 다른 서버 프로세스/연결 사이의 동시성 및 실제 REST API E2E는 **미검증**. 테스트는 PGlite SQL 엔진 및 PgPool 모의 연결을 사용함.
- 원격 push·실배포·실제 DB migration·비밀키 사용 금지 준수.

### 다음 단계
- 인증된 취소 요청(EIP-712 CancelOrder 등)과 주문/Nonce 상태의 원자적 갱신을 구현. 승인되지 않은 사용자의 취소가 불가능하도록 보안 테스트 작성.
- M2-T3 REST API에 서버 고정 chainId/verifyingContract와 현재 transaction manager를 주입하고 요청/응답 및 재전송 결과를 검증.
- 운영 PostgreSQL 서버가 준비되는 경우 별도 승인하에 마이그레이션과 다중 프로세스 동시성 E2E 확인.

## 2026-10-24 — EIP-712 서명 기반 주문 취소 (4회차)

- 시작 Git 상태 깨끗함, 직전 로컬 커밋 `59dea03` 확인.
- `backend/src/orders/cancel-signature.ts` 신규 구현: `CancelOrder(account,nonce,deadline)` typed data, EOA 취소 서명 복원/검증, 도메인 분리, uint256 nonce와 deadline 검증.
- `backend/src/orders/cancel-order.ts` 신규 구현: 유효한 취소 서명에 대해서만 트랜잭션 시작 → nonce cancel(잠금/재사용 방지) → 주문 CANCELED 상태 갱신. 주문 UPDATE 실패·종료 상태일 때 전체 rollback.
- `PostgresOrderStore.cancelActive` 추가: `OPEN`, `PARTIALLY_FILLED` 주문만 전이하며 기존 부분 체결 수량을 수정하지 않음. 전체 주문 없으면 사전 취소 Nonce tombstone 저장.
- `backend/test/cancel-order.test.ts` 신규 7개 시나리오: 사전 취소와 Replay 방지, 정상 취소·중복 거부, 부분 체결 보존, 위조/타 계정/다른 체인/컨트랙트/만료 서명 거부, FILLED·EXPIRED 거부 및 상태 rollback, SQL CHECK 제약 오류 시 주문·Nonce 동시 rollback/재시도, 생성·취소 동시 요청 경합 방지.
- 검증: `npm run build`(`tsc --noEmit`) 성공, `npm test` **37 passed / 0 failed**.
- 실제 운영 PostgreSQL 서버·서로 다른 프로세스의 동시 접근 및 REST API는 **미검증**. 원격 push/실배포/DB 실운영 migration/사용자 개인키 사용 없음.

### 후속 개발
- M2-T2 인증 계층의 최종 QA 정리 및 운영 DB 제약 검증은 실제 서버 환경이 준비되면 진행.
- M2-T3 주문 REST API: 서버에서 고정한 도메인을 이용한 주문 생성/조회/취소, 입력검증·오류 응답·요청 중복 처리 및 E2E 테스트.
