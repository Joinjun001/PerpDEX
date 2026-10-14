# M1-T4 RESULT

상태: In Progress

## 2026-10-15

- M1-T3 완료 후 M1-T4 배포 준비 TASK를 시작했다.
- `contracts/script/DeployCollateralVault.s.sol`을 추가해 `SETTLEMENT_EXECUTOR` 환경 변수로 settlement executor 주소를 주입하도록 했다.
- Foundry `Script`의 broadcast 경로에서 `CollateralVault`를 배포하도록 구성했다.
- 검증: `test` 30 passed / 0 failed, `build` 성공.
- 다음 항목: Sepolia 환경 변수 예시 및 배포 명령 문서화.

## 2026-10-15 — Sepolia 환경 설정 및 배포 명령 문서화

- 루트 `.env.example`에 `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `SETTLEMENT_EXECUTOR` 예시를 추가했다.
- 실제 private key나 RPC secret 대신 명확한 placeholder만 기록했다.
- 루트 README에 `.env` 준비 방법과 `DeployCollateralVault` Sepolia 배포 명령을 문서화했다.
- 실제 `--broadcast` 배포는 사람 확인 후 수동으로만 수행하도록 안전 경계를 명시했다.
- 검증: `test` 30 passed / 0 failed, `build` 성공.

## 2026-10-15 — 로컬 배포 경로 검증

- `contracts/test/DeployCollateralVault.t.sol`을 추가해 `DeployCollateralVault` 스크립트를 Foundry 테스트 환경에서 직접 실행했다.
- `SETTLEMENT_EXECUTOR` 환경 변수를 테스트에서 주입하고 배포된 컨트랙트의 bytecode 존재 여부와 초기 `SETTLEMENT_ROLE` 부여를 확인했다.
- 검증: 전체 `test` 31 passed / 0 failed, `build` 성공.

## 2026-10-15 — 전체 test/build 회귀 검증

- M1-T4 배포 스크립트와 로컬 배포 테스트 추가 이후 전체 Foundry 테스트를 다시 실행했다.
- 기존 `CollateralVault` 테스트 30개와 배포 경로 테스트 1개가 모두 통과했다.
- 검증: `test` 31 passed / 0 failed, `build` 성공.

## 2026-10-15 — RESULT / QA 정리

- 배포 스크립트, 환경 변수 계약, Sepolia 배포 문서, 로컬 배포 경로 및 전체 회귀 결과를 QA 문서에 최종 정리했다.
- QA 상태를 `Passed`로 갱신하고 M1-T4 SPEC 요구사항 1~6이 모두 검증됐음을 기록했다.
- 실제 Sepolia `--broadcast` 배포와 원격 push는 안전 경계에 따라 사람 확인 후 수동으로만 수행한다.
