# M5-T1 — 무기한 선물 격리 증거금·레버리지 순수 위험평가 엔진

상태: **A 순수 위험평가 로컬 구현 완료**, 후속 B~D 모의 주문/체결 게이트 별도 미완료. 실 자금/주문/청산 연계 금지.

## 마일스톤 작업 분할

- **A (이번 실행)**: M3 trusted `MarketConfig`·`PriceSnapshot`, M4 불변 `PerpPosition`, M3 영속 원장의 `MarginBalances` 구조를 입력받는 순수 함수 `evaluateSimIsolatedPerpRisk` 구현. 로컬 모의 위험등급, 초기증거금(IM), 유지증거금(MM), equity, 유효 레버리지, 가용잔여 예측값 산출. 실행 권한은 항상 `false`.
- **B (M5-T2 후보)**: 별도 시뮬레이션 전용 주문 사전 게이트(포지션 증가·감소·reduce-only·체결 후 상태 예측). M4 상태 전이와 정책·가격의 일치, 필수 계약 조건 판정, 실패 안전 test; 실제 주문 접수 및 자금 이동에 연결하지 않는다.
- **C (M5-T3 후보)**: 승인된 모의 결과를 영속 포지션·M3 예약/위험 상태와 동일 트랜잭션으로 조회·검증하는 수명주기. 최신 오라클/원장 version 및 replay를 확인하기 전 자동 체결 금지.
- **D (M5-T4 후보)**: 임시 PostgreSQL 실제 다중 연결·시장 OI/계정 위험 경합/재시작·장애 안전 QA. 운영 시장 설정/자금/실체인 적용 금지.

## 입력 신뢰 경계와 회계 모델

- `backend/src/perp/risk-engine.ts`는 동기 **읽기 전용 순수 함수**. `executionMode:'SIMULATION_ONLY'`로 고정된 동일 도메인/시장/담보토큰/계정의 `MarginBalances`와 `PerpPosition`을 받는다. 입금/출금/담보 이전/실현 손익 확정/주문 승인/청산 트랜잭션은 *절대* 수행하지 않는다.
- 유효한 `APPROVED`/trustedSourceId 테스트 `MarketConfig`와 timestamp/source/sequence/가격 편차/신뢰 범위가 유효한 mock `PriceSnapshot`만 허용. 실제 위험 한도(마진 비율·최대 레버리지·토큰·오라클 공급자)는 현재 승인되지 않았다. `APPROVED`라는 문자열은 신뢰의 충분조건이 아니라 서버 측 trustedSourceId 검사가 필수이다.
- `MarginBalances`는 같은 계정/시장에 대한 3개 버킷 `AVAILABLE+RESERVED+POSITION==total`이 만족하는 **내부 모의 원장 수치**일 뿐 실제 Vault 잔고/수탁 증빙이 아니다. 합계 불일치/음수/비정규 10진 문자열/uint256 초과 및 도메인/계정 불일치는 모두 거부한다.
- 위험 Equity 계산은 **`totalMargin + (아직 증거금 장부에 반영하지 않은 누적 realized PnL) + mark 기준 unrealized PnL`**. 현재 M4 realized PnL은 M3 버킷으로 게시되지 않으므로 `realizedPnlBookedAtomic: '0'`만 허용한다. 이미 게시된 realized PnL을 다시 더하는 문제는 **별도 정산/원자적 book-keeping 장부가 생기기 전까지 허용하지 않음**. 실제 PnL 지급·입금과 혼동해 사용 금지.
- `notionalAtomic = CEIL(abs(positionSignedBaseAtomic)*markPriceAtomic*10^collateralDecimals / 10^(baseDecimals+priceDecimals))`, `IM = CEIL(notional*initialMarginBps/10000)`, `MM = CEIL(notional*maintenanceMarginBps/10000)`. M4 제공 마크 notional은 표기 목적의 내림 값이라 사용하지 않는다.
- 손익 numerator는 `baseAtomic * priceAtomic`; 실현 손익과 미실현 손익을 담보 원자 단위로 바꿀 때 **이익은 0 방향 버림**, **손실은 0에서 멀어지는 방향 올림(부채 과소평가 방지)**. M4 표기 PnL의 `TOWARD_ZERO` 규칙보다 위험평가에서는 손실에 보수적인 방식이다. 모든 결과 정수 `bigint`와 범위 체크, JavaScript 소수점 사용하지 않음.
- `freeCollateralAfterIm = equity - RESERVED - existingPositionIM`은 **참고용** 잔여 추정치. 시장별 원장/다른 시장 자금, 펀딩, fee, 취소/체결 후 최종 버킷을 보장하지 않으므로 어떤 주문 승인권도 주지 않음.
- `effectiveLeverageBps = CEIL(notional*10000/equity)`; nonflat이고 `equity<=0`이면 숫자가 아닌 `null`, flat이면 0. `maxLeverage*10000` bps를 초과하면 별도 상태로 기록. IM 부족이지만 MM 초과인 경우 `INITIAL_MARGIN_SHORTFALL`, MM 이하 `MAINTENANCE_MARGIN_BREACH`, `equity<0`이면 `INSOLVENT`, 0 포지션은 `FLAT`. 부채·MM 경계는 fail-conservative. 위험상태는 청산 트리거가 아니며, `executionAuthorized:false`는 고정.
- `MAX_INT256`/`MAX_UINT256` 결과·산술·가격 단위 초과, 0 나눗셈 가능성, trusted policy와 oracle 부적합, ledger 합산 오류 모두 거부; 함수 입력 객체는 변경하지 않고 리포트는 `Object.freeze` 반환.

## 안전 범위와 검증 방법

- 정상 LONG/SHORT 및 mark 손익·realized 누적, 전체 버킷/오더 reserve, FLAT, IM/MM 경계, negative/zero equity 및 leverage null, 엄격한 maxLeveraged 정책, 극소단위 반올림·overflow/무효 domain/market/address/토큰·stale oracle 포함 신규 21개 단위 테스트.
- `cd backend && npm run build`, `npm test`, `git diff --check` 통과한 뒤 TASK 문서/PROJECT_STATE/ROADMAP 및 이번 변경만 로컬 commit.
- M5-T1은 실제 주문 검증 API도, 실 자산·청산·funding·보험·M1 Vault 인출 제한도 구현하지 않는다. 운영 DB 및 원격 push 금지.
