# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M2 — Off-chain Order API & Matching MVP**
- 현재 TASK: **M2-T4-A — 가격·시간 우선 Matching Engine 순수 코어** (다음 작업)
- 상태: Ready (M2-T3 로컬 구현·HTTP/PGlite 67/67 QA 완료, M2-T4-A 순수 매칭 코어 착수 예정)
- 최근 완료: M1 전체 및 M2-T1/T2/T3 로컬 완료; M2-T3 주문 생성·조회·취소 HTTP 및 서명 기반 영속 재전송 멱등성 구현, 백엔드 67/67 테스트·TypeScript 타입 검사 통과 (2026-10-24). 운영 PostgreSQL QA는 별도 이관
- 다음 미완료 항목: M2-T4-A 순수 가격·시간 우선 오더북/부분 체결 엔진 구현 및 결정적 테스트 → M2-T4-B DB 정합성·체결 저장. 운영 PostgreSQL 멀티프로세스/003 운영 마이그레이션은 환경·승인 준비 시 별도 수행
- 사람 확인 필요: 실제 PostgreSQL 서버/CLI/Docker가 없어 운영 환경의 DB 다중 연결·멀티프로세스 검증은 미실행. `forge`가 없어 Foundry 회귀 미실행. DB 실제 마이그레이션·API 배포·Sepolia broadcast는 승인 없이 수행하지 않음. 원격 push는 AutoPilot 작업에서 제외한다.

## 현재 TASK 문서

- M2-T1 결과: `docs/tasks/M2-T1-order-domain/RESULT.md`, `QA.md` (완료)
- M2-T2 로컬 완료: `docs/tasks/M2-T2-eip712-auth/{SPEC,TODO,RESULT,QA}.md` (운영 실서버 QA 이관)
- M2-T3 로컬 완료: `docs/tasks/M2-T3-order-api/{SPEC,TODO,RESULT,QA}.md` (운영 DB QA 이관)
- 다음 M2-T4-A: `docs/tasks/M2-T4-price-time-matching/{SPEC,TODO,RESULT,QA}.md`

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
