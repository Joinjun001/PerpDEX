# C3-A 계정별 signed 증거금 책임 감사 결과

- 신규 `backend/src/perp/signed-sim-account-reconciliation.ts`:
  `reconcileSignedSimAccount(account, trustedContext, transactions)` 구현.
  SQL 001,008~017의 기존 M3 signed 주문 상태/nonce, OPEN RESERVE/양쪽 posting,
  CANCELED deterministic RELEASE/양쪽 posting, FILLED terminal+ALLOCATE 및
  잔고의 OPEN 책임/체결 완료 책임 커버 여부를 한 트랜잭션에서 점검.
- 반환: `openReservationLiabilityAtomic`,
  `terminalAllocationLiabilityAtomic`,
  `nonSignedReservedAtomic`(인출 가능 아님),
  `unclassifiedPositionMarginAtomic`(인출 가능 아님),
  M4 원가 기반 실현손익 numerator와 mark의 실현/미실현 PnL 표시.
  `feesAndFunding:'NOT_ACCOUNTED'`, `executionAuthorized:false` 고정.
  API/매칭/체결/담보 이동 또는 DB 쓰기를 추가하지 않음.
- 직접 SQL로 취소 상태와 nonce를 위조하지만 RELEASE 누락 시 기존 SQL 015~017 커밋 허용 문제를 실제 테스트로 재현. 감사 함수는 불일치 탐지 후 거부. C3-B에서 DB 커밋 자체 차단 필요.
- 관련 파일/검증 결과는 QA.md 참조. M5-T3-C3 전체 완료 아님.

## 실제 검증 결과

- TypeScript build PASS, 새 집중 테스트 9/9 PASS, 관련 회귀 96/96 PASS.
- 리스크: 주문+nonce CANCELED 직접 SQL 조합에 대한 RELEASE 없는 커밋 허용은 후속 C3-B에서 우선 차단해야 함. 현재 반환값은 의사결정/출금 승인 또는 실자금 회계의 증빙이 아니다.

## 2026-10-24 C3-B 로컬 완료 결과

- 신규 `backend/sql/018_perp_signed_cancel_integrity.sql`: `perp_signed_cancel_receipts` append-only 기록과 composite FK·unique 키, CANCELED/nonce/영속 receipt·RELEASE 이중분개/예약잔고 합계를 COMMIT에서 강제. 주문·nonce·receipt·M3 연산·RESERVED 잔고를 독립적으로 변경해도 관련 취소 영수증을 검증.
- `backend/src/perp/sim-order.ts`: 기존 인증된 사용자 EIP-712 v2 서명 취소를 새로운 취소 영수증(digest/signature, deadline, 주문/nonce, M3 RELEASE ID, 금액) INSERT와 원자 결속. SQL 017 존재·018 미설치 시 fail-closed, 구형 단위테스트 스키마에만 이전 cancellation 경로 호환.
- `backend/scripts/migrate.ts`: 관리자가 직접 실행하는 목록에 018 등록. 영수증 없는 레거시 취소 주문의 마이그레이션은 자동 보정하지 않고 오류로 중단 (이전 내역 검증/관리자 승인 필요).
- `backend/test/perp-signed-account-reconciliation.test.ts`: 과거에 위조 CANCELED commit 허용을 보여주던 케이스가 이제 commit 거부를 검증. 이전 C3-A 감사 경로는 그대로 유지.
- 집중 10/10 PASS, 관련 회귀 106/106 PASS, TypeScript 빌드 및 임시 PGlite 001~018 마이그레이션 PASS. 전체 `npm test` 및 실제 PG 다중 연결/권한·운영 QA 미실행.
- 본 기능은 내부 SIMULATION_ONLY 로컬 기록이다. EIP-712 검증은 TS 내부 서비스, SQL 트리거는 기록 간 일치성/원자성 책임을 진다. DB 신뢰 역할/DDL권한에 대한 보안은 후속 M5-T4로 이관.
- 다음 **C3-C**: 서명 주문의 부분 체결과 다중 예약을 지원하기 전에 단위별 미체결량/예약 차감 및 원자 처리 불변식을 분리하고 안전한 1개 구현 TASK부터 진행한다.

