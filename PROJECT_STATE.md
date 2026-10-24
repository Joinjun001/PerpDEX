# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M2 — Off-chain Order API & Matching MVP**
- 현재 TASK: **M2-T5-E 로컬 인수 완료 — 실제 PostgreSQL·정산 정책·온체인 릴리스 승인 대기**
- 상태: M2-T4 로컬 완료 (A 코어/B 영속 매칭/C API 자동 체결/D 검증된 정산 원장 후보 어댑터); M2-T5-A~E 로컬 검증 완료 (E HTTP→체결→Outbox→정산 후보→모의 영수증 종단간 인수). 실제 PostgreSQL·경제/위험 정책·실체인 정산은 미승인/미완료
- 최근 완료: M1 전체 및 M2-T1/T2/T3/T4 로컬 완료. M2-T5-A policy-gated 영속 Settlement Outbox, 동시 claim·lease fencing·retry·DB 재시작 복구 구현. M2-T5-C 영속 dry-run/ABI 인코딩·중복 의도 차단/UNKNOWN 격리 구현, M2-T5-E 신규 HTTP~정산 전 단계 E2E 통합 테스트 3개 포함 백엔드 전체 149/149 통과 및 TypeScript 검사 성공 (2026-10-24). 운영 PostgreSQL QA 별도 이관
- 다음 작업은 모두 사람 승인 필요: 실 PostgreSQL 멀티연결·001~007 DB 스테이징 적용, 정책/리스크·승인자/자산/금액 결정, 실제 체인 정산 실행과 read-only 영수증/settledTrades·최종성 통합 및 Foundry, 운영 배포·push. 검증 가이드 `docs/releases/M2-LOCAL-ACCEPTANCE.md`. 미확정 신규 기능을 임의로 생성하지 않음. M2-T5-A는 policy-gated Outbox/임대·재시도 기반으로 로컬 완료. 운영 PostgreSQL 멀티프로세스 및 003/004/005/006/007 마이그레이션은 환경/승인 준비 시 별도 수행
- 사람 확인 필요: 실제 PostgreSQL 서버/CLI/Docker가 없어 운영 환경의 DB 다중 연결·멀티프로세스 검증은 미실행. 신규 `005_settlement_outbox.sql`/`006_settlement_intents.sql`/`007_settlement_reconciliations.sql` 운영 마이그레이션도 미실행. 실제 시장별 토큰·정밀도/마진·위험·수수료 정책과 신뢰된 정책 승인자/금액은 운영자 확인이 필요하며 자동 생성·승인하지 않음. M2-T5-B는 정책 입력과 체결별 EIP-712 서명 검증만 구현. `forge`가 없어 Foundry 회귀 미실행. 자동으로 진행 가능한 M1/M2 로컬 검증 TASK는 종료했으며, 실제 릴리스/온체인 연결은 사람 승인 및 외부 환경 준비 대기. DB 실제 마이그레이션·API 배포·Sepolia broadcast는 승인 없이 수행하지 않음. 원격 push는 AutoPilot 작업에서 제외한다.

## 현재 TASK 문서

- M2-T1 결과: `docs/tasks/M2-T1-order-domain/RESULT.md`, `QA.md` (완료)
- M2-T2 로컬 완료: `docs/tasks/M2-T2-eip712-auth/{SPEC,TODO,RESULT,QA}.md` (운영 실서버 QA 이관)
- M2-T3 로컬 완료: `docs/tasks/M2-T3-order-api/{SPEC,TODO,RESULT,QA}.md` (운영 DB QA 이관)
- M2-T4 완료 문서: `docs/tasks/M2-T4-price-time-matching/{SPEC,TODO,RESULT,QA}.md` (A~D 로컬 구현/검증 완료, 운영 E2E 이관)

- 현재 M2-T5: `docs/tasks/M2-T5-settlement/{SPEC,TODO,QA,RESULT}.md` (A~E 로컬 완료, 실체인/운영 QA 별도 승인 대기)

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
