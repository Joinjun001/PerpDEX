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
