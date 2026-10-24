# M5-T3-B TODO

- [x] B1 M4/M5/T3-A 현재 로컬 소스, 트랜잭션·잠금 순서 검토
- [x] B1 M4 paired clearing 동일 SqlRunner 내부 함수로 분리, 기존 public wrapper 유지
- [x] B1 reduce guard 계정 우회하는 기존 paired path 및 단일 계정 M4 public writer를 reservation-sensitive fail-closed 변경
- [x] B1 기존 PAIRED 시장에서 market lock→두 account guard→position→margin 순서 고정
- [x] B1 양측 FULL reduce-only 예약 동일 ID/가격·수량의 포지션·OI·영수증/소진 이벤트 1TX 저장
- [x] B1 신규 PGlite 정상/동시 중복/한쪽 오류/구 예약/재시작 QA 및 전체 backend/build 확인
- [x] B2 양측 reduce-only 다중 OPEN 예약과 부분 체결·연속 소진·버전/위험 화해 (단, 일반 개설 매칭은 M5-T3-C로 별도)
- [ ] B3 low-level M4 writer/모든 배포 가능한 worker의 우회 차단 및 DB policy-hardening
- [ ] M5-T3-C M3 증거금 변경·신뢰 체결 출처·signed simulated orders 상태·수수료/PnL 원자 통합
- [ ] M5-T4 실제 임시 PostgreSQL 15 다중 connection/load/restart/lock/rollback 검증
