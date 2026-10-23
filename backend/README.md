# PerpDEX Backend — 주문 인증 및 REST API

## 구성

- `src/orders/nonce-registry.ts`: PostgreSQL 기반 Nonce 영속 저장/중복 거부/취소/만료 전이
- `src/orders/order-auth.ts`: EIP-712 검증 후 Nonce 예약을 수행하는 인증 경계
- `src/http/create-order-http.ts`: 서명 주문 생성 POST API, JSON 입력 제한, HTTP 오류 매핑
- `src/http/server.ts`: 명시적 실행 시에만 로컬 바인딩하는 PostgreSQL 연결 서버
- `src/orders/accept-order.ts`: 서명 확인 → Nonce 예약 → 주문 INSERT를 단일 트랜잭션에서 실행하는 서비스
- `src/orders/cancel-signature.ts`: 별도 EIP-712 CancelOrder(account, nonce, deadline) 서명 검증
- `src/orders/cancel-order.ts`: 취소 서명 검증 → Nonce 봉인 → 주문 취소를 단일 트랜잭션에서 실행
- `src/orders/order-transactions.ts`: `pg.Pool.connect()`에서 받은 단일 연결의 BEGIN/COMMIT/ROLLBACK 및 release 관리
- `src/orders/order-store.ts`: 별도 SQL Runner를 주입받는 주문 저장소
- `sql/001_order_nonces.sql`: Nonce 복합 고유키 기반 DB 스키마
- `sql/003_order_cancel_receipts.sql`: 서명된 취소 요청의 영속적 멱등성 증거 (신규 마이그레이션)
- `src/orders/idempotency.ts`: 원본 서명·주문 비교 및 커밋된 취소 영수증 조회
- `sql/002_orders.sql`: 주문 테이블 및 Nonce 외래키 기반 스키마
- `scripts/migrate.ts`: 두 스키마를 한 트랜잭션으로 적용하는 수동 실행 스크립트
- `test/nonce-registry.test.ts`, `test/order-transaction.test.ts`: PGlite 영속성·동시 요청·원자적 롤백 테스트
- `test/order-http.test.ts`: 실제 localhost HTTP + PGlite 주문 생성 통합 검증

## 개발 검증

```bash
npm ci
npm test
npm run build
```

테스트는 외부 PostgreSQL 서버 연결 없이 실행됩니다. PGlite가 PostgreSQL 고유 제약과 `ON CONFLICT` 의미를 실행하며, 일시적인 디렉터리 DB를 닫았다 다시 열어 Nonce가 살아 있는지 확인합니다. 다만 운영 서버 PostgreSQL 연결 풀, 다중 프로세스 및 네트워크 환경의 통합 검증까지 의미하지는 않습니다.

## 운영 PostgreSQL 적용 (별도 수동 단계)

서버의 PostgreSQL에 데이터베이스와 최소 권한 사용자 계정을 준비하고 환경변수 `DATABASE_URL`을 전달한 뒤 명시적으로 다음 명령을 실행합니다.

```bash
npm run db:migrate
```

실제 마이그레이션은 이 개발 회차에서 수행하지 않았습니다. DB 연결 정보는 저장소나 로그에 남기지 않습니다. 기존 독립 Nonce 기능은 `createPostgresNonceRegistry(pool)`로 사용할 수 있지만, **주문 생성에는** `postgresTransactionManager(pool)`를 만들고 `acceptSignedOrder(order, signature, trustedDomain, manager)`를 호출해야 합니다. 이렇게 해야 `pg.Pool.connect()`로 확보한 같은 연결에서 Nonce 예약과 주문 INSERT가 커밋되거나 함께 롤백됩니다. M2-T3의 `POST /api/orders`도 같은 트랜잭션 매니저를 사용합니다. 주문 조회 및 EIP-712 취소 HTTP 엔드포인트도 구현했습니다.

## 주의 사항

