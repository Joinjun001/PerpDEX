# M1-T1 RESULT

상태: Completed

## 구현 결과

- Foundry 기본 `Counter` 예제를 제거하고 실제 프로젝트 컨트랙트로 전환했다.
- `CollateralVault`에 ERC-20 `deposit` / `withdraw`를 구현했다.
- `(token, user)` 기준 내부 잔액과 토큰별 `totalLiability`를 추가했다.
- 입출금 이벤트와 custom error를 추가했다.
- `ReentrancyGuard`와 `SafeERC20`을 적용했다.
- 실제 수령량이 요청량과 다른 fee-on-transfer 토큰을 거부하도록 회계 검증을 추가했다.
- Foundry compiler/remapping 설정을 명시적으로 고정했다.

## 검증 결과

- `forge fmt --check`: PASS
- `forge build`: PASS
- `forge test`: PASS
- 총 테스트: 8 passed / 0 failed
- fuzz: deposit/withdraw 후 Vault 토큰 잔액과 `totalLiability`가 일치함을 검증
