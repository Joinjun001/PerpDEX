# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M2 — Off-chain Order API & Matching MVP**
- 현재 TASK: **M2-T1 — 주문 도메인 모델, 입력 검증 및 상태 머신 기반**
- 상태: In Progress
- 최근 완료: M1 전체 완료, M2를 5개 TASK로 세분화, 주문 도메인 타입 및 런타임 입력 검증 구현, 주문 상태 모델과 허용 전이 구현
- 다음 미완료 항목: canonical payload 및 deterministic order ID 구현
- 사람 확인 필요: Sepolia 실제 broadcast 배포는 수동으로 수행한다. 원격 push는 AutoPilot 작업에서 제외한다.

## 현재 TASK 문서

- `docs/tasks/M2-T1-order-domain/SPEC.md`
- `docs/tasks/M2-T1-order-domain/TODO.md`
- `docs/tasks/M2-T1-order-domain/RESULT.md`
- `docs/tasks/M2-T1-order-domain/QA.md`

## 저장소 복원 결과

2026-10-10 기준 저장소는 Foundry 기본 `Counter` 예제와 프로젝트 README만 존재하는 초기 상태였다. README에 명시된 1차 제품 흐름은 다음과 같다.

`Deposit → Limit Order → Matching → Settlement → Withdraw`

따라서 M1에서는 백엔드 매칭 엔진이 안전하게 사용할 수 있는 온체인 custody/settlement 기반을 먼저 구축한다.

## 진행 규칙

1. TASK 구현
2. 테스트 추가/수정
3. 테스트 실행 및 버그 수정
4. 필요한 빌드/배포 검증
5. TASK 문서 및 상태 업데이트
6. `git diff`, `git status` 검토
7. commit / push
8. 가능한 경우 GitHub Actions CI 확인
9. TASK 완료 후 다음 TASK로 즉시 전환