- EIP-712 도메인 `chainId/verifyingContract`는 사용자 입력을 그대로 신뢰하지 말고 서버 설정으로 고정해야 합니다.
- Nonce는 `(chainId, verifyingContract, account, nonce)` 고유키로 영구 예약합니다. `USED`, `CANCELED`, `EXPIRED` 상태에서도 행을 삭제하지 않아 Replay가 차단됩니다.
- `PostgresNonceRegistry.cancel()`은 인증을 우회할 수 있는 **내부 함수**입니다. 외부 API에는 노출하지 마세요. 취소 요청은 `cancelSignedOrder(request, signature, trustedDomain, transactionManager)`만 호출하여 EIP-712 소유자 인증을 강제합니다. `CancelOrder(account,nonce,deadline)`의 타입명과 도메인은 주문 서명과 분리되어 서명 목적 혼동을 차단합니다.
- 주문이 없을 때도 유효한 취소 서명으로 Nonce를 사전 차단할 수 있습니다. OPEN/PARTIALLY_FILLED 주문의 기존 체결 수량은 유지하며, FILLED/CANCELED/EXPIRED 주문은 충돌로 거부합니다. 취소 실패 시 주문·Nonce 상태는 함께 롤백됩니다.
- EIP-712 도메인은 HTTP 입력이 아닌 신뢰된 서버 설정으로 고정합니다. 현재 HTTP API는 `POST /api/orders`만 지원하고, 서명이 검증된 주문을 생성합니다.
- HTTP 응답을 받지 못한 경우라도 동일하고 유효한 서명·주문/취소 요청의 재전송은 DB에 커밋된 원본 증거와 대조해 멱등성 응답을 반환합니다. 내용/서명이 다르면 409, 위조 서명은 401입니다. 서명 유효기간이 지난 재전송은 재인증되지 않으므로 400으로 거부합니다.
- 스마트 컨트랙트 지갑(ERC-1271)은 현 EOA 서명 검증 범위 밖입니다.

## M2-T3 주문 생성 REST API (개발 구현)

`POST /api/orders`를 지원합니다. JSON 요청:

```json
{
  "order": {
    "account": "0x1111111111111111111111111111111111111111",
    "market": "ETH-USDC",
    "side": "BUY",
    "price": "1000",
    "quantity": "100",
    "nonce": "1",
    "expiresAt": 1800000000
  },
  "signature": "0x<EOA가 EIP-712 Order에 서명한 65/64바이트 서명>"
}
```

위 데이터는 **형식 설명 예시**이며 실제 유효한 서명이 아닙니다. 현재 시각 이후의 `expiresAt`을 사용해야 합니다.

- 정상 생성: HTTP 201 `{orderId, status:"OPEN", order}`; DB의 주문 레코드와 Nonce는 원자적으로 저장됩니다.
- 잘못된 요청/만료 주문: 400; 위조 서명: 401; 사용된 Nonce: 409.
- JSON 외 Content-Type: 415, 64KiB 초과: 413, 지원하지 않는 메서드: 405.
- DB 내부 오류: 500. 클라이언트 응답에 SQL 에러나 DB 연결 정보는 포함하지 않습니다.
- `chainId`와 `verifyingContract`는 **서버 시작 시점 설정**으로 고정됩니다. HTTP 요청에 `domain`을 넣으면 거부합니다.

이 개발 단계에서는 운영 PostgreSQL을 실행하거나 배포하지 않았습니다. 운영자가 별도로 테스트 서버를 구성할 경우 `DATABASE_URL`, `PERPDEX_CHAIN_ID`, `PERPDEX_VERIFYING_CONTRACT`을 제공하고 **DB 마이그레이션을 별도 승인·실행한 후** `npm start`로 시작합니다. 기본 바인딩은 `127.0.0.1:8080`이며 `PORT`로 포트를 지정할 수 있습니다. 공개 접근/프록시/인증·rate limit 등 운영 구성은 별도 보안 검토가 필요합니다.

현 단계에서는 `npm test`가 외부 DB 없이 localhost 임시 포트 + PGlite를 이용해 HTTP 경계부터 SQL 저장까지 검증합니다. 주문 생성·조회·취소 및 재전송 멱등성의 로컬 테스트를 수행했습니다. 운영 DB 다중 프로세스 검증은 미완료입니다.

## M2-T3 주문 조회 API (6회차)

서버가 설정한 `PERPDEX_CHAIN_ID`와 `PERPDEX_VERIFYING_CONTRACT`로 읽기 범위를 제한합니다. 클라이언트에서 체인·컨트랙트를 지정할 수 없으며, DB 조회에는 파라미터 바인딩을 사용합니다.

- `GET /api/orders/:orderId` — 32바이트 hex 주문 ID로 단건 조회. 정상 `200 {order}`, 미존재 `404 ORDER_NOT_FOUND`, 잘못된 형식 `400 INVALID_QUERY`.
- `GET /api/orders?market=ETH-USDC&status=OPEN&limit=20&offset=0` — 주문 목록. `market`은 대문자로 정규화하고 지정 가능한 `status`는 OPEN/PARTIALLY_FILLED/FILLED/CANCELED/EXPIRED입니다.
- `limit` 기본값은 20, 허용 범위는 1~50. `offset` 기본값 0, 허용 범위는 0~10000. 중복·알 수 없는 쿼리 파라미터와 범위 밖 값은 `400 INVALID_QUERY`로 거부합니다.
- 정렬은 `created_at DESC, account ASC, nonce ASC` 순서이며 서버 측 `LIMIT + 1` 조회로 `hasMore`를 반환합니다.
- 응답 목록 형식은 `{items,hasMore,limit,offset}`입니다. 가격·수량·체결수량은 손실 방지를 위해 **문자열**로 반환합니다.
- 단건·목록 모두 서명 원문, DB 접속 정보 또는 서버 내부 필드를 SELECT/반환하지 않습니다. **계정 주소와 주문 조건은 공개 주문 정보**로 설계한 상태이며, 비공개 주문이 필요하면 실제 외부 공개 전에 접근 제어 정책을 다시 검토해야 합니다.
- Offset 페이지네이션은 요청 도중 신규 주문이 들어오면 다른 페이지에서 중복·누락 가능성이 있습니다. 현재 API 순서는 같은 스냅샷에서 결정적이며, 향후 활성 주문 변화가 많은 환경에는 커서 기반 페이지네이션을 별도로 검토합니다.
- PGlite + localhost HTTP 통합 검증 수행. 실제 운영 PostgreSQL/다중 연결 API 검증은 미완료입니다.

