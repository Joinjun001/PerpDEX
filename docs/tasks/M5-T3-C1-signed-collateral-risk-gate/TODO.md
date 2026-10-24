# M5-T3-C1 TODO

- [x] 시작 Git·PROJECT_STATE·ROADMAP·M5-T3-B3-B 문서 및 M3/M4/M5 원장 코드·SQL 001/008~014 확인
- [x] M3 영속 인증 정책/서명/IM 계산을 공통 함수로 안전하게 재사용
- [x] 기존 `PAIRED` OI → 계정 guard → position → M3 OPEN order·nonce → margin 버킷·분개를 단일 TX 검증
- [x] Nonce/서명·정책 revision/hash/Mock Oracle·계정/도메인 버전·M3 RESERVE posting 및 3버킷/버전·M4 position/OI fail-closed
- [x] M5 pre-trade BEFORE/AFTER BigInt risk result만 반환, 실제 실행/버킷 이동/DB write 없음
- [x] PGlite 정상·위조/변조·중복 nonce·동시·잔고 부족·SQL 오류·포지션 버전/OI·DB close/reopen 시나리오 및 전체 회귀
- [ ] M5-T3-C2: 서명된 양측 모의 개설 주문→정확한 pairing/의무 증거금 + M4 position/OI·ID 일관성 원자 결속 및 안전한 부분 예약 상태
- [ ] M5-T3-C3: M3 reserved↔position·부분 미체결/취소·PnL/fees·funding·출금 정책 자금 회계 정산 검증
- [ ] M5-T4: 실제 PostgreSQL 다중 연결/role 권한·시장 동시성/교착·재시작 QA
