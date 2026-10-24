# ROADMAP

## M1 — 온체인 자금 보관·정산 기반

목표: Off-chain 주문/매칭 시스템이 사용할 최소한의 안전한 온체인 자금 보관 및 정산 레이어를 구축한다.

| TASK | 내용 | 상태 |
|---|---|---|
| M1-T1 | `CollateralVault` ERC-20 입금/출금 및 내부 잔액 회계 | Completed |
| M1-T2 | 권한 있는 settlement executor와 원자적 내부 잔액 이전 | Completed |
| M1-T3 | 자산 allowlist, pause, 역할 기반 관리 및 보안 회귀 테스트 | Completed |
| M1-T4 | 배포 스크립트, Sepolia 환경변수/설정 및 로컬 배포 검증 | Completed |
| M1-T5 | 통합 테스트, invariant/fuzz 보강, GitHub Actions CI 및 M1 릴리스 정리 | Completed |

## M2 — Off-chain Order API & Matching MVP

목표: 서명된 주문을 안전하게 수신·검증하고 가격-시간 우선으로 매칭한 뒤 M1의 온체인 settlement 경로와 연결하는 최소 Off-chain MVP를 구축한다.

| TASK | 내용 | 상태 |
|---|---|---|
| M2-T1 | 주문 도메인 모델, 입력 검증 및 상태 머신 기반 | Completed |
| M2-T2 | EIP-712 주문 서명 검증, nonce 및 replay 방지 | Completed (로컬 검증; 실서버 QA 이관) |
| M2-T3 | Order REST API와 주문 저장/조회/취소 흐름 | Completed (로컬 HTTP/PGlite; 운영 DB QA 이관) |
| M2-T4 | 가격-시간 우선 Matching Engine 및 부분 체결 | Completed (A~D 로컬 구현 및 통합 QA; 운영 PostgreSQL/온체인 정산 미검증 별도) |
| M2-T5 | 매칭 결과 settlement 연동, 통합 테스트 및 M2 릴리스 정리 | Local QA Completed (A~E 및 실제 PostgreSQL 15 복수 연결·Foundry 35/35 통과, 실운영 PostgreSQL·시장/위험 정책·실체인 정산은 별도 승인 필요) |


## M3~M8 — 무기한 선물 DEX 개발 (2026-10-24 확정된 제품 방향)

제품: **Perpetual Futures DEX**. 최초 개발 프로파일은 단일 모의 BTC-USD-PERP 시장, USDC 격리 마진, one-way 포지션. 위험 숫자/실시장·배포는 승인 전 설정하지 않는다. 세부 설계: `docs/architecture/PERPETUAL-MVP-DESIGN.md`.

| 마일스톤 | 목적 | 상태 |
| --- | --- | --- |
| **M3** | 고정소수점/신뢰 시장·오라클 입력, 이중 분개 격리 담보·주문 증거금 예약 | **Local foundation QA completed — M3-T1/T2-A/T3-A/T4 완료, M3-T2-B 및 T3-B는 실거래 승인/포지션·리스크 의존성 대기** |
| **M4** | 순롱·순숏 포지션, 부분 체결·평균 진입가·realized/unrealized PnL, OI 영속 | **In Progress — M4-T1 순수 엔진·M4-T2 영속 원장 로컬 완료, M4-T3 양측 모의 clearing/OI 다음** |
| **M5** | 레버리지·초기/유지증거금 위험 엔진, signed order v2·reduce-only·원자적 체결 게이트 | Planned (M4 선행) |
| **M6** | funding index/rate 및 주기적 롱·숏 펀딩 분개·재시작 복구 | Planned (M5 선행) |
| **M7** | 유지증거금 기반 부분/전체 청산, 보험기금·bad debt 및 위험 상태 머신 | Planned (M6 선행) |
| **M8** | 전용 MarginVault/ClearingHouse, 포지션·PnL·출금 안전성, Foundry·실 PG 로컬 인수 | Planned (실체인/운영은 별도 승인) |

주의: M1 Vault의 현재 `withdraw()`는 오프체인 locked margin을 강제하지 않으며, M2 `BUYER_TO_SELLER` direct settlement는 선물 포지션 회계가 아니다. 새 로컬 위험 엔진이 마련되어도 M8 이전에 사용자 실자금·운영 활성화를 금지한다.

M3 시작 TASK: `docs/tasks/M3-T1-market-risk-foundation/{SPEC,TODO,RESULT,QA}.md`.


### M3 실제 TASK 현황

| TASK | 구현 및 검증 | 상태 |
| --- | --- | --- |
| M3-T1 | trusted MarketConfig, BigInt fixed-point, mock PriceSnapshot, tick/lot/오라클 경계 | Local Completed (13개 신규 테스트; 운영 정책 미승인) |
| M3-T2 | 영속 증거금 이중 분개 원장, 계정별 available/reserved/position margin와 잔액·중복 불변식 | In Progress (A 내부 이동·두 분개 로컬 구현 완료, B 예치 증빙/실정산 통합은 보안 승인 대기) |
| M3-T3 | 서명 주문 전 증거금 예약·취소 해제의 DB 원자성/복구 | In Progress: A v2 SIMULATION_ONLY 예약·취소 원자성 로컬 완료, B 부분 체결/포지션 위험 검사 연결 대기 |
| M3-T4 | 격리 계정·실 PostgreSQL 다중 연결/리플레이 회귀 | Local Completed (실 PostgreSQL 15 seed 8/8, 서버 재시작 후 verify 1/1, 기존 M2 PG 4/4) |

### 현재 활성 개발: M4 포지션 엔진

- **M4-T1-A Local Completed:** `backend/src/perp/position-engine.ts`의 순수 One-way LONG/SHORT, 축소/전량 종료/반전, 정확한 cost basis 및 realized/unrealized BigInt PnL, stale policy/oracle 실패 안전 (신규 19개 테스트).
- **M4-T2 (Local Complete):** 모의 계정별 fillId 영속 UNIQUE·append-only 포지션 이력/스냅샷 및 row lock + version CAS, 재시작·오류 롤백·장부 무결성 PGlite 15개. **M4-T3 (Next):** 양측 동일 체결 ID를 하나의 트랜잭션으로 원자적 적용하고 시장별 LONG/SHORT OI 합계·재생 불변식을 검증. M4-T4 PG 회귀. M5 주문 위험/포지션 승인과 원자적 예약. 별도 승인 전 실 주문 활성화 금지.
