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
