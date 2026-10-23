# PerpDEX Backend — 주문 Nonce 저장소

## 구성

- `src/orders/nonce-registry.ts`: PostgreSQL 기반 Nonce 영속 저장/중복 거부/취소/만료 전이
- `src/orders/order-auth.ts`: EIP-712 검증 후 Nonce 예약을 수행하는 인증 경계
- `src/orders/accept-order.ts`: 서명 확인 → Nonce 예약 → 주문 INSERT를 단일 트랜잭션에서 실행하는 서비스
- `src/orders/cancel-signature.ts`: 별도 EIP-712 CancelOrder(account, nonce, deadline) 서명 검증
- `src/orders/cancel-order.ts`: 취소 서명 검증 → Nonce 봉인 → 주문 취소를 단일 트랜잭션에서 실행
- `src/orders/order-transactions.ts`: `pg.Pool.connect()`에서 받은 단일 연결의 BEGIN/COMMIT/ROLLBACK 및 release 관리
- `src/orders/order-store.ts`: 별도 SQL Runner를 주입받는 주문 저장소
- `sql/001_order_nonces.sql`: Nonce 복합 고유키 기반 DB 스키마
- `sql/002_orders.sql`: 주문 테이블 및 Nonce 외래키 기반 스키마
- `scripts/migrate.ts`: 두 스키마를 한 트랜잭션으로 적용하는 수동 실행 스크립트
- `test/nonce-registry.test.ts`, `test/order-transaction.test.ts`: PGlite 영속성·동시 요청·원자적 롤백 테스트

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

실제 마이그레이션은 이 개발 회차에서 수행하지 않았습니다. DB 연결 정보는 저장소나 로그에 남기지 않습니다. 기존 독립 Nonce 기능은 `createPostgresNonceRegistry(pool)`로 사용할 수 있지만, **주문 생성에는** `postgresTransactionManager(pool)`를 만들고 `acceptSignedOrder(order, signature, trustedDomain, manager)`를 호출해야 합니다. 이렇게 해야 `pg.Pool.connect()`로 확보한 같은 연결에서 Nonce 예약과 주문 INSERT가 커밋되거나 함께 롤백됩니다. 향후 M2-T3 REST API에서도 해당 트랜잭션 경계를 유지해야 하며, HTTP API·인증된 취소 경로는 아직 구현되지 않았습니다.

## 주의 사항

- EIP-712 도메인 `chainId/verifyingContract`는 사용자 입력을 그대로 신뢰하지 말고 서버 설정으로 고정해야 합니다.
- Nonce는 `(chainId, verifyingContract, account, nonce)` 고유키로 영구 예약합니다. `USED`, `CANCELED`, `EXPIRED` 상태에서도 행을 삭제하지 않아 Replay가 차단됩니다.
- `PostgresNonceRegistry.cancel()`은 인증을 우회할 수 있는 **내부 함수**입니다. 외부 API에는 노출하지 마세요. 취소 요청은 `cancelSignedOrder(request, signature, trustedDomain, transactionManager)`만 호출하여 EIP-712 소유자 인증을 강제합니다. `CancelOrder(account,nonce,deadline)`의 타입명과 도메인은 주문 서명과 분리되어 서명 목적 혼동을 차단합니다.
- 주문이 없을 때도 유효한 취소 서명으로 Nonce를 사전 차단할 수 있습니다. OPEN/PARTIALLY_FILLED 주문의 기존 체결 수량은 유지하며, FILLED/CANCELED/EXPIRED 주문은 충돌로 거부합니다. 취소 실패 시 주문·Nonce 상태는 함께 롤백됩니다.
- EIP-712 도메인은 HTTP 입력이 아닌 신뢰된 서버 설정으로 고정해야 하며 현재 HTTP REST 엔드포인트는 아직 없습니다.
- 주문 입력 성공 후 DB 커밋과 API 응답 사이에서 네트워크 장애가 나면 재전송을 별도 복구/idempotency 흐름으로 다루어야 합니다. 현재는 중복을 거부합니다.
- 스마트 컨트랙트 지갑(ERC-1271)은 현 EOA 서명 검증 범위 밖입니다.
