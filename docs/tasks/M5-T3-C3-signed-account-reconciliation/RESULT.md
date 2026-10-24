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
