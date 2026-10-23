# M2-T3 RESULT

상태: Completed (로컬 구현 및 PGlite/HTTP QA; 운영 PostgreSQL 검증 미실행)

## 2026-10-24 — 시작
- 기준 Git: `adabd3f`, 작업 트리 깨끗함.
- M2-T2의 서명·Nonce·주문/취소 트랜잭션 코드를 재사용.
- 첫 작업은 주문 생성 POST API와 실제 HTTP 요청 검증.

## 2026-10-24 — 주문 생성 POST API 구현

- `backend/src/http/create-order-http.ts`: Node.js 내장 HTTP 서버를 위한 `POST /api/orders` 핸들러.
- 서명된 요청 형식 `{order,signature}`, Content-Type `application/json`·64KiB 제한·JSON 구조 검사 및 201/400/401/409/413/415/500/404/405 HTTP 매핑.
- 클라이언트가 제공한 `domain`은 명시적으로 거부. `chainId`와 `verifyingContract`는 시작 시 검증된 서버 설정만 사용.
- 기존 `acceptSignedOrder`, `postgresTransactionManager`에 연결해 서명 검증과 Nonce 예약, 주문 INSERT를 단일 트랜잭션으로 처리.
- 예상치 못한 DB 오류는 서버 응답에 SQL 문구·자격증명·스택을 공개하지 않고 일반적인 500을 출력.
- `backend/src/http/server.ts`: `DATABASE_URL`, `PERPDEX_CHAIN_ID`, `PERPDEX_VERIFYING_CONTRACT`을 필수로 받고 127.0.0.1에만 명시적 시작. DB 운영 마이그레이션/실배포는 수행하지 않음.
- `backend/test/order-http.test.ts`: 실제 loopback HTTP 요청과 PGlite SQL 저장을 포함한 신규 테스트 7개 추가.
- `npm run build` 성공, `npm test`: **44 passed / 0 failed** (기존 37 + 신규 7). 외부 실서버 PG는 미검증.
- 후속: 주문 조회/목록, 서명된 주문 취소 HTTP API, idempotency·추가 운영 환경 검증.

## 2026-10-24 — 주문 GET 단건·목록 API (6회차)

- 시작 Git: `main`, 깨끗한 작업 트리, 직전 커밋 `f56a6cd`.
- `backend/src/orders/order-store.ts`에 서명·DB 내부 컬럼을 제외한 공개 주문 프로젝션, 신뢰된 서명 도메인 범위의 단건 조회/조건부 목록·정렬·LIMIT+1 조회 추가.
- `backend/src/http/create-order-http.ts`에서 GET `/api/orders/:orderId`와 GET `/api/orders` 지원. 유효한 market/status만 필터 가능하며 limit(1..50), offset(0..10000), 중복/잘못된 파라미터는 400으로 처리. 미존재 404와 DB 오류 500을 내부 정보 없이 반환.
- 기존 POST 주문 생성 동작 유지, 허용 HTTP 메서드 GET/POST로 갱신. `backend/src/http/server.ts`는 기존 pg.Pool을 조회 SQL Runner로 추가 주입.
- `backend/test/order-read-http.test.ts` 신규 테스트 6개: 단건 조회·정밀도 보존·서명 비노출, 시장/상태 필터, deterministic 정렬·페이지 제한·hasMore, 부적절한 ID/필터/SQL 인젝션·중복 파라미터 거절, EIP-712 서로 다른 체인 도메인 격리, DB 오류 500 내부 정보 비노출.
- 초기 테스트에서 동적 SQL 자리표시자 출력 오류를 발견하고 수정한 뒤 신규 조회 테스트 **6/6 통과**. 전체 회귀 테스트 결과는 최종 검증 로그 참조.
- 운영 PostgreSQL/멀티프로세스 검증, 실제 배포, 원격 push, 사용자 개인키 사용 없음.
- 다음 회차: EIP-712 인증 기반 주문 취소 REST API 및 관련 오류 상태 매핑.

### 6회차 최종 회귀 결과

- `npm run build`: TypeScript 검사 통과.
- `npm test`: **50/50 통과, 실패 0**.
- 초기 전체 병렬 테스트 중 PGlite 프로세스 2개가 SIGKILL 종료. 독립된 신규 API 테스트는 6/6 통과했으며, PGlite 다중 프로세스 메모리 경합을 피하도록 `npm test`에 `--test-concurrency=1` 적용 후 **기존 전체 테스트까지 50개 모두 통과**.
- 거래 엔진 및 운영 PG 실서버 E2E는 변경하거나 실행하지 않았음.

## 2026-10-24 — EIP-712 주문 취소 HTTP 엔드포인트 (7회차)

