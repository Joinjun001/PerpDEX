# M4-T1 TODO

- [x] A: 안전한 `PerpPosition`/`PerpPositionFill` 타입 및 trusted MarketConfig·mock Snapshot 경계 검사
- [x] A: BigInt exact entry cost 및 uint256/int256 bounded position/PnL, 부호/scale/rounding 명시
- [x] A: LONG/SHORT 진입·평균원가 추가, 부분 종료/전부 종료·cross-zero reversal 및 mark PnL
- [x] A: 예외·precision dust·기본 in-memory version + last fill 방어, 임의 mutation 차단
- [x] A: 신규 유닛 테스트·TypeScript build·백엔드 회귀 및 로컬 Git commit
- [ ] B: M4-T2 영속 Position fill UNIQUE/append-only ledger, 재시작 복구·중복 체결 ID 방지
- [ ] C: M4-T3 모의 양측 체결/시장 Open Interest 합계 및 상태 replay 불변식
- [ ] D: M4-T4 개발용 실제 PostgreSQL 다중 연결/재생/장애 복구 테스트
- [ ] M5 선행: 실거래 증거금 위험/펀딩/오라클/실 자산 정책 및 주문/포지션 원자적 연결
