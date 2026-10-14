# M1-T5 SPEC — 통합 검증, invariant/fuzz 보강, CI 및 M1 릴리스 정리

## 목적

M1의 온체인 custody/settlement 기능을 릴리스 가능한 상태로 정리하기 위해 핵심 사용자 흐름 통합 테스트, 불변식·fuzz 보강, CI 구성 및 최종 검증 문서를 완성한다.

## 요구사항

1. deposit → settle → withdraw의 핵심 흐름을 하나의 통합 테스트로 검증한다.
2. 내부 사용자 잔액 합과 `totalLiability`, Vault의 실제 토큰 잔액 간 회계 불변식을 보강한다.
3. 경계값과 임의 입력에 대한 fuzz 테스트를 보강한다.
4. GitHub Actions에서 Foundry build/test를 실행할 수 있는 CI 구성을 제공한다.
5. 전체 test/build가 통과해야 한다.
6. M1 릴리스 결과와 QA를 문서화한다.

## 안전 경계

- 원격 push는 AutoPilot 작업 범위에서 제외한다.
- 실제 Sepolia broadcast 배포는 M1-T4 문서에 따라 사람 확인 후 수동으로 수행한다.
