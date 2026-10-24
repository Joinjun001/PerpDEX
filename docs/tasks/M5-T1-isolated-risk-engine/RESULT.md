# M5-T1 RESULT

상태: **A SIMULATION_ONLY 초기·유지 증거금·레버리지/Equity 순수 위험평가 로컬 구현**. M5-T2 실제 모의 주문 게이트 후속.

## 2026-10-24 작업

- 시작 상태: `main` clean, HEAD `823b609` (`origin/main` 대비 +17 로컬 커밋), ROADMAP·PROJECT_STATE·M4-T4 TASK 4종 및 M3/M4 source 확인.
- `backend/src/perp/risk-engine.ts`: trusted policy/oracle, M4 signed One-way position, M3 available/reserved/position margin 구성을 검증한 뒤 **순수** BigInt 기반 `notional/IM/MM/equity/effective leverage/free-collateral` 및 위험상태 계산. 실현 PnL 미게시 조건 `realizedPnlBookedAtomic:'0'` 강제, 이중 계상 방지. 재평가/주문 승인·자금 이동·청산은 일절 수행하지 않으며 리포트의 `executionAuthorized` 상수 `false`.
- `backend/test/perp-risk-engine.test.ts`: 신규 **21개** 정상·경계·위조·오버플로 테스트 통과.
- 신뢰한 위험 비율은 현재 테스트 fixture 값뿐; 운영 마진·실 자산/실 오라클/보험/수수료 정책 승인이나 live enable에 사용하지 않음.
- 다음 M5-T2: `reduce-only`/체결 방향·잔량·post-fill IM/MM 안전 판정을 별도의 SIMULATION_ONLY 순수 pre-trade 모듈에 구현. M4-T2/T3 영속 포지션 원장을 위험/증거금 게이트 없이 자동 실제 체결하지 않음.
- `npm run build` 통과, 백엔드 전체 `npm test` **254/254 통과, 0 failed** (기존 233+신규 21), `npm run build` 및 diff 검사 통과.
