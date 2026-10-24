# M5-T2 QA

- 신규 `backend/test/perp-pre-trade-risk.test.ts`: **22/22 통과**. TypeScript `npm run build` 통과. 전체 백엔드 `npm test` **276/276 통과, 실패 0개** (기존 254 + 신규 22).
- LONG reduce-only SELL·SHORT reduce-only BUY·포지션 전량 종료(FLAT) 허용, 비용 원가 보존·사후 위험 재검사 및 원본 객체 immutable.
- FLAT reduce-only, 동일방향 증가, 주문 전체 수량의 원포지션 초과 금지. 주문은 1~n회 나눠 체결될 수 있으므로 **부분 체결 0.4 BTC만 감소해도 전체 주문 1.5 BTC면 거부**. 비-reduce-only라도 전체 주문이 포지션을 넘어 반전되면 거부.
- 신규 진입·추가 체결의 IM 부족 및 주문 RESERVED 차감 시 free collateral 음수, 독립 상한보다 높은 leverage, 기존 IM 부족·MM 미달/Equity 악화 방어.
- 이미 MM 미달·Equity 음수인 계정은 mark-neutral 감소/전량 종료 등 위험 불증가 모의 제안을 분류할 수 있으며, 불리한 체결로 equity 악화가 생기면 거부. **실제 청산/지급불능 조치가 아님**.
- `min/max quantity`, tick/lot, 정규형 unsigned BigInt, simulated fill > 전체 주문, 0 또는 overflow, stale `expectedVersion`, 다른 계정·정책/체인/market/token/domain, stale/future/위조 oracle, DRAFT 및 틀린 policy revision 전부 거부.
- 결과는 항상 `executionAuthorized:false`, 가상 `candidate`의 position `version+1`은 DB에 기록되지 않으며 M3 예약/해제, M4 체결 원장/시장 OI, M2 API/온체인 RPC 변경 없음.
- **미검증:** 여러 동시 오픈 주문의 reduce-only 합산 예약, 실제 동시 DB 락·원자적 위험 게이트, 체결 시점 재평가/fee/funding/slippage/시장 리스크 운영 승인. M5-T3/M5-T4 범위.

- 최종 `cd backend && npm run build`: 통과, `cd backend && npm test`: **276/276 pass, 0 fail**, `git diff --check`: 통과.