## 테스트 안정화

PGlite는 파일별로 독립 PostgreSQL 엔진을 초기화하므로, 리소스가 제한된 홈서버에서 모든 테스트 파일을 동시에 실행하면 프로세스가 SIGKILL로 종료될 수 있습니다. `npm test`는 `--test-concurrency=1`로 **테스트 파일을 순차 실행**하도록 설정했습니다. 각 파일 내부에서 수행하는 동시 요청·Nonce 경합 테스트는 그대로 유지됩니다.

## M2-T3 인증된 주문 취소 API (7회차)

`POST /api/orders/cancel`을 추가했습니다. 예시 요청:

```json
{
  "cancel": {
    "account": "0x1111111111111111111111111111111111111111",
    "nonce": "7",
    "deadline": 1800000000
  },
  "signature": "0x<CancelOrder typed-data에 대한 지갑 서명>"
}
```

이 서명은 주문 생성용 `Order`와 구분되는 `CancelOrder` EIP-712 타입의 서명이며 **예시 값만으로 유효한 취소 요청을 만들 수는 없습니다.** chainId와 verifyingContract는 클라이언트 요청에서 지정할 수 없고 서버 구성을 사용합니다.

정상 취소 시 HTTP 200 `{status:"CANCELED",orderExists:true,remainingQuantity:"60"}`처럼 반환합니다. 주문 생성 이전 서명 취소는 `orderExists:false, remainingQuantity:null`을 반환하여 해당 nonce를 영구 예약합니다. 잘못된 취소 요청·기한 만료 400, 위조 서명 401, **원본과 동일한 유효 취소 요청은 200 재전송 응답**, 다른 서명·다른 취소 의사·완료 주문은 409, DB 내부 문제는 상세가 제거된 500으로 처리합니다. 이미 체결된 수량은 변경하지 않습니다.

HTTP 경로는 `/api/orders/cancel`을 정적 라우트로 먼저 인식하여 `/api/orders/:orderId`와 구분합니다. 본문에 서명 도메인을 끼워 넣으면 400으로 거부합니다.

**미완료:** 운영 PostgreSQL 멀티프로세스 검증, 실제 외부 공개용 접근 제어·rate limit 등 보호 정책과 배포.

## M2-T3 재전송(Idempotency) 계약

- **주문 생성** 최초 `201` → 정확히 같은 유효 EIP-712 주문 서명·정규화된 주문 정보·서명 도메인 재전송이면 `200`과 `replayed:true`. 기존 주문의 **현재 저장 상태**를 반환합니다. 같은 Nonce라도 내용·서명이 다르거나 DB에 동일한 원본이 없으면 `409 NONCE_CONFLICT`.
- **주문 취소** 최초 `200` → `order_cancel_receipts` 테이블에 원본 `account,nonce,deadline,signature` 및 승인 결과가 보존되어 있고 현재 재전송 서명과 정확히 일치하면 `200,replayed:true`. 새 취소 서명·deadline 변경/영수증 없음은 `409 CANCEL_CONFLICT`. 종료 주문의 다른 취소를 성공으로 간주하지 않습니다.
- 주문·취소의 **만료된 서명 요청**은 기존 검증 정책대로 `400`; 만료 후 복구를 위해 인증을 생략하지 않습니다.
- 이 기능을 실제 PostgreSQL에 사용하려면 운영자가 별도 승인 후 `npm run db:migrate`로 **003 마이그레이션**을 먼저 적용해야 합니다. 과거 003 도입 이전에 성공한 취소에는 영수증이 없으므로 재전송을 성공으로 추정하지 않습니다.
- 이 개발 실행에서는 실제 운영 DB 마이그레이션과 배포를 수행하지 않았습니다. `npm test`는 신규 PGlite/loopback HTTP 테스트 및 기존 회귀를 포함합니다.
