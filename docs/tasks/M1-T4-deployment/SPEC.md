# M1-T4 SPEC — 배포 스크립트 및 Sepolia 준비

## 목적

M1-T3까지 검증된 `CollateralVault`를 로컬 및 Sepolia 환경에서 재현 가능하게 배포할 수 있도록 Foundry 배포 경로와 환경 설정을 정리한다.

## 요구사항

1. `CollateralVault` 배포용 Foundry Script를 제공한다.
2. 배포 시 settlement executor 주소를 환경 변수로 주입하고 0 주소를 사용하지 않는다.
3. `.env.example`에는 비밀값 자체가 아니라 필요한 환경 변수 이름과 예시만 기록한다.
4. Sepolia RPC 및 배포 명령을 문서화하되 실제 원격 배포는 자동화에서 수행하지 않는다.
5. Anvil 또는 Foundry의 로컬 실행 경로로 배포 스크립트를 검증한다.
6. 기존 전체 테스트와 build가 계속 통과해야 한다.

## 안전 경계

- 실제 private key, RPC secret, API key는 저장소에 기록하지 않는다.
- Sepolia broadcast 및 원격 배포는 사람 확인 후 수동으로 수행한다.
