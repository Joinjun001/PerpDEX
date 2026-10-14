# M2-T1 SPEC — 주문 도메인 모델, 입력 검증 및 상태 머신 기반

## 목적

M2의 Off-chain 주문 처리 기반으로 사용할 TypeScript 주문 도메인을 정의한다. 이후 EIP-712 서명 검증, REST API, Matching Engine이 같은 주문 계약을 공유하도록 입력 형식과 상태 의미를 먼저 고정한다.

## 요구사항

1. `account`, `market`, `side`, `price`, `quantity`, `nonce`, `expiresAt`을 포함하는 주문 입력 모델을 정의한다.
2. 주소, market 식별자, BUY/SELL side, 양수 price/quantity, uint nonce, 미래 만료시각을 런타임에서 검증한다.
3. 정수형 금액은 JavaScript number 정밀도 문제를 피하기 위해 10진 문자열로 유지한다.
4. 주문 상태를 `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED` 기준으로 정의하고 허용 상태 전이를 명시한다.
5. 주문 식별에 사용할 canonical payload와 deterministic order ID 생성 경로를 제공한다.
6. 유효/무효 입력 및 상태 전이에 대한 단위 테스트를 제공한다.
7. 외부 패키지 설치 없이 현재 서버의 Node.js 22 환경에서 test/build 검증이 가능해야 한다.

## 안전 경계

- 이번 TASK에서는 외부 API, 지갑 서명, DB, 온체인 트랜잭션을 수행하지 않는다.
- EIP-712 서명 검증은 M2-T2에서 구현한다.
- 원격 push는 AutoPilot 작업 범위에서 제외한다.
