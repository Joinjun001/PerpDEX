# M4-T2 RESULT

상태: **SIMULATION_ONLY 영속 포지션 적용/체결 ID 중복 차단 로컬 구현 완료**, 실제 자금·거래 경로 미연결.

## 2026-10-24 수행

- 시작 Git: main clean, 직전 `d846edc` (`origin/main` 대비 14개 로컬 commit ahead), M4-T1 SPEC·TODO·QA·RESULT 및 M3/M4 ROADMAP·PROJECT_STATE/transaction manager 재확인.
- `backend/sql/010_perp_position_ledger.sql`: account+fillId 영속 PRIMARY KEY, 계정별 market/담보별 버전 UNIQUE, 스냅샷 CHECK/FK, 이력 append-only trigger. 서로 다른 두 계정 동일 fill ID 허용.
- `backend/src/perp/position-ledger.ts`: M4-T1 순수 engine 재사용, in-transaction row lock → nonconsecutive replay check → append-only journal → version-CAS snapshot으로 DB 원자 적용. Read-only 계정 조회/정책 스코프·마지막 journal integrity 검사 추가. 무자금 환경도 독립 동작.
- `backend/test/perp-position-ledger.test.ts`: 신규 PGlite 15개 정상·경계·동시성·실패 rollback·disk restart 시나리오 통과. 기존 실제 M2 매칭·HTTP API나 M3 영속 담보 원장과 연동하지 않고 독립 QA.
- `backend/scripts/migrate.ts`: 관리자 수동 010 순서 등록만 변경. 운영 DB 실행 없음.
- 다음 독립 작업: **M4-T3 — 양측 모의 체결의 원자적 동시 적용 및 시장 Open Interest 불변식**. M4-T4 개발용 실제 PostgreSQL 연결 시험은 후속.
- `npm run build` 통과, 전체 `npm test` **218/218 통과, 실패 0개** (신규 15개), `npm run build` 및 diff 검사 통과.
