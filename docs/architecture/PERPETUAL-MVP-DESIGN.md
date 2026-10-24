# PerpDEX 무기한 선물 MVP 아키텍처 및 안전 개발 계획

기준일: 2026-10-24. 상태: **설계 및 개발 백로그 승인 전 준비**. 실제 자금·체인 RPC·배포·운영 DB·원격 push는 금지.

## 1. 제품 및 개발 범위

- 제품 결정: **Perpetual Futures DEX**. 체결 직후 명목금액을 BUYER → SELLER로 송금하는 현물형 정산은 사용하지 않는다.
- 최초 구현 제안: `BTC-USD-PERP` **단일 모의 시장**, USDC 단일 담보, **isolated margin**, **one-way net position**(한 사용자/시장에 순롱·순숏 하나), limit order 중심, 체결/가격/오라클은 테스트 픽스처. 이 선택은 개발 범위를 줄이기 위한 초안이며 실환경 시장·토큰 정책 승인이 아니다.
- 그다음 단계에서 다중 시장·cross margin·hedge mode·다중 담보·advanced order·시장가/IOC/TP·SL 및 외부 가격 공급자를 검토한다. 이번 로드맵에서는 실 자산 이동·운영 서버·프라이빗 키·네트워크 연결을 자동 허용하지 않는다.
- 단위: `quantity`는 base position atomic units, `price`는 명시된 quote/base 스케일, `margin`/`PnL`/`funding`은 quote collateral atomic units. 저장/계산은 BigInt 또는 checked `NUMERIC`/정수 문자열만 사용하며 부호·올림/내림·overflow·수수료 반올림 정책을 명시한다.

## 2. 기존 자산 재사용과 반드시 차단할 경로

| 현재 파일/구조 | 재사용 요소 | 선물 전환 시 변경·차단 항목 |
| --- | --- | --- |
| `backend/src/orders/order.ts`, `signature.ts` | EIP-712, nonce, 유효기간, 서명 검증 | 주문 서명 `v2`로 `reduceOnly`, `marginMode`/시장 제약·포지션 계정·주문 intent 고정. `v1`는 선물 주문 승인에 사용할 수 없음 |
| `backend/src/matching/{engine,postgres-book,accept-and-match}.ts` | maker price, FIFO, 부분 체결, 트랜잭션 | 신규·기존 주문의 위험 검사와 예약 증거금/포지션 갱신이 **같은 원자적 커밋 경계**에서 안전해야 함. 검증 전 `v1` 주문의 신규 선물 시장 체결·공개 활성화 금지 |
| `backend/sql/001~007` | 서명 주문/원장, 영속 Outbox, 재시도·증거 | 새 `008+` 스키마는 신규 테이블 중심으로 추가. 마이그레이션은 개발용/테스트 DB에만 적용, 기존 데이터를 자동 변환하거나 파괴하지 않음 |
| `backend/src/settlement/{fill-source,outbox,policy,dry-run,reconcile}.ts` | 고유 fill/trade ID, 정책 승인 서명·영속화·dry-run·mock 증거 | 기존 `BUYER_TO_SELLER` 자산 직접 전송은 파생상품 체결 정산이 아님. 선물 전용 Position/Risk Ledger 입력·위험 승인 경로가 완성될 때까지 실제 승인/송금에 연결 금지 |
| `contracts/src/CollateralVault.sol` | ERC-20 custody, allowlist/pause/RBAC/reentrancy, 테스트 | 현재 `withdraw()`는 off-chain에서 예약한 증거금을 고려하지 않음. `settle()`은 잔액 직접 이전뿐이며 포지션/PnL/보험기금 불변식 없음. 실제 선물 실자금 연동 전 MarginVault/ClearingHouse 별도 설계·감사 필요 |

**중대 보안 원칙:** 오프체인 DB에서 `lockedMargin`이 늘어났다고 기존 `CollateralVault.withdraw()`를 사용자가 호출하지 못하게 되지는 않는다. 따라서 v1 Vault를 그대로 실제 선물 담보용으로 배포/사용하지 말아야 한다. 전용 계약의 on-chain 인출 가능 잔액·부채/담보·권한 불변식 검증이 먼저 필요하다.

## 3. 아키텍처 목표

```text
[Testnet 전까지: 테스트 픽스처, 가짜 자산만]
Trusted MarketConfig + Mock PriceFeed(index, mark, timestamp, confidence)
                        |
              Risk & Margin Engine
                        |
Signed Order V2 -> Pre-trade reservation -> Matching/Fill (atomic)
                                             |
                                     Position Engine
                                             |
                          Double-entry Collateral / PnL Ledger
                              |            |            |
                         Funding Index  Liquidation  Insurance Accounting
                              \            |           /
                             Versioned Event / Outbox
                                       |
                              Dry-run only / Mock Receipt
                                       |
              [향후 별도 승인] MarginVault/ClearingHouse and RPC
```

### 3.1 증거금/회계(M3)

