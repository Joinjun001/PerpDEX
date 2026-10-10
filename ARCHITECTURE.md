# ARCHITECTURE

## 1. 목표 구조

PerpDEX는 **주문 생성·매칭은 Off-chain**, **자금 보관·최종 정산은 On-chain**에서 수행하는 하이브리드 구조를 사용한다.

```text
Wallet / Frontend
      │
      ├─ 서명된 주문 ──> Backend / Matching Engine
      │                       │
      │                       └─ 체결 결과
      │                              │
      └─ ERC-20 ─────────────> CollateralVault <─ Settlement Executor
                                      │
                                      └─ Ethereum / Sepolia
```

## 2. On-chain 책임

`CollateralVault`는 다음 책임만 가진다.

- 사용자의 ERC-20 collateral 보관
- 사용자별 내부 가용 잔액 기록
- 사용자의 직접 입금/출금
- 권한 있는 settlement executor의 내부 잔액 이전
- 관리자 보안 제어(후속 TASK: asset allowlist, pause, roles)

주문장, 가격 결정, 매칭 알고리즘은 온체인 컨트랙트에 넣지 않는다.

## 3. 회계 원칙

- `(token, user)` 단위 내부 잔액을 기록한다.
- 토큰별 `totalLiability`를 추적한다.
- 일반 ERC-20 기준으로 실제 토큰 보유량이 내부 부채보다 작아지는 상태를 허용하지 않는다.
- 정산은 외부 토큰 전송 없이 내부 장부 이동으로 처리하여 비용과 실패 지점을 줄인다.

## 4. 보안 원칙

- 외부 토큰 호출이 포함된 입출금은 reentrancy 보호를 적용한다.
- 체크-이펙트-인터랙션을 유지한다.
- fee-on-transfer/rebasing 등 회계 불변식을 깨뜨릴 수 있는 자산은 기본적으로 지원 대상으로 보지 않으며 M1-T3 allowlist에서 통제한다.
- settlement 권한은 일반 사용자와 분리한다.
