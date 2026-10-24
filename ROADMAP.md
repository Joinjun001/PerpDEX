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
| **M4** | 순롱·순숏 포지션, 부분 체결·평균 진입가·realized/unrealized PnL, OI 영속 | **M4 local foundation complete — T1/T2/T3 로컬 구현 및 T4 임시 PostgreSQL seed 9/9·재시작 verify 2/2 완료; 운영/실체인 인수는 별도 승인 대기** |
| **M5** | 레버리지·초기/유지증거금 위험 엔진, signed order v2·reduce-only·원자적 체결 게이트 | **In Progress — M5-T1/T2 순수 위험/주문 평가, M5-T3-A 영속 모의 reduce-only 용량 예약/소진·취소 로컬 구현, B 원자 양측 clearing 결속 다음** |
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
- **M4-T2 (Local Complete):** 모의 계정별 fillId 영속 UNIQUE·append-only 포지션 이력/스냅샷 및 row lock + version CAS, 재시작·오류 롤백·장부 무결성 PGlite 15개. **M4-T3 (Local Complete):** 동일 거래 ID·시장·가격·수량으로 양측 원자적 스냅샷/이력, LONG=SHORT OI 집계·시장 락·PAIRED/UNPAIRED 격리. **M4-T4 (Local QA Complete):** 실 PostgreSQL 16-connection pool·최초 시장 생성/동시 체결/SQL rollback 및 서버 재시작 검증 (9+2개). **M5-T1 (Next):** 로컬 초기·유지증거금/레버리지·equity/risk 평가 엔진. M5 주문 위험/포지션 승인과 원자적 예약. 별도 승인 전 실 주문 활성화 금지.

### 현재 활성 개발: M5 위험평가·사전 주문 게이트

- **M5-T1-A (Local Completed):** `backend/src/perp/risk-engine.ts`에 trusted 테스트 정책/가격·M4 포지션·M3 3-버킷 이중분개 마진 스냅샷을 입력받는 순수 BigInt mark-based notional/IM/MM/Equity/realized·unrealized PnL/레버리지·위험 등급. 초과 손실·반올림·버전/계정 mismatch 실패 안전, 신규 21개 테스트. `executionAuthorized:false`와 `realizedPnlBookedAtomic:'0'`로 실 주문·정산 부재를 명확히 고정.
- **M5-T2 (Local Completed):** `backend/src/perp/pre-trade-risk.ts`의 전체 주문량·가상 부분 체결량 분리, reduce-only flat/증가/과다 금지 및 비-reduce-only 반전 방지, M4 전이 후 IM/MM/Equity/레버리지 위험 등급·증거금 예약 고려 검사 (신규 22개 테스트). **M5-T3-A (Local Completed):** `012_perp_reduce_reservations.sql` 기반 SIMULATION_ONLY reduce-only account guard/예약 합계/가상 소진·취소·원자적 history; M3 잔고/버전과 M4 position version·trusted oracle hash 검증. **M5-T3-B1 (Local Completed):** 양측 FULL reduce-only 예약을 같은 TX에서 M4 paired OI·양쪽 position·공통 receipt 및 M5 두 주문 소진 event와 원자 처리; guarded 계정의 M4 direct paired/standalone 공개 writer 우회 차단. **M5-T3-B2 (Local Completed):** 양측 SIMULATION_ONLY 여러 reduce-only 예약 동시 존재시 지정 주문 부분 체결/연속 소진·다른 OPEN 주문 post-position/version 위험 재평가와 양측 OI 원자 기록. **M5-T3-B3-A (Local Completed):** 신규 013 지연 COMMIT 트리거로 guarded 포지션·양측 M4 체결/Reduce-only 소진·시장 OI 무결성 강제, arbitrary `guarded=true` 호출을 정책/오라클/마진 검증된 예약 주문 ID로 교체. **M5-T3-B3-B (Local Completed):** SQL 014로 guard/주문/event 직접 변조/삭제 및 shadow 원장 불변식 커밋 검증, 013/014 미설치·비활성 시 B1/B2 fail-closed. DB 최소권한·실 PG role QA는 미실행, 운영 권한 승인 필요. **M5-T3-C1 (Local Completed):** 서명된 v2 비-Reduce-only M3 shadow OPEN 주문의 nonce/영속 RESERVE posting·3개 margin 버킷과 M4 position/OI·M5 before/after risk를 1TX read-only 평가. `executionAuthorized:false`, DB 체결·자금 이동 없음. **M5-T3-C2-A (Local Completed):** 양측 signed v2 OPEN 주문의 공통 후보 체결가/수량과 M3 예약/nonce, M4 position/OI, M5 양측 pre/post risk를 1TX 읽기 전용 검증. **M5-T3-C2-B1 (Local Completed):** SQL 015 signed OPEN 우회 writer·무연계 ALLOCATE 차단과 nonce/원장/포지션 commit-time fence, 예약 하한·영속 이력 불변식. **M5-T3-C2-B2-A (Local Completed):** signed 양측 전량 FLAT opening 후보의 EIP-712/예약·위험 트랜잭션 검증과 불변 PREPARED 영수증 영속화 (SQL 016, 체결 권한 없음). **M5-T3-C2-B2-B (Next):** 실물 아닌 로컬 SIMULATION_ONLY 양측 M4/OI·M3 할당·signed 주문 소진을 검증된 terminal 영수증의 단일 TX로 결속. **M5-T3-C3:** M3 부분 버킷 배분·realizedPnL/fee/funding/취소 경쟁 결산. 이후 M5-T4 실제 PG QA. 실 시장 위험 숫자/자산/fee/funding/청산·M8 온체인 인출 정책은 사용자/운영 승인 전 비활성화.
