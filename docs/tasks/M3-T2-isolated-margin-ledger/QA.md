# M3-T2 QA

상태: 신규 M3-T2 PGlite **12/12 통과**, 전체 백엔드 **174/174 통과, 실패 0**, TypeScript build 통과.

- 출처 없는 계정/자금의 예약 거부, 테스트 잔액의 available → reserved → position → available 상태 전이, 각 posting의 부호/합계 0 및 계정 총합 보존.
- 동일 operationId 병렬 요청은 단 한 번 분개. 같은 ID+다른 금액/행위/계정은 거부하며 시장·담보 토큰·체인/계정의 격리를 검증.
- 5개 경합 예약 중 잔액이 충분한 2개만 성공; 초과 예약·해제/할당/반환을 거부.
- 숫자 정규형·0/음수/overflow, 위조 주소·시장/무효 action, 2번째 posting에 CHECK 오류 시 작업/잔액/첫 posting 모두 롤백.
- PGlite 디스크 close/reopen 뒤 이중 분개·잔액·멱등 유지. 저장 entry 변조 시 재실행 오류로 차단.
- 제한: 로컬 테스트는 PGlite 실행만 확인. 실제 PostgreSQL 멀티프로세스·운영 DB, Vault 입금 검증·M2 주문/체결 동시 상태 변경·M8 ClearingHouse, 실제 위험 한도/출금 제한은 아직 미검증/미연결.

- `cd backend && npm run build`: 통과. `cd backend && npm test`: **174/174 통과**, 기존 162개 + 신규 12개. `git diff --check`: 통과.