## 2026-10-24 C3-C1 로컬 결과 — 영속 주문 수량 감사

- 신규 SQL `backend/sql/019_perp_signed_order_fill_progress.sql`: SQL 016/017에서 실제 영속 종료된 BUY/SELL fill 영수증과 signed 주문 수량만으로 VIEW 계산. orderId별 total, committedFilled, unfilled, executableRemaining, committedFillCount. 기존 주문 영수증/체결 상태가 FULL-only 불변식과 다르면 SQL COMMIT 거부, 마이그레이션 시 기존 주문 preflight.
- `backend/src/perp/signed-sim-fill-progress.ts`: 동일 트랜잭션의 signed 주문 FOR UPDATE 잠금 후 영속 수량 상태를 검사·반환하는 **읽기 전용** 서비스. `partialFillsAuthorized:false`, `executionAuthorized:false` 고정. PREPARED 후보를 fill 계산에 포함하지 않는다.
- SQL 001~018, signed 주문 admission/취소 및 M3/M4 실제 모의 체결 원장 함수는 변경하지 않음. 기존 signed 원장 테스트 fixture를 SQL 019까지 확장했으며 기존 기능 유지.
- `backend/scripts/migrate.ts`: 관리 전용 SQL 019 추가, 운영/실DB 실행하지 않음.
- **검증**: 신규 focused 9/9 PASS, 관련 11파일 회귀 115/115 PASS, TypeScript build PASS, 별도 빈 PGlite SQL 001~019 적용 PASS, diff check PASS.
- **미구현**: 부분 체결을 위한 잔여 IM 배분·취소/펀딩/수수료/실현 PnL·동시 외부 PostgreSQL 세션 안전성은 C3-C2/C3-C3/M5-T4로 이관. 정책값 임의 결정 없음.

## 2026-10-24 C3-C2-A 실제 구현 결과

**상태: 정책 없는 로컬 SIMULATION_ONLY M3 집계 커밋 검증 완료. C3-C2-B 별도 실 PostgreSQL 경합 QA 대기.**

- 신규 `backend/sql/020_perp_signed_account_margin_conservation.sql`: signed 주문이 있는 계정/시장/담보 단위로 OPEN 예약 IM, FILLED 완료 IM, RESERVED/POSITION 버킷, append-only M3 posting 누적값 및 비서명 M3 잔여분을 COMMIT에서 대조한다. 불완전한 M3 작업 분개, 잘못된 계정 소유자, 버킷 경로 오류, 직접 SQL 잔고 변경을 거부한다.
- SQL 020은 signed order, margin balance, margin operation, margin entry 쓰기에 별도의 DEFERRABLE 트리거 4개를 설치한다. 기존 signed 계정 장부가 불일치하면 관리자 마이그레이션 시 FAIL-CLOSED 사전 점검. `backend/scripts/migrate.ts`는 관리자 수동 실행 목록에 020을 포함하지만 운영 DB에 실행하지 않음.
- 이전 SQL 015~019, EIP-712·nonce·FILLED terminal 영수증·취소 영수증 및 현재 FULL-only 실행 경로에는 기능 변경 없음. 비서명 예약의 남은 금액은 사용·인출 허가로 볼 수 없다.
- 신규 focused **14/14 PASS**, 관련 회귀 **129/129 PASS**, TypeScript build PASS, SQL 001~020 빈 로컬 PGlite 적용 PASS, Git diff check PASS.
- **잔여 작업:** C3-C2-B 실제 로컬 개발 PostgreSQL 독립 세션의 동시 admission·cancel·FULL race, lock ordering 및 role 최소 권한 검증. C3-C3 분할 증거금 할당/부분 체결은 안전 정책·영속 receipt 완성 전 비활성.
