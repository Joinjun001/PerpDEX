# M3-T4 QA

상태: **실 PostgreSQL QA seed 8/8, PostgreSQL 서버 재시작 후 verify 1/1, M2 PG 회귀 4/4 통과.** 전체 백엔드 184/184 통과, TypeScript build 통과.

- 실제 PostgreSQL 15.19, `nobody`, `perpdex_autopilot_test`, `inet_server_addr() IS NULL`, `listen_addresses=''`: 외부 TCP 노출·자격증명 사용 없음.
- `perpdex_qa_<12hex>` 고유 schema 생성 및 001/008/009 로컬 적용. 기존 운영 DB/테이블 변경 없음.
- 16-slot connection pool, 동일 nonce 10건 중 1건만 성공·2-leg journal, 분산 예약 10건 중 잔액 가능한 3건만 성공 및 나머지 nonce 재사용 가능 상태, 동시 접수/서명 취소 안전 재시도·8건 동일 취소 중 1건만 성공.
- 특정 예약 operation의 분개 SQL 실패 시 전체 rollback 및 같은 서명 재실행 성공. 특정 해제 operation 실패 시 nonce USED/shadow OPEN/예약금 그대로 유지, 오류 제거 후 서명 취소 한 번만 적용.
- `pg_ctl restart` 이후 별도 Node 프로세스의 영속 order, nonce, locked margin, 2-leg double-entry·balance conservation 및 idempotent transfer replay 검증 성공.
- 기존 M2 PostgreSQL 회귀 4/4 통과. 기존 Foundry 계약은 변경하지 않아 재실행하지 않음. `cd backend && npm run build` 통과; `cd backend && npm test` **184/184 passed, 0 failed**.
- 한계: 실제 스테이징 PG 멀티프로세스 API 서버 경합은 미검증; QA 자체가 `pg.Pool` 여러 연결로 테스트하되 서로 다른 Node 프로세스는 **재시작 복구 순차 단계에서만** 사용. 실계정/실담보/포지션 회계/부분 체결/운영 모니터링/체인 송신 금지.

- `git diff --check` 통과. 개발용 PG 서버는 테스트 종료 후 `pg_ctl stop`으로 정지했고 Unix 소켓이 제거된 상태를 확인함.
