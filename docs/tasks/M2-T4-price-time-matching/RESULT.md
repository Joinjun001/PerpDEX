# M2-T4 RESULT

상태: Completed (M2-T4-A/B/C/D 로컬 구현·테스트, 운영 PostgreSQL 및 온체인 정산은 후속 승인/환경 및 M2-T5 별도)

## 2026-10-24
- M2-T3의 로컬 테스트 및 재전송 멱등성 구현 완료 이후 시작 준비.
- 선행순위: M2-T4-A 순수 매칭 코어의 가격·시간 우선 동작과 부분 체결.
- 소스 변경 및 매칭 엔진 테스트는 다음 회차에서 구현한다.

## 2026-10-24 — M2-T4-A 가격·시간 우선 순수 매칭 엔진 구현

- 시작 상태: `main`, 미커밋 변경 없음, 기존 커밋 `d03cb08` 확인. PROJECT_STATE/ROADMAP/M2-T4 문서 및 주문 도메인 모델/SQL 스키마 확인.
- `backend/src/matching/engine.ts` 신규 구현:
  - 서버 부여 arrivalSequence에 따른 같은 가격 FIFO, 가격 우선 BUY/SELL 매칭, 메이커 체결가
  - 다른 시장·동일 side·미교차 주문·취소·만료·완전체결 주문 제외
  - BigInt 기반 가격 비교·부분 체결·상태 전이·원본 주문 불변성
  - 중복 ID/접수 순서, 잘못된 시각·상태·정밀 정수 값 검증
  - 반환 결과: fills/주문별 갱신된 filledQuantity·status/추가 체결량 및 잔량
- `backend/test/matching-engine.test.ts` 신규 14개 테스트: 매수·매도 호가 우선, 같은 가격 FIFO, 가격·시간 우선 순서, 무체결, 시장 분리, 취소/만료/완전체결 제외, 부분 체결, BigInt 높은 정밀도, 입력 불변/결정성, 중복 데이터 거부, invalid 값 거부, 120개 결정적 시드 기반 수량 합계 불변식.
- `npm run build` TypeScript 타입 검사 통과, 신규 테스트 `14 passed / 0 failed`. 전체 `npm test` **81 passed / 0 failed** (`--test-concurrency=1`).
- **미구현:** DB에 영속 순서 키 부여 및 원자적 체결/부분 체결 업데이트, 사용자별 자가체결 방지 정책, 실제 시장 API 연결, 정산 및 실서버 검증. 원격 Push·DB 마이그레이션·온체인 정산은 수행하지 않음.

## 2026-10-24 — M2-T4-B PostgreSQL 영속 오더북·원자적 체결 (10회차)

- 시작 Git: `main` clean, 직전 커밋 `bc7d3d9`.
- `backend/sql/004_order_book.sql`: chainId/verifyingContract/market 분리 카운터, 기존 인증 주문을 참조하는 오더북 엔트리 및 고유 admission sequence, 메이커·테이커 복합 외래키를 가진 체결원장 신규 생성. 기존 마이그레이션 001~003은 수정하지 않음.
- `backend/src/matching/postgres-book.ts`:
  - `registerSignedOrderInBook`: EIP-712 인증 후 영속 저장된 주문만 등록. 카운터 행 잠금으로 접수 순서 부여, 중복 등록 시 같은 sequence 반환, 시장별/도메인별 독립 카운터.
  - `matchRegisteredOrder`: 시장 행 잠금으로 같은 시장 매칭 직렬화, ORDER BY admission sequence·주문행 `FOR UPDATE`, 취소·만료 및 늦게 등록된/같은 계정 주문 제외, 순수 코어 재사용.
  - 체결된 메이커/테이커 수량·상태를 DB 원본 상태 조건과 함께 UPDATE, fill 원장 INSERT까지 전부 하나의 트랜잭션에서 원자적 커밋 또는 롤백.
- `backend/scripts/migrate.ts`에 004를 **수동 실행 목록으로만** 추가; 실행·배포하지 않음.
- `backend/test/postgres-matching.test.ts`: 시장별 동시 등록·고유 순서 및 중복 등록 불변, 가격/시간 우선 및 부분 체결 원장, 비교차·미등록·타 시장/자가체결 제외, 취소 완료 메이커 제외, BigInt 정밀도, 체결 INSERT 강제 실패 후 전체 롤백 및 재시도, 동일 테이커 매칭 동시 실행에서 체결 1회, 취소-매칭 경합 일관성, 디스크 DB 재개방 시 순서/잔량/원장 유지 등 **10개** 테스트.
- 매칭 등록/실행은 내부 호출로만 구현. 공개 REST 주문 생성에 자동 연결되지 않았으므로 M2-T4-C에서 인증 도메인·트랜잭션 경계를 통합해야 함.
- 실제 운영 PostgreSQL 멀티 프로세스/연결 및 DB 마이그레이션, 실배포, 온체인 정산, 원격 push는 미실행.

