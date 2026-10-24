# M3-T4 RESULT

상태: **실 PostgreSQL 15 로컬 동시성·재시작 QA 완료, 운영/실거래 미검증**.

## 2026-10-24 주요 결과

- 시작 `main`, HEAD `8e3cf66`, clean (원격 대비 12 commits ahead). ROADMAP의 M3-T4는 미완료, M3-T3-A 로컬 구현은 완료, M3-T3-B의 실 체결·위험 연결은 대기 중.
- `backend/qa/postgres-perp-sim.test.ts`: 신규 **실 PostgreSQL opt-in** QA. 고정 전용 DB/사용자/Unix 소켓/고유 schema 인수 조건을 검사하고, 다른 DB 연결 시 즉시 중단.
- `backend/package.json`: `npm run test:postgres-perp` 추가. 기본 `npm test`에는 real PG QA를 포함하지 않음(테스트 DB를 자동 생성하거나 운영 DB에 접속하지 않음).
- PostgreSQL 15.19 패키지는 기존 `/tmp/perpdex-pg-packages/`에 추출한 바이너리를 재사용. `listen_addresses=''`의 OS 사용자 `nobody` 사설 Unix 소켓 서버만 다시 가동.
- `001/008/009` 별도 스키마 마이그레이션, 실 16-connection PG Pool의 10회 동일 Nonce 및 10개 서로 다른 주문/잔액경합, 접수↔취소/8회 중복취소, 예약/해제 강제 SQL 오류 롤백 및 정상 복구, 실 PG 재시작 뒤 별도 프로세스 상태 복원·분개 보존·멱등 재생 **seed 8/8 + restart verify 1/1 통과**.
- 기존 M2 실제 PostgreSQL QA **4/4 통과**. 이 회차에서 재현된 운영 소스 버그는 없었으므로 제품 서비스를 임의 변경하지 않고 재현 가능한 QA 테스트만 추가.
- 실제 체인/지갑키/운영 DB/체결/송금/배포/push 미수행. 테스트용 ephemeral signer와 opening balance fixture는 오직 개발 검증으로만 사용함.
- `npm run build` **통과**, 백엔드 전체 `npm test` **184/184 passed, 0 failed**. 신규 opt-in 실 PostgreSQL QA 8+1개, 기존 PG QA 4개 통과. `git diff --check` 통과. 테스트 서버는 검증 후 안전 종료.
