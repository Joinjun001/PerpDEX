# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M2 — Off-chain Order API & Matching MVP**
- 현재 TASK: **M2-T2 — EIP-712 주문 서명 검증, nonce 및 replay 방지**
- 상태: In Progress
- 최근 완료: M1 전체, M2-T1 완료; M2-T2 EIP-712 Typed Data 생성 및 EOA 서명 검증 구현, 백엔드 17 tests 통과, build 검사 성공 (2026-10-24)
- 다음 미완료 항목: 영속적이고 원자적인 nonce 사용·취소 및 replay 방지 기능 구현(동시 요청/서버 재시작 테스트 포함)
- 사람 확인 필요: 현재 환경에서 `forge`가 없어 Foundry 회귀 미실행. Sepolia 실제 broadcast 배포는 수동으로 수행한다. 원격 push는 AutoPilot 작업에서 제외한다.

## 현재 TASK 문서

- M2-T1 결과: `docs/tasks/M2-T1-order-domain/RESULT.md`, `QA.md` (완료)
- 현재 M2-T2: `docs/tasks/M2-T2-eip712-auth/{SPEC,TODO,RESULT,QA}.md`

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
7. local commit (원격 push는 AutoPilot 작업에서 제외)
8. 가능한 경우 GitHub Actions CI 확인
9. TASK 완료 후 다음 TASK로 즉시 전환
