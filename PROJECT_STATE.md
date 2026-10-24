# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M5 — Perpetual Futures 초기·유지증거금/레버리지 위험 엔진 (로컬 모의 구현)**
- 현재 TASK: **M5-T3 — SIMULATION_ONLY 영속 위험/주문 예약·양측 포지션 원자 게이트 (Next)**
- 상태: M2-T4 로컬 완료 (A 코어/B 영속 매칭/C API 자동 체결/D 검증된 정산 원장 후보 어댑터); M2-T5-A~E 로컬 검증 완료 (E HTTP→체결→Outbox→정산 후보→모의 영수증 종단간 인수). 실제 PostgreSQL 15 임시 개발 서버의 복수 연결 검증과 Foundry 로컬 회귀 완료; 경제/위험 정책·실체인 정산·운영/스테이징 DB는 미승인/미완료
- 최근 완료: M1 전체 및 M2-T1/T2/T3/T4 로컬 완료. M2-T5-A policy-gated 영속 Settlement Outbox, 동시 claim·lease fencing·retry·DB 재시작 복구 구현. M2-T5-C 영속 dry-run/ABI 인코딩·중복 의도 차단/UNKNOWN 격리 구현, M2-T5-E 신규 HTTP~정산 전 단계 E2E 통합 테스트 3개 포함 백엔드 전체 149/149 통과 및 TypeScript 검사 성공 (2026-10-24). 임시 실제 PostgreSQL 15 다중 연결 4/4×3 및 Foundry 35/35 검증 추가 완료; 스테이징/운영 PostgreSQL QA 별도 이관
- 다음 작업은 사람 확인/승인 필요: 실제 스테이징/운영 PostgreSQL의 정책·백업·멀티프로세스/001~007 인수 (임시 개발용 DB 서버는 검증 후 정지), 정책/리스크·승인자/자산/금액 결정, 실제 체인 정산 실행과 read-only 영수증/settledTrades·최종성 통합, 운영 배포·push. 로컬 PostgreSQL 복수 연결 및 Foundry 테스트는 현재 완료. 검증 가이드 `docs/releases/M2-LOCAL-ACCEPTANCE.md`. 미확정 신규 기능을 임의로 생성하지 않음. M2-T5-A는 policy-gated Outbox/임대·재시도 기반으로 로컬 완료. 운영 PostgreSQL 멀티프로세스 및 003/004/005/006/007 마이그레이션은 환경/승인 준비 시 별도 수행
- 사람 확인 필요: 개발용 PostgreSQL 15.19는 별도 임시 Unix socket 클러스터에서 다중 연결을 검증했지만, 운영/스테이징 DB의 멀티프로세스/권한/백업 및 마이그레이션은 여전히 미실행. 신규 `005_settlement_outbox.sql`/`006_settlement_intents.sql`/`007_settlement_reconciliations.sql` 운영 마이그레이션도 미실행. 실제 시장별 토큰·정밀도/마진·위험·수수료 정책과 신뢰된 정책 승인자/금액은 운영자 확인이 필요하며 자동 생성·승인하지 않음. M2-T5-B는 정책 입력과 체결별 EIP-712 서명 검증만 구현. Foundry 1.8.5 로컬 테스트 35/35 통과, Solidity invariant 128,000 calls 통과. 실제 배포/체인 RPC/영수증 검증은 미실행. 명시적으로 승인된 임시 PostgreSQL/Foundry 로컬 QA는 완료했으며, 실제 릴리스/온체인 연결은 추가 사람 승인 및 외부 환경 준비 대기. 운영/스테이징 DB 실제 마이그레이션·API 배포·Sepolia broadcast는 승인 없이 수행하지 않음. 원격 push는 AutoPilot 작업에서 제외한다.

## 2026-10-24 M5-T2 reduce-only·사전 체결 위험 검증

