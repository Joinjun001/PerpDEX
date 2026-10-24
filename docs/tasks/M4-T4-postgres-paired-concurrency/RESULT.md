# M4-T4 RESULT

상태: **실 PostgreSQL 로컬 다중 연결/서버 재시작 QA 성공**. 제품 실체결 기능은 변경/활성화하지 않음.

## 2026-10-24 수행

- 시작: 실제 Git `main` clean, HEAD `7a0a364`, 원격 대비 로컬 16 commits ahead. PROJECT_STATE, ROADMAP 및 M4-T3 SPEC/TODO/RESULT/QA, `position-ledger.ts`, `paired-clearing.ts`, 010/011 마이그레이션과 `postgresTransactionManager` 검토.
- 외부 TCP 비활성화된 개발용 PostgreSQL 15.19 `nobody` 계정/`perpdex_autopilot_test` DB/`/tmp/perpdex-pg-check/socket` 기존 임시 서버 기동. 새 `perp_qa_<12hex>` 전용 스키마에 010/011만 적용. 운영 DB·실체인에 변경하지 않음.
- 신규 `backend/qa/postgres-paired-clearing.test.ts`, `backend/package.json` 수동 `test:postgres-paired` 명령을 구현. market row lock/동시 중복 체결/UNPAIRED 최초 접근/두 계정 SQL 오류 atomic rollback/임시 PG restart 후 영속 데이터 재검증.
- 초기 SQL/QA fixture 오류 `pg_stat_activity` 컬럼 `backend_pid→pid`, `ADA-USD-PERP`의 불일치 baseAsset를 수정하고 **새 스키마로 전체 실 PG seed 9/9 통과**. 해당 오류는 기존 제품 서비스가 아니라 신규 QA 코드 오류임.
- 별도 `pg_ctl restart` + 새로운 Node.js verify 프로세스 **2/2 통과**. 기존 paired receipt/두 계정 이력과 OI 복구/중복 replay 거부 및 새 pair 수용.
- 기존 실제 서비스 code (`paired-clearing.ts` 등)에서 이번 실 PG 테스트로 재현된 동시성/잠금 결함은 없어 의도하지 않은 변경을 하지 않음. M5-T1이 다음 실제 구현 TASK.
- 최종 `npm run build` **통과**, `npm test` **233/233 통과, 실패 0개**. 신규 real PG `seed 9/9 + restart verify 2/2` 통과, `git diff --check` 통과, 사용한 임시 PostgreSQL 서버 종료/소켓 제거 확인.
