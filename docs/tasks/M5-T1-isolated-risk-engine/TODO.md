# M5-T1 TODO

- [x] A: 실제 Git/PROJECT_STATE/ROADMAP 및 M4-T4 SPEC·TODO·QA·RESULT 검토
- [x] A: trusted MarketConfig/mock PriceSnapshot/기존 M4 Position/M3 MarginBalances 재사용, scope·bucket 검증
- [x] A: BigInt mark notional/IM/MM (보수적 올림), realized/unrealized PnL (손실 반올림), equity/유효 레버리지/보수적 상태 분류
- [x] A: FLAT·부족·유지 미달·음수 equity·위조 oracle/정책·정밀도/overflow 예외, 순수 local-only 실행 제한
- [x] A: 신규 단위 테스트·TypeScript build·전체 backend 회귀 및 로컬 커밋
- [x] B — M5-T2: 주문 방향·reduce-only/포지션 감소 우선 판정 및 체결 후 위험 시뮬레이션 (신규 22개 테스트, 실제 주문/API 미연결)
- [ ] C — M5-T3: 위험검사와 M3 예약·M4 체결 영속 트랜잭션 원자성 (정식 입금/실자산/승인 이전엔 SIMULATION_ONLY)
- [ ] D — M5-T4: 개발용 실제 PostgreSQL 경합/오라클 버전/복구 QA
- [ ] M6/M7/M8: funding/청산/보험/온체인 출금 안전 및 실거래 인수 (별도 승인 필수)
