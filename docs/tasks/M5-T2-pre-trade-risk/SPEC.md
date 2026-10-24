# M5-T2 — 모의 주문 reduce-only·체결 후 위험평가

상태: **SIMULATION_ONLY 순수 사전 주문/체결 후보 평가 구현 완료**. 실제 주문 접수·매칭·DB 체결/증거금 변경은 수행하지 않음.

## 목적·실제 구현

- `backend/src/perp/pre-trade-risk.ts`에 `evaluateSimPreTrade(position, margin, request, trustedContext)` 구현. M5-T1 `evaluateSimIsolatedPerpRisk`와 M4 `applyPerpPositionFill`을 **메모리에서만** 조합하고, 변경/DB 쓰기/네트워크 호출 없이 사전·사후 예상 위험을 반환한다.
- 정책·가격 `validatePerpMarketConfig`와 `validateMockPriceSnapshot`의 trusted source/revision/time/index-mark/confidence 검증을 그대로 적용한다. 계정/체인/컨트랙트/시장/담보 토큰/정책 버전/포지션 `expectedVersion`은 전부 불일치 시 거부한다. `executionMode='SIMULATION_ONLY'`, 정규형 64자리 16진 `fillId`, tick/lot, 시장 주문 최소/최대 수량 및 부분 체결 수량 초과 검사 필수.
- 입력에 **전체 주문 수량** `orderQuantityAtomic`과 **이번 시뮬레이션 체결량** `simulatedFillQuantityAtomic`을 분리한다. 둘 모두 양수·lot 정합성 검증. 보고서의 `remainingOrderQuantityAtomic`은 단순히 잔량 계산만 할 뿐 예약·실제 체결·향후 위험 한도까지 승인하지 않는다.
- `reduceOnly=true`면 현재 LONG에 SELL 또는 SHORT에 BUY여야 하고, **전체 주문량 <= 현재 절대 포지션 수량**이어야 한다. FLAT/동일 방향 증가/전체 주문 초과(일부 체결만 안전해도) 전부 `REJECTED`. 향후 부분 체결로 반전되는 위험을 줄이지만, 여러 reduce-only 주문의 **합산** 수량 제한과 취소·동시 충돌은 영속 트랜잭션 단계 M5-T3에서 검증할 때까지 미구현.
- `reduceOnly=false`에서도 반대 방향 주문의 **전체 주문량**이 현재 포지션 절댓값보다 크면 `POSITION_REVERSAL`로 거부. 단순 감소와 0까지 전량 종료는 평가 허용. 반전은 별도 원자적 위험·재예약 정책이 정해질 때까지 fail-closed.
- 유효한 제안에만 M4 순수 상태 전이를 적용하여 위치 signed base 수량 변화·정확한 cost basis/realized PnL을 계산하고 M5-T1 사후 notional/IM/MM/equity/유효 leverage/free collateral을 재검사. `candidate`는 가상 전이, `after`는 모의 위험 스냅샷이며 **실 체결 영수증이나 인가가 아님**.

## 증가/감소 위험 분리

- **INCREASE**: 기존 위험이 `HEALTHY` 또는 `FLAT`이고, 사후 `canMeetInitialMargin=true`, maintenance 위반 없음, `freeCollateralAfterIm >= 0` 및 leverage 상한 내이고 `after.status=HEALTHY`인 경우에만 `SIMULATION_ELIGIBLE`로 분류. IM 부족·비정상 Equity/유지증거금은 `POST_TRADE_MARGIN_SHORTFALL`, IM 충족하지만 레버리지 초과 시 `POST_TRADE_LEVERAGE_LIMIT`, 기존 위험이 비정상이면 `EXISTING_RISK_BREACH`로 거부.
- **REDUCE/CLOSE**: 이미 IM/MM 미달 또는 Equity 음수여도 신규 위험을 늘리지 않는 감소만 **평가상** 허용. `after equity`가 기존보다 낮아지거나 notional/IM/MM이 증가하면 `REDUCTION_WORSENS_RISK`로 거부. 시장가보다 불리한 가상 체결 때문에 Equity가 더 나빠지면 거부; 정상 청산 중 불리한 체결 허용/수수료/손실 보호를 다루는 실 엔진은 M5-T3/청산 마일스톤에서 별도 정책 검증 필요. 위험 계정의 감소 제안은 **청산 명령이 아님**.
- 결과는 `SIMULATION_ELIGIBLE` 또는 `REJECTED`와 이유 enum으로 진단되며 `executionAuthorized:false` 고정. `SIMULATION_ELIGIBLE`은 **이번 입력된 단일 가상 체결에만** 해당하며 전체 주문 또는 다음 체결의 승인/자금 사용 허가가 아니다. 불변 Frozen 보고서·기존 position/margin/order/context 객체 무변경.

## 미구현/금지 경계

- 체결 실행 전 시세·담보·포지션을 **동일 트랜잭션으로 스냅샷 고정**, 여러 open order의 reduce-only 합산/예약·취소/청산·funding/fee/slippage·M2 거래 서명 실제 승인 및 M3 영속 마진/양측 M4 포지션·OI 연결은 M5-T3 이상으로 분리한다.
- 위험 정책 숫자는 테스트 fixture일 뿐 운영 승인 없음. 실제 예치/인출 수탁 증빙과 onchain vault/clearing/보험/손익 지급은 검증하지 않았다. 실거래·운영 DB 변경·온체인 트랜잭션·배포/자격증명/원격 push 금지.

## 검증

- `backend/test/perp-pre-trade-risk.test.ts`: 신규 **22개** 단위 테스트로 LONG/SHORT·FLAT·부분/전체 close·reduce-only 과다/역방향·의도치 않은 반전·IM/MM/Equity·레버리지·예약 버킷·위험계정 회복/악화·위조/범위·순수성 및 중복 평가를 검증.
- `cd backend && npm run build` 및 전체 `npm test` 통과 후 이번 회차 파일만 로컬 커밋.
