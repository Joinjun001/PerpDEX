# M4-T4 QA

- 실제 PostgreSQL 15.19, Unix socket 전용, DB=`perpdex_autopilot_test`, user=`nobody`, `inet_server_addr() IS NULL`, `listen_addresses=''`: 외부 TCP/RPC/자격증명 사용 안 함.
- 개발용 독립 `perp_qa_<12hex>` 스키마 생성, 순서대로 SQL 010/011 적용. 기존 운영 마이그레이션/DB 변경 금지.
- `PERPDEX_TEST_PG_PHASE=seed`: **9/9 통과**. pool 16 슬롯, 같은 ID 12건 중 1 성공, 다른 ID 동일 version 12건 중 1 성공, 독립 쌍 모두 성공 및 OI 보존, stale 상대 version fail-closed, 단일/양측 최초 생성 경합 1건 성공, 특정 SELL SQL 실패 및 최종 paired receipt 실패 시 원자 rollback/안전 재시도, 재시작 전 durable OI 검증.
- `pg_ctl restart` 이후 `PERPDEX_TEST_PG_PHASE=verify`: **2/2 통과**, 5개 최초 paired receipt 및 2개 account journal 각각 재확인, LONG=SHORT와 tracked OI 일치, 과거 fill ID replay 거부, 신규 fill OI 증가.
- 처음 실행에서 테스트 fixture 컬럼명/시장 이름 오류로 seed 7/9였으나 신규 QA 코드 수정 후 새 독립 스키마에서 seed 9/9와 restart verify 2/2로 재검증. 기존 실제 서비스의 재현된 버그 없음.
- `cd backend && npm run build`: **통과**, 전체 `npm test`: **233/233 passed, 0 failed**. 신규 실제 PostgreSQL 옵트인 9/9 + 별도 서버 재시작 2/2 통과. `git diff --check`: 통과.
- 실 PostgreSQL 단일 노드/단일 프로세스 서버의 pool 경합만 검증; 복제본·failover/네트워크·운영 부하·실자산 Vault·funding/청산·위험 정책 및 운영 마이그레이션은 **미검증**.

- 검증에 사용한 `/tmp/perpdex-pg-check` 임시 PostgreSQL 서버는 `pg_ctl stop -w`로 종료한 뒤 Unix 소켓 제거를 확인함. 운영 DB/RPC/자금 이동/push 수행하지 않음.
