# M5-T3 QA

- PGlite 신규 **15/15 통과**, 전체 backend **291/291 통과 (실패 0개)**, TypeScript build 통과.
- 테스트용 저장 M4 position과 명시적으로 시드한 M3 AVAILABLE/RESERVED/POSITION 3개 버킷 없이는 예약 불허. 새 자금·포지션 행 생성 금지.
- 1 BTC LONG에서 0.4 + 0.5 예약 가능, 추가 0.2 거부. 15개 0.4 BTC 동시 예약에서 정확히 두 건만 성공.
- 누적 부분 가상 소진은 guard consumed에 영속 반영되어 남은 quota 재증가 없음. 취소 시 아직 미소진 예약량만 복원하고 이벤트 역사와 `requested = remaining + consumed + cancelled` CHECK 보존.
- 같은 order ID 동일 입력은 재조회, 다른 입력은 오류. 동일 consume event ID 중복/다른 quantity·order에 재사용 거부, 취소 후 새 event ID 재취소 거부; cancel vs consume 동시 경쟁에서 한쪽만 성공.
- Oracle sequence 또는 M3 margin version 변동이면 과거 예약 소진 거부; position version 변동은 신규 예약/소진 fail-closed. 유효한 trusted oracle + 원포지션이면 margin/가격 변동 후에도 미소진 취소 가능.
- 강제 이벤트 insert SQL constraint 실패에서 주문 잔량/guard 누적 consumed 롤백, constraint 해제 후 같은 이벤트 재시도 성공.
- DB 이력 UPDATE/DELETE 트리거 거부, PGlite close/reopen 후 consumed/예약/취소/중복 replay fencing 보존. LONG/SHORT 및 계정별 독립 스코프.
- **미검증:** 실제 PostgreSQL 다중 서버 연결(M5-T4), 기존 M4 paired clearing과 같은 transaction 체결·수량 소진(M5-T3-B), 주문 승인/유료 자산·운영 정책·금전 이중분개(M5-T3-C). 현재 CONSUME는 실제 position fill이나 정산이 아니므로 실주문 체결 주장 금지.

- `cd backend && npm run build`: 통과. `cd backend && npm test`: **291/291**, 실패 0개 (기존 276 + 신규 15). `git diff --check`: 통과.
