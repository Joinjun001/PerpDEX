# M5-T2 RESULT

상태: **SIMULATION_ONLY reduce-only 및 부분 체결 후 위험 사전 평가 순수 구현 완료**. 실제 거래 API·자금/포지션 DB 변경 금지 유지.

- 시작 실제 상태: `main` 깨끗함, HEAD `a9e39f0`, `origin/main`보다 18개 로컬 커밋 ahead. PROJECT_STATE/ROADMAP/M5-T1 SPEC·TODO·QA·RESULT와 실제 코드 확인.
- `backend/src/perp/pre-trade-risk.ts`: 신뢰 MarketConfig/오라클·M5-T1 순수 Equity/IM/MM/레버리지·M4 순수 position state transition 연계. 전체 주문량과 부분 체결량 분리, reduce-only(FLAT/방향/전체 과다) 거부, 비-reduce-only 반전 금지, 주문 증가·축소별 독립 위험 판정 및 후보 포지션/사후 위험 계산. `executionAuthorized:false` 고정, DB/자금/체인/매칭 영향 없음.
- `backend/test/perp-pre-trade-risk.test.ts`: 신규 22개 정상·경계·IM/MM/레버리지·시장 정책/오라클/계정 위조·부분 주문 반전 및 위험 악화 회귀 테스트 **22/22 통과**.
- 다음 **M5-T3**: 사용자가 승인한 범위에서 독립 SIMULATION_ONLY DB 트랜잭션에 M3 reserved/account/position/price 및 양측 OI/position risk 게이트를 원자적으로 묶는 기능을 실제 구현. 현재 기존 M2 거래/온체인/운영 DB에 자동 연결 금지.
- `npm run build` 통과, 전체 `npm test` **276/276 통과, 실패 0개**, `npm run build` 및 diff 검사 통과.
