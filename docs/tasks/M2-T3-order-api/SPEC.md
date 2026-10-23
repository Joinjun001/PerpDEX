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
