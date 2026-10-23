# M2-T3 SPEC — 주문 REST API

## 목표
기존 EIP-712 주문 서명 인증 및 PostgreSQL NonceRegistry / 주문 원자적 저장 로직 위에 안전한 HTTP API를 제공한다.

## 전체 작업 범위
1. `POST /api/orders`: 서명된 주문 생성, 서명 검증, Nonce 중복 방지, 주문/Nonce 하나의 트랜잭션으로 INSERT.
2. 주문 상태·조회 및 목록 API.
3. `CancelOrder` EIP-712 인증을 요구하는 주문 취소 API.
4. HTTP 입력/상태 코드, 오류 응답 보안 처리 및 데이터베이스 통합 테스트.

## 첫 구현 범위 (이번 회차)
- Node.js 내장 `http` 모듈로 주문 생성 엔드포인트 제공 (프레임워크 추가 의존성 없음).
- 본문 형식 `{"order":{...},"signature":"0x..."}`; JSON 크기 제한 및 Content-Type 확인.
- 신뢰 가능한 서버 설정에서만 `chainId` 및 `verifyingContract`를 받아 EIP-712 검증. 사용자가 `domain`을 제공하면 명시적으로 거절.
- 기존 `acceptSignedOrder`와 `postgresTransactionManager`를 재사용하고 SQL 트랜잭션의 원자성을 유지.
- HTTP 매핑: 201 정상 생성, 400 입력 오류, 401 서명 인증 실패, 409 Nonce 재사용, 413 요청 크기 초과, 415 지원하지 않는 Content-Type, 500 DB/내부 오류(내부 상세 노출 금지).
- 테스트: HTTP 서버 loopback, PGlite 내장 PostgreSQL 엔진, 정상 요청·유효하지 않은 입력·위조 서명·중복 Nonce·만료 주문·DB 오류·사용자 도메인 무시/거부.

## 완료 기준 및 제약
- 첫 구현의 API 경로에 필요한 테스트 및 `npm run build` 통과.
- 운영 PostgreSQL 실서버, 멀티프로세스, API 서버 배포 및 실제 키 사용은 이번 회차 범위 밖. 실제 서버 연결/마이그레이션은 별도 승인 필요.
- 서명된 취소·조회 기능 및 HTTP 재시도 idempotency 정책은 다음 미완료 작업.

## 주문 단건·목록 조회 계약 (6회차)

- GET `/api/orders/:orderId`: 서버의 신뢰된 chainId/verifyingContract로 제한하고, 주문 ID는 `0x` + hex 64자리여야 한다. 존재하지 않는 주문 404; 형식 불일치·쿼리 삽입은 400.
- GET `/api/orders`: 서버 도메인 범위, 선택적 market/status 필터, limit 1~50(기본 20), offset 0~10000(기본 0). 허용되지 않거나 중복된 필터는 400.
- SQL 정렬: `created_at DESC, account ASC, nonce ASC`. `LIMIT limit + 1`로 `hasMore` 계산. offset 방식은 동시 삽입 시 스냅샷 간 페이지 겹침 가능성이 있으므로 후속 cursor 검토 항목.
- 응답 단건 `{order}`, 목록 `{items,hasMore,limit,offset}`. account, orderId, nonce, market, side, price, quantity, filledQuantity, expiresAt, status, createdAt만 노출; DB 원본 서명은 반환하지 않음. price/quantity/filledQuantity는 문자열 유지.
- 데이터베이스 내부 오류는 500 INTERNAL_ERROR; 보안 오류 상세는 응답에 노출하지 않음. 외부 공개용 접근 제어·rate limit과 비공개 주문 정책은 별도 운영 보안 검토.

## EIP-712 인증된 주문 취소 HTTP 계약 (7회차)

- `POST /api/orders/cancel`: 바디 `{"cancel":{"account":"0x...","nonce":"7","deadline":1790000000},"signature":"0x..."}` 형식. 별도 EIP-712 타입 `CancelOrder(account,nonce,deadline)` 서명을 반드시 검증한다.
- `chainId`, `verifyingContract`은 신뢰된 서버 구성에서만 주입하며, 요청 바디의 최상위 또는 취소 객체 안에 `domain`을 포함하면 400으로 거부한다.
- 정적 경로 `/api/orders/cancel`은 `/api/orders/:orderId`보다 먼저 처리하여 라우팅 충돌을 방지한다. GET 요청은 405 Allow: POST.
- 성공(200) 응답: `{status:"CANCELED",orderExists:boolean,remainingQuantity:string|null}`. 기존 주문이 없다면 유효한 사전 취소로 Nonce tombstone을 기록하고 orderExists=false.
- 잘못된 취소 데이터/만료 deadline은 `400 INVALID_CANCEL`; 잘못된 JSON·불필요한 도메인은 `400 INVALID_ORDER`; 위조·다른 소유자·다른 서명 도메인은 `401 INVALID_CANCEL_SIGNATURE`; 중복 취소·FILLED/EXPIRED 주문은 `409 CANCEL_CONFLICT`; SQL 실패는 `500 INTERNAL_ERROR`.
- Content-Type과 64KiB 본문 크기 제한은 주문 생성 POST와 동일하게 적용한다.
- 기존 `cancelSignedOrder`가 nonce tombstone과 주문 상태를 동일 트랜잭션에서 변경한다. 부분 체결 주문은 체결 수량을 보존한다.