- `backend/src/perp/pre-trade-risk.ts`: M4 순수 가상 체결 + M5-T1 모의 위험평가 통합. 전체 주문량과 단일 부분 체결량을 분리해 reduce-only FLAT/증가·수량 초과·비-reduce-only 무단 방향 반전 차단. 위험 증가 시 기존·체결 후 IM/MM/Equity·레버리지·reserved margin 판정, 감소 시 기존 위험이 악화되지 않는지 별도 검사. 예상 전이/위험 리포트는 전부 **SIMULATION_ONLY / executionAuthorized:false**, 실행 승인/자산 이동/DB 기록 아님.
- `backend/test/perp-pre-trade-risk.test.ts` 신규 **22/22개**, 전체 백엔드 **276/276 통과**, TypeScript 빌드 성공. TASK: `docs/tasks/M5-T2-pre-trade-risk/{SPEC,TODO,QA,RESULT}.md`. 다음 **M5-T3** 안전한 시뮬레이션 전용 영속 위험·양측 원자 체결/증거금 예약 검사; M5-T4 개발용 실제 PostgreSQL QA. 운영 정책/실 체인/계정 입금 증빙·배포·push는 미승인.

## 2026-10-24 M5-T1-A 초기/유지증거금·Equity/레버리지 모의 위험 엔진

- `backend/src/perp/risk-engine.ts`: M3 신뢰 MarketConfig/모의 가격 스냅샷·M4 포지션·M3 격리 available/reserved/position margin 장부 수치로 **읽기 전용** BigInt 기반 mark notional·IM/MM·Equity·유효 leverage·위험 상태를 계산. 명목가치·증거금은 보수적 올림, 미세 손실은 0에서 멀어지는 올림/이익은 버림, 정확한 범위/스코프 정책 검증. 현재 포지션 realized PnL이 M3 금전 원장에 정산되지 않았으므로 `realizedPnlBookedAtomic:'0'`만 허용. 평가 출력 `executionAuthorized:false` 고정; 자금 이동/청산/실주문·공개 API 미연결.
- 신규 `backend/test/perp-risk-engine.test.ts` 로컬 단위 테스트 **21/21**, 백엔드 전체 **254/254** 통과 및 TypeScript build 성공; 결과 `docs/tasks/M5-T1-isolated-risk-engine/{SPEC,TODO,QA,RESULT}.md`. 현재 운영 시장별 IM/MM/leverage·실토큰 정책/오라클 출처는 별도 사용자 승인 전 미확정. 다음 **M5-T2** pure SIMULATION_ONLY reduce-only·post-fill 위험 사전평가 기능.

## 2026-10-24 M4-T4 실제 PostgreSQL 동시성·재시작 QA

- 기존 승인 범위의 임시 PostgreSQL 15.19 Unix socket 전용 서버, test DB `perpdex_autopilot_test`에 신규 전용 `perp_qa_<12hex>` 스키마로 010/011을 로컬 적용. **seed 9/9, 실제 `pg_ctl restart` 후 별도 Node 프로세스 verify 2/2 통과**, 백엔드 전체 **233/233**, TypeScript 빌드 통과. 16-connection pool 동시 동일/서로 다른 fill ID, 단일 vs 양측 market mode 초기화 경쟁, 상대 version 거부, SELL journal/최종 receipt SQL 실패 rollback, 영속 OI/체결 ID 복구 확인.
- `backend/qa/postgres-paired-clearing.test.ts`, `backend/package.json`에 사용자 옵트인 `test:postgres-paired` 추가. 검증에서 제품 코드 버그는 재현되지 않았으며 실제 주문/증거금 이동/운영 DB/배포/온체인/push는 여전히 미실행. QA: `docs/tasks/M4-T4-postgres-paired-concurrency/{SPEC,TODO,QA,RESULT}.md`.
- **M5-T1 Next:** 검증된 trusted MarketConfig/PriceSnapshot 및 M4 position signed amount/PNL을 읽는 순수 위험 엔진(초기·유지 증거금/실제 총순가치 평가/레버리지/무효 가격/반올림), 모의 입력용 로컬 테스트. 공식 market risk parameters 및 신뢰된 collateral deposit/withdraw/fee/funding 정책은 운영자 승인까지 미확정, 실거래 경로 결합 금지.

## 2026-10-24 M4-T3 양측 모의 체결·시장 OI

