# PerpDEX Backend — 주문 Nonce 저장소

## 구성

- `src/orders/nonce-registry.ts`: PostgreSQL 기반 Nonce 영속 저장/중복 거부/취소/만료 전이
- `src/orders/order-auth.ts`: EIP-712 검증 후 Nonce 예약을 수행하는 인증 경계
- `sql/001_order_nonces.sql`: 고유키 기반 DB 스키마
- `scripts/migrate.ts`: 별도 명령으로 실행하는 PostgreSQL 스키마 적용 스크립트
- `test/nonce-registry.test.ts`: PGlite(실제 PostgreSQL SQL 엔진 내장) 기반 영속성·동시 요청 테스트

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

실제 마이그레이션은 이 개발 회차에서 수행하지 않았습니다. DB 연결 정보는 저장소나 로그에 남기지 않습니다. `pg.Pool` 객체는 `createPostgresNonceRegistry(pool)` (`src/orders/postgres-adapter.ts`)로 주입할 수 있습니다. 향후 M2-T3 Order API에서 주문 레코드 삽입과 Nonce 소비를 **같은 DB 트랜잭션/연결**에 묶어 부분 저장을 방지해야 합니다.

## 주의 사항

- EIP-712 도메인 `chainId/verifyingContract`는 사용자 입력을 그대로 신뢰하지 말고 서버 설정으로 고정해야 합니다.
- Nonce는 `(chainId, verifyingContract, account, nonce)` 고유키로 영구 예약합니다. `USED`, `CANCELED`, `EXPIRED` 상태에서도 행을 삭제하지 않아 Replay가 차단됩니다.
- `cancel()`은 **내부 함수**입니다. 외부 API로 노출할 때는 서명된 취소 요청 등 소유자 인증이 필수입니다. 인증되지 않은 사용자가 다른 계정의 Nonce를 취소할 수 있게 해서는 안 됩니다.
- 주문 입력 성공 후 DB 커밋과 API 응답 사이에서 네트워크 장애가 나면 재전송을 별도 복구/idempotency 흐름으로 다루어야 합니다. 현재는 중복을 거부합니다.
- 스마트 컨트랙트 지갑(ERC-1271)은 현 EOA 서명 검증 범위 밖입니다.
