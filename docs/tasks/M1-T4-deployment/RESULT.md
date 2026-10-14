# M1-T4 RESULT

상태: In Progress

## 2026-10-15

- M1-T3 완료 후 M1-T4 배포 준비 TASK를 시작했다.
- `contracts/script/DeployCollateralVault.s.sol`을 추가해 `SETTLEMENT_EXECUTOR` 환경 변수로 settlement executor 주소를 주입하도록 했다.
- Foundry `Script`의 broadcast 경로에서 `CollateralVault`를 배포하도록 구성했다.
- 검증: `test` 30 passed / 0 failed, `build` 성공.
- 다음 항목: Sepolia 환경 변수 예시 및 배포 명령 문서화.