- 기준 Git 작업 트리 clean, 이전 커밋 `7be8537` 확인 후 시작.
- `backend/src/http/create-order-http.ts`에서 POST `/api/orders/cancel` 정적 경로를 `:orderId`보다 먼저 매칭. 요청 타입 `{cancel, signature}`, 중첩·최상위 도메인 거부.
- 내부에서 `cancelSignedOrder`를 재사용하여 EIP-712 서명 검사 뒤 동일 PostgreSQL 트랜잭션에서 Nonce 및 주문 상태 변경. 로직 재구현 없이 인증 진입점만 추가.
- HTTP 오류 매핑: 만료·부정확한 취소 입력 400, 위조 서명 401, 중복 취소·종료 상태 409, 내부 DB 장애 500. SQL 내부 오류 내용은 클라이언트에 반환하지 않음.
- `backend/test/order-cancel-http.test.ts` 신규 8개 테스트: 정상 취소, 사전 취소 후 주문 생성 차단, 타인·위조·다른 Chain ID/컨트랙트 거부, 만료·잘못된 도메인·Content-Type·본문 크기 제한, 부분 체결 잔량 보존, FILLED/EXPIRED 거부, 생성-취소 동시 요청, 주문 UPDATE 제약 오류 시 트랜잭션 롤백 및 재시도, 내부 DB 장애 에러 비노출.
- 해당 테스트 **8개 통과**, `npm run build` 통과. 전체 `npm test` 회귀 결과는 최종 검증 로그를 기준으로 갱신.
- 운영 PostgreSQL/멀티프로세스, 실제 배포 및 운영 DB 마이그레이션은 수행하지 않음. 사용한 서명 계정은 테스트 전용으로 매 실행에 생성됨.
- 남은 M2-T3 작업: 네트워크 실패 후 주문 생성·취소 재전송에 대한 idempotency 정책 및 회귀, 로컬 TASK 최종 QA.

### 7회차 전체 회귀 판정

- `npm run build`: **성공** (`tsc --noEmit`).
- `npm test`: **58 passed / 0 failed**, 기존 50개 + HTTP 취소 테스트 8개.
- `--test-concurrency=1` 순차 실행 유지. DB 업데이트 제약 테스트는 앞서 취소된 다른 주문을 방해하지 않도록 목표 nonce에만 제약 적용한 뒤 재검증 완료.
- 실제 PostgreSQL 서버, 외부 공개 API와 멀티프로세스/네트워크 E2E는 **미검증**. 배포/운영 DB 마이그레이션 미수행.

## 2026-10-24 — 재전송 멱등성 구현 및 로컬 검증 (8회차)

- Git 시작 상태: clean, 직전 로컬 커밋 `2477e83`.
- `backend/src/orders/idempotency.ts`: 저장된 원본 주문·정확한 서명·서버 설정 도메인을 재확인한 뒤 안전한 생성 재전송을 판정. 취소 영수증의 계정/nonce/기한/서명과 저장 결과를 조회하여 취소 재전송을 판정.
- `backend/sql/003_order_cancel_receipts.sql`: 영속적 취소 증거 테이블 추가; 기존 `001`·`002` 마이그레이션은 수정하지 않음. `scripts/migrate.ts`가 명시적 수동 실행 시 `003`을 추가하도록 갱신.
- `cancelSignedOrder`: Nonce/주문 상태 변경과 취소 영수증 INSERT를 같은 DB 트랜잭션으로 커밋.
- `POST /api/orders`: 동일 유효 서명·주문 재전송이면 `200,replayed:true`; 실제 저장된 현 상태 사용. 변조된 요청은 원래 409, 위조 서명은 401.
- `POST /api/orders/cancel`: 원본과 서명·기한이 일치하는 취소 요청만 `200,replayed:true` 및 영수증에 저장된 원래 결과 반환. 다른 취소/종료 주문은 원래 409 유지.
- 신규 `backend/test/idempotency-http.test.ts` 테스트 9개: 응답 유실 복구 모사, 주문 상태 변경 후 재요청, 동일 Nonce 변조·위조 거부/다른 계정 분리, 동시 동일 생성 10회, 취소 영수증/잔량 보존, 사전 취소 멱등성, 동시 취소 8회, receipt INSERT SQL 오류 전체 rollback, 디스크 PGlite 닫기·재개방 후 생성·취소 재전송.
- 기존 테스트 중 중복 전송 기대 결과가 정책상 `409→200`으로 변경된 두 곳을 갱신했으며, 경합 테스트는 원본 주문 커밋 여부에 따라 안전한 재전송과 신규 주문 거부를 구별하도록 수정.
- PGlite 및 localhost HTTP에서만 검증. 운영 PostgreSQL 다중 연결/프로세스, 실제 운영 DB 스키마 적용·배포·원격 Push·사용자 개인키는 수행하지 않음.

### 8회차 최종 로컬 완료 판정

- `cd backend && npm run build`: TypeScript `tsc --noEmit` **통과**.
- `cd backend && npm test`: 전체 **67 passed / 0 failed** (`--test-concurrency=1`).
- M2-T3 범위: 서명 주문 생성·단건/목록 조회·인증된 취소·영속 재전송 복구 구현 및 HTTP/PGlite 회귀 통과.
- 상태: **로컬 기능 개발·검증 완료**. 운영 PostgreSQL 다중 연결/멀티프로세스 실서버, 운영 DB의 003 마이그레이션, 외부 배포/접근 제어는 미실행. 상용 서비스 준비 완료를 의미하지 않음.
- 다음: M2-T4-A 결정적 순수 가격·시간 우선 매칭 코어 구현.
