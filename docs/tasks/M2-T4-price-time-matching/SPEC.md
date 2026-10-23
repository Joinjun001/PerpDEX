# M2-T4 SPEC — 가격·시간 우선 Matching Engine 및 부분 체결

## 목표
M2-T3에서 검증한 EIP-712 서명 주문 저장 기반 위에 재현 가능한 가격·시간 우선 매칭 엔진을 구현한다. 온체인 실제 정산은 M2-T5에서 연동한다.

## 순차 TASK
1. **M2-T4-A — 순수 매칭 코어**: 단일 시장·단일 호가 양면(order book), BUY 최고가 우선/SELL 최저가 우선, 같은 가격은 실제 접수 순서(FIFO) 우선, 호가 교차 시 체결 생성, 부분 체결 및 잔량 보존, cancel/expired 제외.
2. M2-T4-B — PostgreSQL에서 순서가 결정적인 오더북 조회와 원자적 체결/잔량 업데이트. timestamp 동률일 때는 고유 단조 수열 같은 순서 키를 명시한다.
3. M2-T4-C — API 통합, 동시성·재시작·체결 불변식 테스트, 미체결/부분 체결 상태 유지.
4. M2-T4-D — 통합 QA와 M2-T5 정산 입력 형식 문서화.

## 첫 작업 수락 기준
- 가격/수량은 BigInt(또는 동등한 정확한 정수 표현) 기반으로 비교·연산하며 JS Number 반올림 금지.
- 입력 순서를 명시적으로 가진 결정적 순수 함수 또는 클래스. PRICE > TIME로 정렬, 같은 가격 FIFO, 매수·매도 교차만 체결한다.
- 시장이 다른 주문, 동일 방향 주문, 취소·만료된 주문은 체결 대상 제외.
- 부분 체결/완전 체결/무체결, 동일 가격 FIFO, 서로 다른 시장 격리, BigInt 정밀도와 합계 불변식 테스트 작성.
- 오프체인 순수 코어 구현 범위에서는 실시간 네트워크, 사용자 비밀키, DB 실제 마이그레이션, 배포 및 원격 push 금지.

## 주의
M2-T3의 `orders.created_at`만으로는 동시각 주문의 접수 순서가 충분히 정의되지 않는다. 영속 오더북 구현 전에 안정적인 tie-breaker를 설계해야 한다.

## M2-T4-A 구현 계약 (9회차)

- `backend/src/matching/engine.ts`에서 `matchIncomingOrder(incomingOrder, restingOrders, nowSeconds)`를 제공하는 **부작용 없는 순수 함수**. DB 조회/갱신, RPC, 거래 실행·정산을 수행하지 않는다.
- 입력은 `BookOrder(orderId,market,side,price,quantity,filledQuantity,status,expiresAt,arrivalSequence)`. 가격/수량/체결수량은 canonical unsigned base-10 문자열(`uint256` 범위). `arrivalSequence`는 서버 부여 단조 증가 정수의 문자열(`1..2^63-1`), 사용자 서명 Nonce나 타임스탬프와 다르다.
- 동일 시장·가격의 매도 오더는 더 낮은 호가 우선, 동일 가격 FIFO(`arrivalSequence ASC`). 매수 오더는 더 높은 호가 우선, 동일 가격 FIFO. 메이커(기존 주문)의 호가로 체결한다.
- 호가 교차되지 않거나 같은 side/다른 시장인 경우 거래 없음. 취소·만료·완전 체결된 주문과 현재 시각 이상으로 만료된 주문은 체결 대상 제외.
- OPEN은 체결량 0, PARTIALLY_FILLED는 `0 < filled < quantity`, FILLED는 `filled == quantity` 제약. 불변식 위반 입력은 명시적 오류로 거부한다. CANCELED/EXPIRED는 기존 체결량을 보존하고 대상에서 제외한다.
- `MatchResult`: 변경 없는 입력은 복사하고, 체결된 주문만 새 상태/체결량 계산; `fills`는 maker/taker/order side/시장/메이커 체결가격/체결수량 반환. `totalFilled`는 이번 호출에서 추가 체결된 수량, `remainingQuantity`는 주문의 남은 수량.
- `arrivalSequence`가 같은 시장에서 중복되면 FIFO를 추측하지 않고 오류로 거부한다. 같은 시장 orderId도 중복 거부.
- **후속 필수:** 서버 DB가 발급한 유일·단조 증가 접수 키를 영속화하고 DB 트랜잭션 안에서 이를 사용해 매칭 결과를 일괄 저장해야 함. 독립 프로세스/네트워크 환경의 일관성, 계정 자가체결 제한, 체결가/수수료/위험관리, 체결 이벤트와 정산은 아직 범위 밖.

## M2-T4-B 영속 오더북/원자적 체결 계약 (10회차)

- 신규 `004_order_book.sql`은 기존 001~003을 변경하지 않고, 시장별 `order_book_counters`, 오더북 `order_book_entries`, 체결원장 `order_fills`을 생성한다.
- 서버가 신뢰한 EIP-712 chainId/verifyingContract와 market으로 분리된 카운터 행을 생성·`FOR UPDATE` 잠근 후 순서 키(`last_sequence + 1`)를 발급한다. 동일 트랜잭션에서 오더북 등록까지 커밋한다. 충돌하거나 롤백되면 번호 할당도 롤백된다. `nextval()` 및 `created_at` 기준 FIFO를 사용하지 않는다.
- `registerSignedOrderInBook`은 **이미 EIP-712 인증을 거쳐 기존 주문 테이블에 저장된 주문만** 등록한다. 새 등록은 OPEN/PARTIALLY_FILLED이면서 미만료일 때만 허용; 이미 등록된 주문에는 기존 순서 키를 반환한다.
- `matchRegisteredOrder`는 해당 시장 카운터 행 잠금 → 오더북 주문행 `FOR UPDATE` → 유효·미만료·이전 등록 순서의 반대 포지션 주문 선별 → 순수 `matchIncomingOrder` 실행 → 메이커/테이커 상태·체결 수량 비교-후-갱신 → 원장 INSERT를 **동일 트랜잭션**에 수행한다.
- 더 늦게 등록된 주문은 앞서 등록된 테이커의 메이커가 될 수 없으며, 동일 계정의 매수·매도끼리 직접 체결시키지 않는다(기본 자가체결 차단).
- 매칭 처리가 동일 시장에서 병렬 실행될 경우 시장 잠금이 매칭을 직렬화한다. EIP-712 취소와 겹치면 DB 주문행 잠금·상태 조건에 의해 취소 완료 주문의 잔량을 추가 체결하지 않는다.
- 체결원장은 가격·수량을 정수 문자열로 저장하고 메이커·테이커가 오더북에 등록된 주문임을 복합 외래키로 보장한다.
- **의도적으로 미연동:** 현 `POST /api/orders`는 주문 저장까지 수행하지만, 오더북 등록과 매칭을 자동 호출하지 않는다. M2-T4-C에서 동일 트랜잭션·서버 도메인으로 안전하게 연결할 예정. `004` 스키마를 운영 DB에 실제로 적용하지 않으며, 실제 정산은 M2-T5 대상.
