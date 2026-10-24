# M5-T3-B3-B RESULT

상태: **SIMULATION_ONLY Reduce-only 독립 원장 테이블의 커밋 무결성 검사를 강화한 구현 완료 (권한 분리 자체는 미적용)**.

- 시작 상태: clean `main` `2e0accc`, 원격 대비 23개 로컬 커밋 앞섬; PROJECT_STATE/ROADMAP/B3-A TASK 문서 및 M3/M4/M5 코드·SQL 010~013 확인.
- SQL 014 신규: 예약 원장의 일방적 UPDATE/DELETE, 잘못된 이벤트 INSERT, guard/shadow quota·M4 position 불일치를 독립 트리거와 deferred constraint로 거부. paired M4 이벤트와 비체결 shadow 사용량을 구별하여 B1/B2 정상 트랜잭션 허용.
- `paired-clearing.ts`: guard 포함 모의 체결 시 SQL 013과 SQL 014가 모두 활성화돼 있어야 통과. 임의 DB 설정으로 중요 트리거 누락 시 fail-closed.
- `backend/scripts/migrate.ts`: 014 명시적 관리자 적용 목록에만 추가. 실제 운영/외부 DB 마이그레이션 미실행.
- `ROLE_POLICY.md`: 운영 계정 변경 없이 NOLOGIN schema owner/readonly/limited writer 역할 설계, 감사 항목 및 preflight 절차 정리.
- 기존 B1/B2와 새 B3-B 직접 SQL 조작 **신규 7/7 PGlite PASS**, 전체 백엔드 **329/329 PASS, 0 FAIL**, TypeScript 빌드 PASS, `git diff --check` PASS. 실제 PostgreSQL 서버 실행 파일 부재로 별도 임시 Unix socket·비소유자 DB 역할 QA는 미수행이며 다음 M5-T4 대상. 다음 M5-T3-C 및 개발용 실제 PostgreSQL M5-T4.
