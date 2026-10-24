# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M3 — Perpetual Futures 시장·증거금 회계 기반**
- 현재 TASK: **M3-T2 — 영속 격리 증거금 이중 분개 원장 (Next)**
- 상태: M2-T4 로컬 완료 (A 코어/B 영속 매칭/C API 자동 체결/D 검증된 정산 원장 후보 어댑터); M2-T5-A~E 로컬 검증 완료 (E HTTP→체결→Outbox→정산 후보→모의 영수증 종단간 인수). 실제 PostgreSQL 15 임시 개발 서버의 복수 연결 검증과 Foundry 로컬 회귀 완료; 경제/위험 정책·실체인 정산·운영/스테이징 DB는 미승인/미완료
- 최근 완료: M1 전체 및 M2-T1/T2/T3/T4 로컬 완료. M2-T5-A policy-gated 영속 Settlement Outbox, 동시 claim·lease fencing·retry·DB 재시작 복구 구현. M2-T5-C 영속 dry-run/ABI 인코딩·중복 의도 차단/UNKNOWN 격리 구현, M2-T5-E 신규 HTTP~정산 전 단계 E2E 통합 테스트 3개 포함 백엔드 전체 149/149 통과 및 TypeScript 검사 성공 (2026-10-24). 임시 실제 PostgreSQL 15 다중 연결 4/4×3 및 Foundry 35/35 검증 추가 완료; 스테이징/운영 PostgreSQL QA 별도 이관
- 다음 작업은 사람 확인/승인 필요: 실제 스테이징/운영 PostgreSQL의 정책·백업·멀티프로세스/001~007 인수 (임시 개발용 DB 서버는 검증 후 정지), 정책/리스크·승인자/자산/금액 결정, 실제 체인 정산 실행과 read-only 영수증/settledTrades·최종성 통합, 운영 배포·push. 로컬 PostgreSQL 복수 연결 및 Foundry 테스트는 현재 완료. 검증 가이드 `docs/releases/M2-LOCAL-ACCEPTANCE.md`. 미확정 신규 기능을 임의로 생성하지 않음. M2-T5-A는 policy-gated Outbox/임대·재시도 기반으로 로컬 완료. 운영 PostgreSQL 멀티프로세스 및 003/004/005/006/007 마이그레이션은 환경/승인 준비 시 별도 수행
- 사람 확인 필요: 개발용 PostgreSQL 15.19는 별도 임시 Unix socket 클러스터에서 다중 연결을 검증했지만, 운영/스테이징 DB의 멀티프로세스/권한/백업 및 마이그레이션은 여전히 미실행. 신규 `005_settlement_outbox.sql`/`006_settlement_intents.sql`/`007_settlement_reconciliations.sql` 운영 마이그레이션도 미실행. 실제 시장별 토큰·정밀도/마진·위험·수수료 정책과 신뢰된 정책 승인자/금액은 운영자 확인이 필요하며 자동 생성·승인하지 않음. M2-T5-B는 정책 입력과 체결별 EIP-712 서명 검증만 구현. Foundry 1.8.5 로컬 테스트 35/35 통과, Solidity invariant 128,000 calls 통과. 실제 배포/체인 RPC/영수증 검증은 미실행. 명시적으로 승인된 임시 PostgreSQL/Foundry 로컬 QA는 완료했으며, 실제 릴리스/온체인 연결은 추가 사람 승인 및 외부 환경 준비 대기. 운영/스테이징 DB 실제 마이그레이션·API 배포·Sepolia broadcast는 승인 없이 수행하지 않음. 원격 push는 AutoPilot 작업에서 제외한다.

## 2026-10-24 무기한 선물 제품 결정 및 자동 개발 범위

- 사용자 확정 방향: **Perpetual Futures DEX**. 기존 M2 EIP-712 지정가·FIFO·원장/Outbox는 재사용하지만, 현물 유사 `BUYER_TO_SELLER` 토큰 이전을 선물 회계의 실제 Settlement로 자동 적용하지 않음.
- 새 마일스톤: M3 시장·오라클/격리 증거금 → M4 포지션 → M5 레버리지/주문 위험 → M6 펀딩 → M7 청산·보험 → M8 전용 온체인 ClearingHouse/보안.
- 초기 로컬 설계 가정: 단일 모의 BTC-USD-PERP 시장, USDC 격리 증거금, one-way 포지션. 실제 collateralToken/IM/MM/leverage/funding/fee/OI 한도 및 oracle 출처는 운영 승인 전 **미정**.
- **M3-T1 시장/오라클/BigInt 검증 기반은 로컬 구현 및 신규 13개·전체 백엔드 162/162 테스트 통과**. 다음 M3-T2 이중 분개 영속 원장은 사람의 추가 승인 없이 로컬 구현·검증 가능. 실제 체인/키/실자산/운영·스테이징 DB·배포·원격 push는 기존 승인 제한을 계속 유지.
- 핵심 위험: 기존 `CollateralVault.withdraw()`는 DB `reservedMargin`을 보호하지 못하고, `settle()`은 사용자간 직접 잔액 이전뿐. 실제 선물 출금/정산은 M8 신규 MarginVault/ClearingHouse와 엄격한 위험/회계 불변식 없이는 사용 금지.
- 상세 설계: `docs/architecture/PERPETUAL-MVP-DESIGN.md`. 이번 회차 M3-T1 세 검증 모듈과 새 순수 테스트 13개를 구현. 실제 정책 승인/정산·운영 배포는 미실행.

## 현재 TASK 문서

- M2-T1 결과: `docs/tasks/M2-T1-order-domain/RESULT.md`, `QA.md` (완료)
- M2-T2 로컬 완료: `docs/tasks/M2-T2-eip712-auth/{SPEC,TODO,RESULT,QA}.md` (운영 실서버 QA 이관)
- M2-T3 로컬 완료: `docs/tasks/M2-T3-order-api/{SPEC,TODO,RESULT,QA}.md` (운영 DB QA 이관)
- M2-T4 완료 문서: `docs/tasks/M2-T4-price-time-matching/{SPEC,TODO,RESULT,QA}.md` (A~D 로컬 구현/검증 완료, 운영 E2E 이관)

- 현재 M2-T5: `docs/tasks/M2-T5-settlement/{SPEC,TODO,QA,RESULT}.md` (A~E 로컬 및 승인된 실제 PostgreSQL/Foundry QA 완료, 실체인/운영 QA 별도 승인 대기)
- 개발용 DB·Foundry 실검증: `docs/releases/M2-LOCAL-PG-FOUNDRY-QA.md`
- M3-T1 로컬 완료: `docs/tasks/M3-T1-market-risk-foundation/{SPEC,TODO,RESULT,QA}.md`
- 다음 M3-T2: 영속 격리 담보 이중 분개·증거금 예약/해제 구현 (별도 소규모 TASK 문서 신규 작성)

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
