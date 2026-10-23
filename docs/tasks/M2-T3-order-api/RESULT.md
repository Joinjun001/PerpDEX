# M2-T3 RESULT

상태: In Progress

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