### 10회차 최종 검증 및 후속

- 전체 `npm run build` 타입 검사 성공, `npm test` **91/91 통과**.
- M2-T4-B는 내부 DB 매칭 서비스·PGlite 기준 완료. 아직 주문 접수 REST API와 같은 트랜잭션으로 매칭을 실행하는 기능은 없음.
- 다음 M2-T4-C는 주문 생성 → 검증된 DB 저장 → 시장별 잠금/순서 배정 → 매칭·체결 상태/원장 저장을 안전한 단일 경계로 통합하고, API E2E·취소 경합·재시도·재시작을 검증한다.
- 운영 PostgreSQL, 온체인 정산, 배포, 실제 자격증명/개인키, 원격 Push 작업은 수행하지 않았다.

## 2026-10-24 — M2-T4-C 주문 API 자동 매칭 연동 (11회차)

- 시작: `main` 작업 트리 clean, 직전 로컬 커밋 `29004f2`, ROADMAP 기준 첫 미완료 기능은 M2-T4-C.
- `backend/src/matching/accept-and-match.ts` 신규: 서버 인증 서명 → Nonce → 주문 저장 → 시장 등록 → 순수 엔진 매칭 → 상태·체결원장 저장을 기존 `OrderTransactionManager.withTransaction` 한 번에 연결. 중간 단계 SQL 오류는 전체 rollback.
- `backend/src/matching/postgres-book.ts`: 이미 트랜잭션에 바인딩된 `SqlRunner`를 받는 등록/매칭 메서드를 노출하며, 기존 독립 서비스 호출에는 트랜잭션 래퍼를 유지. 순수 가격·시간 엔진/체결 정책은 변경하지 않음.
- `backend/src/http/create-order-http.ts`: POST 주문 저장 직후 자동 등록·매칭, 생성 응답 201에 최종 status, filledQuantity, remainingQuantity, arrivalSequence, fills 포함. GET/취소/인증 재전송 코드는 기존 의미 유지.
- 기존 HTTP 테스트의 PGlite 초기화에 003/004 스키마를 포함하여 현재 필수 API 마이그레이션을 반영. `backend/test/order-matching-http.test.ts` 신규 **6개 테스트**: HTTP FIFO 부분 체결, 동시 주문 유동성 보존, 동일 계정 자가체결 방지, 취소-체결 경합, 원장 저장 강제 오류 후 신규 주문·Nonce·등록 전부 롤백 및 재시도, 디스크 DB 종료·재시작 후 원장/잔량 보존.
- TypeScript `npm run build` 통과, 신규 API 매칭 테스트 **6/6 통과**, 백엔드 전체 `npm test` **97/97 통과**.
- 스키마 004는 운영 DB에 적용하지 않음. 실 PostgreSQL 다중 연결/멀티프로세스·Foundry·배포/실정산·원격 push 미실행. 기능은 PGlite 테스트 환경 기준 검증됨.
- 다음: M2-T4-D 체결 결과를 M2-T5 온체인 정산에 넘길 입력 계약, 전체 TASK QA/회귀 및 누락된 불변식 검증.

## 2026-10-24 — M2-T4-D 영속 체결 정산 후보 입력 계층 (12회차)

- 시작 Git: `main`, 미커밋 변경 없음, 직전 로컬 커밋 `52f76eb`, 원격 `origin/main`보다 1커밋 앞섬. M2-T4-D가 실제 최상위 미완료.
- `backend/src/settlement/fill-source.ts` 신규: 원장과 인증 주문/오더북 JOIN, 도메인별 정렬·배타적 커서 페이지 조회, 메이커/테이커/매수·매도 계정 정합성, 체결 호가·수량 및 uint256 정밀도 검사, 결정적 `keccak256(abi.encode(chainId, verifyingContract, fillId))` 정산 후보 tradeId 생성.
- 손상된 체결값(가격 불일치·수량 초과·매수·매도 연결 붕괴/참조 누락)을 조용히 누락하지 않고 거부하는 fail-closed 정책. ERC20 자산/정산 수량/지급 방향은 **안전한 경제 정책이 없어 미생성**. 자금 이동 또는 온체인 트랜잭션 없음.
- `backend/test/settlement-fill-source.test.ts`: PGlite/실제 서명·주문·매칭 기반 신규 6개 통합 테스트. 메이커 BUY/SELL 방향·가격, 시장/도메인 격리·커서 재조회, BigInt 초대형 수량, 잘못된 입력 및 변조 원장 거부. `npm run build` 타입 검사 성공, 전체 `npm test` **103/103 통과**.
- 다음: M2-T5를 소규모 TASK로 나누어 시장별 자산/단위/마진 및 지급 정책 검증부터 구현하고, idempotent settlement outbox·on-chain submission/receipt reconciliation 구현을 준비. 라이브 배포·키 사용은 사람 승인 필요.
