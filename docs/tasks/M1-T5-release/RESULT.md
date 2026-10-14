# M1-T5 RESULT

상태: In Progress

## 2026-10-15

- M1-T4의 자동화 범위를 완료 상태로 정리하고 M1-T5 릴리스 정리 TASK를 시작했다.
- 원격 push는 AutoPilot 작업 항목에서 제외하고, 실제 Sepolia 배포는 사람 확인 후 수동 수행하는 안전 경계를 유지한다.

## 2026-10-15 — 핵심 통합 흐름 검증

- `contracts/test/M1Integration.t.sol`을 추가해 deposit → settle → withdraw 전체 흐름을 하나의 시나리오로 검증했다.
- settlement 이후 양쪽 사용자 출금과 최종 내부 잔액, `totalLiability`, Vault 실제 토큰 잔액의 일치를 확인했다.
- 검증: 전체 `test` 32 passed / 0 failed, `build` 성공.

## 2026-10-15 — 회계 invariant 테스트 보강

- `contracts/test/AccountingInvariant.t.sol`을 추가해 deposit, withdraw, settlement를 반복 수행하는 stateful invariant 테스트를 구성했다.
- 두 사용자 내부 잔액의 합이 항상 `totalLiability`와 일치하고, Vault가 실제 보유한 토큰 잔액도 동일한지 검증한다.
- Foundry invariant 실행 결과 256 runs / 128,000 calls 동안 revert 없이 불변식이 유지됐다.
- 검증: 전체 `test` 33 passed / 0 failed, `build` 성공.
