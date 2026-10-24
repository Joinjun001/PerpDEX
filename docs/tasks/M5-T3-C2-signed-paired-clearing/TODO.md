# M5-T3-C2 TODO

- [x] C2-A 공통 TX에 양측 signed v2 주문과 durable M3/M4 증명 결속
- [x] 후보 실행 가격/수량, self-match, 서명 제한·tick/lot·fillId 확인
- [x] 시장·계정 canonical locking, 모든 작업 read-only
- [x] 양측 pre/post 위험평가와 기존 fill ID 차단
- [x] 위조, 취소, 원장 변조, OI·버전·SQL 오류 회귀
- [ ] C2-B 양측 M4/OI·M3 할당·영속 주문 소진을 1TX 내 기록하고 SQL 제약 구현
- [ ] C3 미체결 예약·부분 체결 및 PnL/fee/funding/취소 경쟁 정산
- [ ] M5-T4 실제 테스트용 PostgreSQL 동시성/역할/재시작 QA