- 계정은 `available`, `reserved`, `positionMargin`, `realizedPnL`, `feesAccrued`와 ledger sequence를 갖는다. 각 변화는 append-only 이벤트와 균형 잡힌 회계 분개에 의해 뒷받침된다.
- `available`만 신규 주문 예약/인출에 사용할 수 있다. 주문 취소·거절·미체결 종료 시 잔여 예약을 정확히 해제하고 이중 해제를 차단한다.
- Double-entry 통화별 합계 0, 음수 가용증거금 금지(별도 명시적 손실/부채 처리 예외 제외), 내역 재생으로 상태 복원, 전역/계정 잠금 순서·idempotency key 불변식을 검증한다.
- `price`와 `quantity`의 정밀도/틱·lot, `initialMarginFraction`, `maintenanceMarginFraction`, funding clamp, max OI 등 위험 값은 **버전이 있는 승인된 MarketConfig**에서만 읽는다. 사람이 승인하지 않은 운영 기본값은 배포되지 않는다.
- 오라클 스냅샷에 `source`, `market`, `indexPrice`, `markPrice`, `publishedAt`, `confidence`, `sourceSequence`를 두고 staleness, future timestamp, 반복/역행, confidence 및 급격한 deviation을 차단한다. 모의 가격은 unit/integration 테스트에만 허용한다.

### 3.2 포지션(M4)

- `positionSizeSigned` (양수 롱, 음수 숏), `entryNotional` 또는 수량 가중 평균가, `allocatedMargin`, 누적 realizedPnL, `lastFundingIndex`, 상태 버전.
- 같은 방향 추가: 수량 및 비용 기준 갱신. 반대 방향: 기존 포지션 감축 → 실현 PnL 기록 → 잔여분이 있으면 새 방향으로 전환. 모든 부분 체결은 `fillId+account+leg`로 일회 적용한다.
- mark 가격에서 미실현 PnL 계산, OI(롱·숏) 일관성, 시장별 netting/자가체결 방지, 포지션 재생과 DB 재시작 재생을 검증한다.
- M4 기간에는 **공개 레버리지 주문 접수 비활성**. 포지션은 순수 함수/테스트 원장으로만 변경한다. M5 위험 검사 통과 전 live 경로에 연결하지 않는다.

### 3.3 레버리지/주문 위험 검사(M5)

- 명목가치 = abs(positionSize) × 적절한 markPrice(명시된 스케일 포함).
- 초기증거금 필요액 = abs(notional) × initialMarginFraction, 유지증거금 필요액 = abs(notional) × maintenanceMarginFraction. 항상 0 < maintenance < initial <= 1, `effectiveLeverage` 및 OI/포지션 상한 검증.
- `equity = isolated collateral + unrealizedPnL - accruedFees - unpaidFunding`(상태 정의에 따라 이중 차감 금지), `freeCollateral`은 예약금/초기증거금 요구액을 차감한 잔여 여력. 위험 검사에서는 출금·주문·청산의 상태 전이 전/후 equity를 확인한다.
- 신규 주문 증거금 예약, 체결 후 조정, reduce-only는 어떠한 체결도 절대 포지션 절대크기를 늘리거나 역전하지 못함, 체결 시 실제 mark/fill 가격·슬리피지/가격 밴드·시장 정지 상태를 검사한다.
- 부적합 오라클, 잔액 불일치, 파라미터 누락, 변동성 중단/서킷브레이커 시 위험 증가 주문은 **fail-closed**. 안전하게 가능한 감축/취소 처리도 별도 명시한 정책에서만 허용한다.

### 3.4 펀딩비(M6)

- 검증된 index/mark 가격, 시간대와 funding epoch를 입력받아 bounded fundingRate 및 누적 fundingIndex를 계산한다. 펀딩 주기 및 상한은 정책화하며 실시간 임의 변경을 금지한다.
- 포지션 단위 funding payment = signed position × ΔfundingIndex (스케일·반올림 정의). 이중 정산/부호 오류/장기 중단 시 중복 적용/반대 편 손익 불균형을 검증하고, 보험/rounding 계정을 포함한 분개 총합 불변식을 유지한다.
- 지급 실패/담보 부족/시스템 다운·오라클 오류에서 데이터 손상을 허용하지 않는다. 실시간 펀딩 RPC나 실제 자산 정산은 계속 비활성화한다.

### 3.5 청산(M7)

- `equity < maintenanceMarginRequirement`이며 신뢰된 최신 mark/보수적 가격으로 계산한 경우에만 청산 후보. mark/oracle 혼란·시장 동결·미확정 체결/이중 펀딩 시 실패 안전 모드.
- 청산 전 `cancel+release all increasing orders`, reduce-only 부분 청산 → 잔여 위험 재계산 → 필요시 전체 청산; idempotent liquidationId 및 사전/사후 계정·시장 상태 버전 확인.
- 청산 페널티/보상, 보험기금/사회화 손실/ADL의 설계·계약 책임은 명시적 단계로 검증한다. 보험기금 부족 시 무한 음수 잔액 또는 숨겨진 부채 허용 불가; 정책 미승인 시 자동 실행 금지.

