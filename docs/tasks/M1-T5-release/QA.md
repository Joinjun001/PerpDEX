# M1-T5 QA

상태: Passed

## 검증 범위

- deposit → settle → withdraw 핵심 통합 흐름
- 내부 사용자 잔액 합과 `totalLiability` 일치
- `totalLiability`와 Vault 실제 토큰 잔액 일치
- stateful invariant: deposit / withdraw / settlement 반복 호출
- withdraw 및 settlement의 잔액 경계값 fuzz 검증
- GitHub Actions Foundry CI 구성
- 전체 Foundry test/build 회귀

## 최종 결과

- 전체 테스트: 35 passed / 0 failed
- invariant: 256 runs / 128,000 calls / 0 reverts
- build: 성공
- `git diff --check`: 성공
- M1-T5 SPEC 요구사항 1~6 검증 완료

## 판정

M1 온체인 custody/settlement 범위의 핵심 통합 흐름, 회계 불변식, fuzz 경계값, CI 구성 및 전체 회귀가 요구사항을 만족한다. 실제 Sepolia broadcast는 M1-T4 안전 경계에 따라 수동 작업으로 유지한다.