- `backend/sql/011_perp_pair_clearing.sql`: 시장별 OI `PAIRED/UNPAIRED` 스코프 및 append-only 공통 거래 ID·양측 포지션 FK 영수증. `backend/src/perp/paired-clearing.ts`: **SIMULATION_ONLY** 한 fillId에서 BUY/SELL 둘을 내부 생성하여 **한 DB 트랜잭션**으로 원자 기록. LONG=SHORT 수량 합계와 시장 tracked OI/version을 검사하며 SQL 장애 시 모두 rollback.
- `backend/src/perp/position-ledger.ts`: 같은 SqlRunner 사용 가능한 내부 원장 처리 함수 분리·M4-T2 기존 public API 유지, PAIRED 시장에 단일 계정 writer 진입 금지, UNPAIRED legacy 시장 고유 row lock으로 초기화 경쟁 차단.
- 신규 `backend/test/perp-paired-clearing.test.ts` PGlite 신규 **15/15**, 백엔드 전체 **233/233** 통과, TypeScript 빌드 성공 (정상/복구·OI/중복·동시성·원자 장애). 문서 `docs/tasks/M4-T3-paired-position-clearing/`. M4-T4 실 PostgreSQL 멀티 연결/복구가 다음 독립 QA. 여전히 M2 공개 주문·담보/실자산·RPC·배포·push 연결 없음.

## 2026-10-24 M4-T2 영속 포지션 원장

- `backend/sql/010_perp_position_ledger.sql`: 시장/담보/체인/계정 스냅샷 + `(chain_id,verifying_contract,account,fill_id)` unique append-only 모의 체결 적용 이력, 동일 매수·매도 체결 ID는 **서로 다른 계정**에서 공유할 수 있으나 같은 계정은 비연속 과거 ID 재적용 불가. 계정/시장별 version unique/DB FK·이력 UPDATE/DELETE 차단 트리거.
- `backend/src/perp/position-ledger.ts`: M4-T1 순수 함수·신뢰된 정책/price 검증 재사용, 초깃값 0 스냅샷→row lock→latest journal 일치·중복 ID 방어→모의 순수 체결 계산→저장 이력·snapshot CAS의 원자적 commit. 입력은 내부 **SIMULATION_ONLY**뿐이며 실제 M2 Matching, M3 영속 담보·Vault·실 주문과 연결하지 않음.
- 새 PGlite 통합 테스트 **15/15**, 백엔드 전체 **218/218** 및 TypeScript build 통과 (양측 동일 ID·계정 비연속 재전송, 동시 요청/버전, 시장/도메인 격리, DB 실패 롤백, 재시작, 이력 변조 감지). TASK: `docs/tasks/M4-T2-position-ledger/{SPEC,TODO,QA,RESULT}.md`.
- **M4-T3 Next**: 양측 모의 체결을 같은 DB transaction에서 적용하고 long/short market OI 및 두 계정 PnL·수량 보존을 검증. M4-T4 임시 PostgreSQL 멀티 연결/복구 QA. 운영·실자산·RPC·배포/push 승인 없음.

## 2026-10-24 M4-T1-A 순수 포지션 엔진

- `backend/src/perp/position-engine.ts`에 **SIMULATION_ONLY** One-way LONG/SHORT, 가중 원가의 정확한 `quantityAtomic × entryPriceAtomic` numerator, 같은 방향 추가/부분·전량 종료/반전/누적 realized/mark 기반 unrealized PnL 및 strict int256/uint256 검사 구현. `backend/test/perp-position-engine.test.ts` 신규 19개 및 백엔드 전체 **203/203 통과**, TypeScript 빌드 성공. 기본 MarketConfig·mock PriceSnapshot과 scope binding, stale/mismatch/mark price deviation 차단. 실 증거금·공개 주문/매칭/체인·운영 DB/실자산 미연결.
- **M4-T2 Next:** 순수 함수에는 영속 ID 집합이 없어 비연속 같은 fillId가 재실행될 수 있다는 회귀 사례가 존재. 다음 작업에서 fillId `UNIQUE` DB constraint + snapshot/journal 원자적 커밋 + 실제 DB 재시작 복구/성공·실패·재시도 테스트를 반드시 구현. 입출금/포지션 마진 손익 회계는 M5 승인된 위험 엔진 전까지 실제 잔액에 반영 금지.
- TASK 문서: `docs/tasks/M4-T1-position-state-transitions/{SPEC,TODO,QA,RESULT}.md`.

## 2026-10-24 M3-T4 실 PostgreSQL 로컬 검증

