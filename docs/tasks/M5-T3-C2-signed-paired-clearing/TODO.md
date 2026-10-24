# M5-T3-C2 TODO

- [x] C2-A 공통 TX에 양측 signed v2 주문과 durable M3/M4 증명 결속
- [x] 후보 실행 가격/수량, self-match, 서명 제한·tick/lot·fillId 확인
- [x] 시장·계정 canonical locking, 모든 작업 read-only
- [x] 양측 pre/post 위험평가와 기존 fill ID 차단
- [x] 위조, 취소, 원장 변조, OI·버전·SQL 오류 회귀
- [x] C2-B1 SQL 015: 무연계 M4 포지션·paired fill·M3 ALLOCATE 커밋 차단, signed 상태/nonce/원장 무결성 및 예약 증거금 하한 검사
- [x] C2-B1 PGlite SQL/DML 우회·마이그레이션 재적용·정상 취소 및 무관 계정 회귀
- [x] C2-B2-A SQL 016 PREPARED-only 양측 서명/위험 검증 후보 영속화·append-only/DB 지연 검증 및 로컬 회귀
- [ ] C2-B2-B 양측 M4/OI·M3 할당·영속 주문 소진·terminal 영수증의 하나의 TX/commit-time SQL 제약 및 실패·경합 회귀
- [ ] C3 미체결 예약·부분 체결 및 PnL/fee/funding/취소 경쟁 정산
- [ ] M5-T4 실제 테스트용 PostgreSQL 동시성/역할/재시작 QA
