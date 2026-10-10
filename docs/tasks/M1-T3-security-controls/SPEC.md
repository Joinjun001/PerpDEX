# M1-T3 SPEC — 자산 Allowlist, Pause, 역할 기반 보안 제어

## 목적

M1-T2의 단일 executor 권한을 운영 가능한 역할 모델로 확장하고, 지원 자산 및 긴급 정지 기능을 추가한다.

## 요구사항

1. OpenZeppelin `AccessControl` 기반 역할을 사용한다.
2. `SETTLEMENT_ROLE` 보유자만 정산할 수 있다.
3. `ASSET_MANAGER_ROLE` 보유자만 자산 allowlist를 변경할 수 있다.
4. `PAUSER_ROLE` 보유자만 pause/unpause할 수 있다.
5. deposit과 settlement는 allowlist된 자산만 허용한다.
6. delist된 자산도 사용자가 기존 잔액을 출금할 수 있어야 한다.
7. pause 상태에서는 deposit/withdraw/settle을 모두 중단한다.
8. 역할 변경과 자산 상태 변경에 대한 회귀 테스트를 추가한다.

## 초기 역할

- deployer/admin: `DEFAULT_ADMIN_ROLE`, `ASSET_MANAGER_ROLE`, `PAUSER_ROLE`
- settlement executor: `SETTLEMENT_ROLE`
