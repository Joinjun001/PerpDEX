# M1-T4 QA

상태: Passed

## 검증 범위

- `DeployCollateralVault` Foundry Script 컴파일
- `SETTLEMENT_EXECUTOR` 환경 변수 기반 생성자 인자 주입
- `.env.example`의 Sepolia RPC, 배포 키, settlement executor placeholder 구성
- README의 Sepolia 배포 명령 및 실제 `--broadcast` 수동 실행 경계
- Foundry 테스트 환경에서 배포 스크립트 실행
- 배포된 `CollateralVault` bytecode 존재 여부
- 배포 시 지정한 executor의 `SETTLEMENT_ROLE` 보유 여부
- 기존 `CollateralVault` 기능 회귀

## 최종 결과

- 전체 테스트: 31 passed / 0 failed
- build: 성공
- `git diff --check`: 성공
- M1-T4 SPEC 요구사항 1~6 검증 완료

## 판정

실제 Sepolia broadcast를 제외한 M1-T4의 배포 준비, 환경 설정, 로컬 배포 경로 및 회귀 검증이 요구사항을 만족한다. 실제 Sepolia 배포는 안전 경계에 따라 사람 확인 후 수동으로 수행한다.
