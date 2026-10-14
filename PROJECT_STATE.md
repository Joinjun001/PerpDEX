# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M1 — 온체인 자금 보관·정산 기반**
- 현재 TASK: **M1-T4 — 배포 스크립트 및 Sepolia 준비**
- 상태: In Progress
- 최근 완료: M1-T3 완료 및 수동 push, `CollateralVault` Foundry 배포 스크립트 작성, Sepolia 환경 변수 예시 및 배포 명령 문서화, 로컬 배포 경로 검증, 전체 test/build 회귀 검증, RESULT / QA 갱신, 로컬 commit 정리
- 다음 미완료 항목: 사람 확인 필요 — Sepolia 실제 배포 및 원격 push
- 사람 확인 필요: Sepolia 실제 broadcast 배포와 원격 push는 AutoPilot에서 수행하지 않는다.

## 현재 TASK 문서

- `docs/tasks/M1-T4-deployment/SPEC.md`
- `docs/tasks/M1-T4-deployment/TODO.md`
- `docs/tasks/M1-T4-deployment/RESULT.md`
- `docs/tasks/M1-T4-deployment/QA.md`

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
