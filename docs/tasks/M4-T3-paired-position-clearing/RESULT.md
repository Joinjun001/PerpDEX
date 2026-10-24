# M4-T3 RESULT

상태: SIMULATION_ONLY 양측 clearing 및 시장 OI 영속 원자성 로컬 구현. 운영 실거래 미연결.

- 시작 HEAD `1609600`, main clean, origin/main 대비 로컬 15커밋 앞섬. M4-T2 SPEC/TODO/RESULT/QA와 실제 SQL, 트랜잭션 매니저, 포지션 엔진을 검토.
- `backend/src/perp/position-ledger.ts`: DB 내부 체결 처리 함수 추출(중첩 트랜잭션 금지), PAIR 시장에서 단일 계정 적용 거부. UNPAIRED 시장 최초 삽입도 같은 마켓 PK/락을 획득하도록 보강.
- `backend/sql/011_perp_pair_clearing.sql`: 시장별 OI/모드·immutable paired fill, M4-T2 buyer/seller application FK.
- `backend/src/perp/paired-clearing.ts`: 양측 거래 ID, 가격/수량/정책·자금 단위 일치와 롱/숏 포지션 OI 보존 검증. 한쪽 실패하면 두 계정·시장 OI·영수증을 모두 롤백.
- `backend/test/perp-paired-clearing.test.ts`: PGlite 15개 신규 시나리오, 정상 OI 변화·자전거래 금지·동시 replay·독립 양측 SQL 오류·시장 모드/변조/디스크 재시작 복구.
- `backend/scripts/migrate.ts`: 011 SQL을 **수동 적용 목록**에만 추가. 실제 운영 PostgreSQL/자산/배포/체인 송신 실행하지 않음.
- 다음 M4-T4 실제 임시 PostgreSQL 다중 커넥션 및 재시작 QA. M5 정책 미승인·M8 ClearingHouse/금전 회계 미구현.

- 최종 신규 PGlite **15/15** 및 전체 백엔드 **233/233** 통과, 실패 0개, TypeScript 빌드 성공. 실 PostgreSQL 010~011 다중 연결 검증은 M4-T4로 이관.
