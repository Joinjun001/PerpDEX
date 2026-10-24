# M4-T1 — 무기한 선물 One-way 포지션 상태 전이·PnL 기반

상태: **M4-T1-A 로컬 순수 엔진 구현 완료**, B~D 미완료. 실제 주문/체결/담보/자금/체인 비연결.

## 작업 분할

- **A (이번 회차)**: `backend/src/perp/position-engine.ts`에 검증된 시장 스케일·가짜 오라클을 사용해 순롱/순숏 진입, 같은 방향 추가, 기존 포지션의 부분·전체 종료, 반대 방향 전환, 정수 손익/평균가/미실현손익을 계산하는 순수 함수. 외부 상태 및 DB 쓰기 없음.
- **B (M4-T2, 다음 회차)**: `fillId` 영속 UNIQUE 및 `position` snapshot/event ledger, commit-time expectedVersion/market-domain 검증, 비인접 체결 replay 방지, PGlite 재생·재시작·동시성 검증. 실제 M2 체결·마진/자산 이동/공개 주문 연결 금지.
- **C (M4-T3)**: 영속 포지션 ledger에 승인된 simulated fill 양 당사자/시장 OPEN INTEREST 수량 보존 및 복구 검사. 인가된 위험 엔진/체결 어댑터가 없으므로 production fill ingestion 불가.
- **D (M4-T4)**: 실 PG 여러 연결·스트레스/상태 회계 일관성·극단치 정밀도 검증. 이후 M5 Pre-trade/margin risk engine과 통합.

## 타입·계산 및 불변식

- 위치 식별: validated `chainId`, `verifyingContract`, `market`, `collateralToken`, `account`, `configRevision`. 계정/토큰은 0이 아닌 체크섬 검증된 EVM 주소를 소문자로 정규화. 다른 domain/시장/토큰/계정/정책 버전은 거부.
- 수량 `sizeSignedAtomic`: 정규형 signed int256 10진 문자열, **양수 롱/음수 숏/0 flat**. `openCostNumerator`: unsigned uint256 정규형의 `baseAtomic × priceAtomic` 정확한 합, **담보 원자 단위가 아님**. `realizedPnlNumerator`: signed int256 동일 numerator 단위. 0 포지션이면 cost는 반드시 0; 비0 포지션이면 cost>0.
- 포지션 표시 평균 진입가 `floor(openCostNumerator / abs(positionSize))`와 나머지로 제공. **이 floored 평균을 계산용 PnL 원가로 사용하지 않음**. 동일 방향 신규 수량의 (수량 × 체결가) numerator를 기존 cost에 더한다.
- 반대 방향은 이전 포지션의 abs(size)와 incoming qty 중 작은 만큼 종료한다. 사용한 진입원가는 `floor(oldCost × closeQty / oldSize)`; 반올림 잔여 원가는 살아 있는 포지션에 보존해 전부 종료하면 이전 원가를 정확히 소진한다. 종료 시 실현 손익 numerator = `sign(oldSize) × (closeQty × fillPrice - allocatedCost)`; 남은 반대방향 수량이 있으면 그 수량만 체결가 기준 새로운 진입원가로 시작한다. 누적 Realized PnL은 종료 후에도 유지한다.
- quote 담보 원자 단위로 변환할 때 `numerator × 10^collateralDecimals / (10^baseDecimals × 10^priceDecimals)` 사용. 모든 signed 변환은 **0 방향 truncate**를 사용한다. 단일 종료 차익은 `round(newTotalRealized) - round(oldTotalRealized)`로 산출하여 반복 분할 체결에서 정밀도 dust를 잃지 않는다. 세금/수수료/펀딩/청산 페널티/포지션 담보 배분은 **의도적으로 제외**.
- 미실현 PnL = `sign(positionSize) × (markPrice × abs(positionSize) - openCostNumerator)`를 동일 단위로 변환. 최신 trusted config + mock price snapshot(index/mark/source/revision, max age, deviation, confidence) 검증이 반드시 성공해야 계산한다.
- 체결의 `SIMULATION_ONLY`, EIP-712 domain scope 및 lot/tick/maxQuantity/OI cap, mark band를 확인. 잘못된 부호/scale/수량/가격, int256·uint256 result overflow, 시계·정책 스코프/expired 오라클 거부. MarketConfig의 가격/마진/위험 숫자는 테스트 fixture일 뿐 운영 정책 아님.
- 순수 상태 `version`, `lastFillId`는 로컬 stale version과 직전 ID 중복만 검출한다. **비연속적인 같은 fillId 재등장은 차단하지 못하며**, 다음 M4-T2에서 durable UNIQUE `fillId`와 DB 트랜잭션 원장으로 방지한다. 반환값은 immutable/frozen, 입력 객체는 변경하지 않는다.

## 테스트 완료 기준 / 제한

- 롱·숏, 같은 방향 추가, 부분·전체 종료 및 양방향 반전, 양수/음수 실현 손익과 0/반올림 잔여, 가격 재평가, extreme int256/uint256·scale·market/domain·oracle 실패 안전 테스트.
- `npm run build`, 전체 `npm test` 통과 후 SPEC/TODO/QA/RESULT 및 ROADMAP/PROJECT_STATE 갱신, 로컬 Git commit만 수행.
- 이 엔진은 실 자금 보유 확인·정산·권한 부여/비밀키/운영 DB/실 거래 API와 연결하지 않는다. M3-T3의 `SIMULATION_ONLY` shadow order도 직접 체결·실행하지 않는다.
