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
