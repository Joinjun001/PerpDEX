# M1-T1 SPEC — CollateralVault 입출금 코어

## 목적

PerpDEX의 collateral을 온체인에 안전하게 보관하고 사용자별 내부 잔액을 관리하는 최소 Vault를 구현한다.

## 요구사항

1. ERC-20 `deposit(token, amount)`을 제공한다.
2. ERC-20 `withdraw(token, amount)`을 제공한다.
3. `balanceOf(token, user)` 조회를 제공한다.
4. 토큰별 `totalLiability(token)`를 추적한다.
5. 0 수량 요청은 거부한다.
6. 출금 시 내부 잔액 부족을 거부한다.
7. 입출금 이벤트를 남긴다.
8. 입출금 외부 호출에 reentrancy 보호를 적용한다.
9. 실제 수령량이 요청량과 다른 fee-on-transfer 형태는 거부하여 회계 오차를 방지한다.

## 비범위

- settlement executor 권한 및 내부 장부 이동: M1-T2
- token allowlist / pause / 관리자 역할: M1-T3
- Sepolia 배포: M1-T4
