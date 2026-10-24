# M4-T3 QA

상태: PGlite 신규 **15/15 통과**, 전체 백엔드 **233/233 통과, 실패 0개**, `npm run build` 및 `git diff --check` 통과.

- 초기 OI 0, 신규 롱/숏 동시 진입, 동일 방향 추가, 반대 방향 부분·전량 종료, 양방향 반전, 매 거래 후 LONG 합계 = SHORT 절대값 합계, 저장 OI 일치.
- 동일 거래 ID의 양측 계정별 append-only 이력 및 immutable 공통 receipt, 서로 다른 상대방·수량으로 재사용하거나 비연속 replay하는 행위 거부.
- 한쪽 seller journal 또는 최종 pair receipt의 강제 SQL 오류 시 이전 buyer/seller, 시장 OI, 두 journal, receipt 모두 rollback 후 원래 요청 정상 재시도.
- 동시 동일 거래 8회에서 1회 성공, 한쪽 오래된 expectedVersion/자전거래/invalid policy/오라클/수량 거부.
- 기존 단독 원장의 불균형 포지션·시장 모드 UNPAIRED/PAIRED 혼용·tracked OI/단일 snapshot 변조 시 fail-closed. 양측 기록에만 공통 market row lock 사용.
- PGlite close/reopen 이후 동일 ID 거부·원본 시장 OI/양쪽 스냅샷 복구, 새 체결 영속 업데이트.
- **미검증:** 실제 PostgreSQL 여러 연결/잠금·서버 재시작(M4-T4 예정), 운영 DB 변경/정책 승인, 실제 양측 주문 자금·보험·청산/체인 검증(M5~M8 이후).

- 최종 `cd backend && npm run build`: 성공. `cd backend && npm test`: **233 tests, 233 pass, 0 fail** (기존 218개 + 신규 15개). 011 SQL 개정 후 별도 신규 targeted 15/15 통과.