### 3.6 실자산·온체인 정산(M8)

- 기존 `settle(from,to,amount)` 재사용만으로 선물 청산/펀딩·증거금 보호를 해결할 수 없다. MarginVault/ClearingHouse 등 신규 계약/검증된 인터페이스로 사용자 lock/unlock, loss, payout, 보험 회계와 실제 출금 게이트를 분리 설계한다.
- 동일 체결·funding epoch·청산 ID의 정확히 한 번 적용(중복/nonce/replay 차단), 포지션 및 자금 보존 invariant, role separation/timelock/pause, bytecode와 EIP-712 domain 검증 및 실제 PostgreSQL 멀티프로세스 복구가 릴리스 전 필수다.
- 처음에는 로컬 Foundry/Anvil + mock oracle + mock token으로만 회귀. 별도 사람 승인 이전에는 Sepolia/메인넷 배포, 실제 RPC 송신 및 자금 이전을 금지한다.

## 4. 순서 및 완료 게이트

| 마일스톤 | 핵심 TASK/산출물 | 완료 기준 |
| --- | --- | --- |
| **M3 증거금·가격 기반** | M3-T1 타입/단위/위험 설정·스냅샷 검증 → T2 append-only 회계/예약 → T3 주문 예약의 원자성/복구 → T4 격리계정/실 PG 회귀 | 회계 보존·정밀도·영속 재생/잠금·stale price 차단 테스트 |
| **M4 포지션 엔진** | M4-T1 포지션 순수 상태 전이 → T2 분할/역전/PnL → T3 체결 적용 ID/ledger → T4 롱·숏/OI 재생 | 포지션 손익·수량·분할/역전·중복 체결 불변식 |
| **M5 레버리지·위험 검사** | M5-T1 initial/maintenance/equity → T2 주문 v2/reduce-only → T3 fill atomic risk gate → T4 가격 밴드·OI한도/스트레스 | 부족 증거금 주문/출금 금지 및 주문/체결 rollback, 가격 조작 차단 |
| **M6 펀딩비** | M6-T1 funding price/index/rate → T2 accrual/분개 → T3 장애 복구/재산정 → T4 정산 리플레이 QA | 에폭 단위 중복 없음, 총합 보존, 방향/rounding/분쟁 가능한 근거 보존 |
| **M7 청산** | M7-T1 liquidatable 판정 → T2 주문 취소/부분 청산 → T3 보험기금·부족액 → T4 stress/fuzz | false liquidation 차단·과도 청산 금지·손실/보험·bad debt 명시 회계 |
| **M8 온체인 통합·보안** | M8-T1 선물용 MarginVault/ClearingHouse 설계 → T2 local Foundry invariant → T3 영속 정산/receipt read-only → T4 독립 QA/운영 준비 | **로컬/스테이징만** 기술 검증. 실제 배포/자금 이동은 별도 승인 필요 |

## 5. 자동 개발 권한 경계 및 다음 TASK

- **지금 가능한 자동 개발**: M3-T1의 오프체인/순수 입력 스키마·BigInt 단위/틱·정수 범위/정밀도·MarketConfig/PriceSnapshot 검증 함수 및 테스트. 외부 오라클 API·토큰 주소/시장 위험 수치가 없는 상태에서도 코드 구현·테스트 가능.
- **나중에 별도 승인할 결정**: 운영 market/listing, collateral token 및 decimals, IM/MM·leverage cap·funding period/fee, open-interest cap, 오라클 provider/신뢰·확정성, 보험/ADL 정책, 실제 Vault/권한·서명, 스테이징/실체인 배포.
- 기존 M2 코드는 테스트에서 유지하고 현재의 `BUYER_TO_SELLER` 승인·settle 경로를 **무기한 선물 운영 경로로 자동 승격하지 않는다**.
- ROADMAP 시작점: `docs/tasks/M3-T1-market-risk-foundation/{SPEC,TODO,QA,RESULT}.md`. 다음 회차에서 기능 구현이 일어나도록 마일스톤의 첫 작업을 작게 제한한다.

## 6. 참고 설계 근거

- dYdX의 isolated margin 및 initial/maintenance margin 기준, OI·funding 계정 구조: https://dydxprotocol.github.io/v4-documentation/ 와 https://github.com/dydxprotocol/v4-chain/blob/main/proto/dydxprotocol/perpetuals/perpetual.proto
- dYdX의 청산 관행(Oracle 가격, 위험 기준·보험 회계): https://help.dydx.trade/en/articles/166991-liquidations-on-dydx-chain
- Pyth의 stale/confidence/freshness 검증·파생상품 오라클 지연 대응: https://docs.pyth.network/price-feeds/core/best-practices
- GMX의 funding/청산·insurance/ADL 개념 참조: https://docs.gmx.io/docs/trading/liquidations/ 와 https://docs.gmx.io/docs/trading/fees/

위 자료는 설계 원칙의 비교 참고용이다. 외부 프로토콜의 파라미터를 이 프로젝트의 위험 정책이나 승인값으로 직접 복사하지 않는다.
