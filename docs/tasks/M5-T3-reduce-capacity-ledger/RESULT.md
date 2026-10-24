# M5-T3 RESULT

상태: **A — 순수 모의 Reduce-only 예약·가상 소진·취소 영속 DB 서비스 로컬 구현**. M4 양측 실체결/담보/원장간 위험 게이트 B·C 미완료.

- 시작 저장소 `main` clean, HEAD `94f53ca` (`origin/main` +19), PROJECT_STATE/ROADMAP/M5-T2 SPEC/TODO/QA/RESULT 확인.
- `backend/sql/012_perp_reduce_reservations.sql`: 동일 domain·시장·계정 guard 직렬화 row, 영속 예약 수량/앵커 검증·append-only 소진/취소 이벤트·DB CHECK 및 FK/unique.
- `backend/src/perp/reduce-reservations.ts`: M3 margin bucket/version을 공유잠금, M4 position row를 독점잠금으로 읽고 동일 정책/오라클과 M5-T2 reduceOnly 위험검사. ORDER 예약 및 단순 가상 부분 소진/취소를 한 원장 transaction으로 처리. 상태 변조/중복/버전 드리프트 거부. **실제 자금 이동/포지션 체결/온체인 호출/매칭 API 미연결**.
- `backend/scripts/migrate.ts`: 012를 수동 마이그레이션 목록에 추가, 운영 DB에는 수행하지 않음.
- `backend/test/perp-reduce-reservations.test.ts`: 15개 PGlite 통합/경합/복구/SQL 오류 시나리오. PGlite **15/15 통과**, 전체 backend **291/291 통과, 실패 0개**, TypeScript build 성공.
- 다음 **M5-T3-B**: 이 임시 예약 소진 이벤트를 실제 M4 양측 clearing/포지션+OI 검증과 하나의 원자 DB TX로 묶는 구현 가능 범위부터 진행. 그 전에는 기존 M4 writer를 직접 연결하면 예약 한도를 우회할 위험이 있으므로 금지. 이후 M5-T3-C 및 M5-T4 실제 PG QA.