- 임시 PostgreSQL 15.19 전용 Unix socket·`nobody`·테스트 DB에서 실제 16-slot `pg.Pool` 다중 연결의 M3-T3 shadow 주문 nonce/증거금 경합, 동시 취소·중복 해제, 강제 SQL 실패·원자 롤백, 서버 재시작 후 별도 Node 프로세스의 원장·Nonce·멱등 재생 검증. 새 `backend/qa/postgres-perp-sim.test.ts`, 관리자 수동 `npm run test:postgres-perp`만 사용. **seed 8/8 + restart verify 1/1, 기존 M2 PG 4/4, 전체 백엔드 184/184 및 빌드 통과**. 실 서비스 코드의 재현된 결함은 없어 기능 재설계/임의 수정하지 않음.
- 다음 독립 개발 항목 **M4-T1 포지션 엔진 순수 수학·상태전이 구현**. M3-T2-B의 실제 입출금 증빙/자금 정책, M3-T3-B의 부분 체결·증거금 할당은 여전히 사람 승인과 M4/M5 위험 엔진 선행 필요. 공개 주문 API·실거래/실자산·실체인·배포/remote push 사용하지 않음.
- QA 파일: `docs/tasks/M3-T4-postgres-margin-concurrency/{SPEC,TODO,QA,RESULT}.md`.

## 2026-10-24 M3-T3-A 실구현

- `009_perp_sim_orders.sql` 및 `backend/src/perp/sim-order.ts`: M2 v1과 분리된 signed v2 **SIMULATION_ONLY** 격리 마진 shadow order 저장, trusted MarketConfig 전체 해시·mock Oracle·시장/도메인·token binding, nonce+shadow row+RESERVE 원자적 commit, 서명 cancel+nonce tombstone+RELEASE 원자적 commit. 정상·실패·중복·장애 복구 신규 10개, 백엔드 전체 184/184 통과. 실 자산·실체인·공개 주문 API/체결·포지션 조정은 없음.
- M3-T3 부분 체결 예약 재조정은 M4/M5의 포지션/리스크 회계가 선행되지 않아 안전하게 구현할 수 없으므로 **미완료 B**로 분리. M3-T4 실제 PostgreSQL 복수 연결 QA는 독립 진행 가능.
- 사람 확인 필요: 공식 collateral/market 위험 수치·오라클 공급, 실 입금 증빙·Vault locked margin 출금 게이트, 실 운영/스테이징 변경·송신/배포/push 승인.

## 2026-10-24 무기한 선물 제품 결정 및 자동 개발 범위

- 사용자 확정 방향: **Perpetual Futures DEX**. 기존 M2 EIP-712 지정가·FIFO·원장/Outbox는 재사용하지만, 현물 유사 `BUYER_TO_SELLER` 토큰 이전을 선물 회계의 실제 Settlement로 자동 적용하지 않음.
- 새 마일스톤: M3 시장·오라클/격리 증거금 → M4 포지션 → M5 레버리지/주문 위험 → M6 펀딩 → M7 청산·보험 → M8 전용 온체인 ClearingHouse/보안.
- 초기 로컬 설계 가정: 단일 모의 BTC-USD-PERP 시장, USDC 격리 증거금, one-way 포지션. 실제 collateralToken/IM/MM/leverage/funding/fee/OI 한도 및 oracle 출처는 운영 승인 전 **미정**.
- **M3-T2-A 내부 증거금 원장 구현 및 백엔드 전체 174/174 테스트 통과**: `008_perp_margin_ledger.sql`, `backend/src/perp/margin-ledger.ts`에 가용/예약/포지션 3버킷과 고유 operation 이중 분개·로컬 롤백/재시작 검증. 공개 주문/체인 미연결. 실제 입금 없이 계정을 credit하는 production API를 만들지 않았고, 테스트 전용 opening SQL fixture만 존재.
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
- M3-T2-A 로컬 결과: `docs/tasks/M3-T2-isolated-margin-ledger/{SPEC,TODO,QA,RESULT}.md`
- M3-T3-A 로컬 결과: `docs/tasks/M3-T3-sim-margin-admission/{SPEC,TODO,QA,RESULT}.md`
- M3-T4 PostgreSQL QA 결과: `docs/tasks/M3-T4-postgres-margin-concurrency/{SPEC,TODO,QA,RESULT}.md`
- M4-T1 순수 포지션 엔진: `docs/tasks/M4-T1-position-state-transitions/{SPEC,TODO,QA,RESULT}.md`
- M4-T2 영속 체결/스냅샷: `docs/tasks/M4-T2-position-ledger/{SPEC,TODO,QA,RESULT}.md`
- M4-T3 양측 모의 체결/OI: `docs/tasks/M4-T3-paired-position-clearing/{SPEC,TODO,QA,RESULT}.md`

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
