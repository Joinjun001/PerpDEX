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

## 제품 UX 레퍼런스 — Hyperliquid

PerpDEX의 핵심 거래 UI·사용자 흐름·주문 및 위험 정보 구성은 **Hyperliquid**를 주요 참고 제품으로 삼는다. 정보 계층·주문 조작 편의성·포지션/주문 이력 통합을 참고하되 브랜드·원본 화면·코드를 복제하지 않는다. P0: 시장 정보 헤더, 차트/호가/주문 3열 터미널, 포지션/현재 주문/이력 하단 탭, Market/Limit 티켓. 자세한 구현 우선순위 및 안전 기준: `docs/architecture/HYPERLIQUID-UX-REFERENCE.md`. Sepolia 기반 오프체인 아키텍처를 Hyperliquid 자체 L1과 동등하다고 표현하지 않는다.

### Hyperliquid UX TASK 진행

- **UX-HL-01-A (Local Completed)**: 차트·호가/최근 체결·주문 폼 3열 터미널, 반응형 시장 정보 바, 고정 MOCK reference/change와 미연결 Mark/Oracle/Funding/OI 구분. 프런트 테스트 15/15 PASS. 문서: docs/tasks/UX-HL-01-terminal-layout/.
- **UX-HL-01-B1 (Local Completed)**: 5개 계정 탭의 ARIA/키보드 탐색·빈 tbody·지갑 미연결 표시, 오프라인 4종 상태 모델. 프런트엔드 21/21 PASS.
- **UX-HL-01-B2-B1 (Local Completed)**: 계정·Sepolia chain·출처·탭/요청 ID/revision/행 원자 수량 검증, 중복·stale/재연결 race 방지 순수 coordinator. 프런트 34/34 PASS.
- **UX-HL-01-B2-B2-A (Local Completed)**: 미연결 기본값을 유지하는 안전한 계정 DOM 렌더러, 상태별 tbody 제거, 고정 컬럼과 textContent, 동시/stale/오류 테스트. 프런트 43/43 PASS.
- **UX-HL-01-B2-B2-B1 (Local Completed)**: 기존 공개 주문 조회는 계정 인증 API가 아님을 검증, 오프라인 계정 세션/동시 query orchestration·전후 세션 재확인·Abort/stale 차단 테스트 (frontend 55/55 PASS).
- **UX-HL-01-B2-B2-B2 (Next, dependent)**: 서버 소유권 인증/계정별 read API가 준비되면 실제 브라우저/렌더러 연결. 준비 전에는 현재 static disconnected 유지하고 C1 검증으로 전환.
- **UX-HL-01-C (Follow-up)**: 실제 브라우저 너비별 시각 확인 및 모바일·접근성 보완.
- **UX-HL-01-D1 (Local Completed)**: 모바일 화면용 가상 호가·최근 체결 접기/펼치기 버튼, 760px 이하 전용 CSS·ARIA/키보드 기본 button·progressive enhancement. 신규 6건, 프런트 85/85 PASS. 실제 브라우저/터치 QA 보류.
- **UX-HL-01-E1 (Local Completed)**: 시간 정보가 없는 합성 차트의 08:00~18:00 축을 샘플 #01~#64로 교체, 시장별 실제 생성 배열에서 MOCK LOW/HIGH·접근성 설명 도출. 신규 6건 포함 프런트 109/109 PASS.
- **UX-HL-01-E2 (Pending browser)**: 차트 대체 텍스트/모바일 반응형 실브라우저·스크린리더 QA 미완료.
- **UX-HL-01-F1 (Local Completed)**: 실제 출처 없는 Recent Trades 임의 시간 18:50 등을 샘플 #01~#09로 교체하고 비실제 체결 기록임을 명시. 신규 3건 포함 프런트 전체 112/112 PASS.
- **UX-HL-01-F2 (Pending browser)**: 실제 브라우저·스크린리더에서 샘플 체결 순서와 모바일 접기 확인 미완료.
- **UX-HL-01-G1 (Local Completed)**: MOCK Order Book Total의 Size × 행번호 계산 오류를 최우선가 기준 누적 Size로 수정. 실제 main.js BTC/ETH/SOL 매수·매도 7행 검증, 전체 프런트 122/122 PASS.
- **UX-HL-01-G2 (Pending browser)**: 호가 Total의 실제 모바일·키보드·스크린리더 가독성 인수 보류.
- **UX-HL-01-H1 (Local Completed)**: prototype 상속 market 이름이 NaN 합성 차트를 반환하고 객체가 BTC로 강제 변환되는 모델 결함 수정. 시장 ID를 BTC/ETH/SOL primitive string own key로 제한. 신규 3건 포함 프런트 125/125 PASS.
- **UX-HL-01-H2 (Pending browser)**: 실제 브라우저에서 시장 ID/모바일/스크린리더 인수 미실행.
- **UX-HL-01-I1 (Local Completed)**: 고정 MOCK 추세 metadata가 실제 합성 64개 샘플 대비 변화율과 다른 오류 수정. BTC/ETH/SOL 마켓 카드·차트·Sample change 및 스크린리더 대체 설명을 처음/마지막 샘플 기준으로 통일, 신규 2건 포함 프런트 전체 132/132 PASS.
- **UX-HL-01-I2 (Pending browser)**: 모의 변화율/색상·모바일/키보드/스크린리더 실제 브라우저 인수 미완료.
- **UX-HL-01-J1 (Local Completed)**: MOCK Order Book 깊이 막대의 임의 CSS --depth를 실제 최우선가 기준 누적 Total / 합성 전체 Size 비율로 수정. BTC/ETH/SOL 양측 7행 통합 회귀 추가, 프런트 144/144 PASS.
- **UX-HL-01-J2 (Pending browser)**: 호가 깊이 막대/누적 Total의 모바일·스크린리더/키보드 실제 화면 인수 미완료.
- **UX-HL-01-K1 (Local Completed)**: 합성 호가 가격·Size·누적 Total에 열 의미가 없던 행별 보조공학 누락 수정. BTC/ETH/SOL 매도/매수 목록과 행 이름, MOCK 출처를 가시 데이터와 동기화. 신규 2건 포함 프런트 146/146 PASS.
- **UX-HL-01-K2 (Pending browser)**: 모의 호가 목록·행을 실제 브라우저/스크린리더·모바일에서 인수 검증 필요.

### Hyperliquid 계정 탭 탐색 UX 진행

- **UX-HL-03-A1 (Local Completed)**: 모바일 5개 계정 탭 클릭/Arrow/Home/End 선택 시 탭이 보이도록 가로 스크롤 영역 위치를 조정, 포커스·ARIA 유지. 신규 8건 포함 프런트 전체 93/93 PASS. 문서 docs/tasks/UX-HL-03-account-tab-navigation/.
- **UX-HL-03-A2 (Pending browser)**: 실제 모바일/브라우저에서 선택 탭 가시성·스크린리더/키보드 확인. 브라우저 도구 부재로 미완료.
- **UX-HL-03-B1 (Local Completed)**: 모바일에서 활성·표시 상태의 계정 테이블이 실제로 가로 overflow일 때만 탐색 안내·키보드 스크롤 포커스 노출. 미연결/데스크톱/작은 표에서는 hidden, 10개 신규·프런트 103/103 PASS.
- **UX-HL-03-B2 (Pending browser)**: 실제 모바일 테이블 가로 스크롤/스크린리더 접근성 QA, 브라우저 미가용으로 미실행.
- 실계정 조회/지갑 API 미준비로 계정 데이터 연결 게이트 계속 보류.

### Hyperliquid 거래 편의 기능 UX 진행

- **UX-HL-04-A1 (Local Completed, disabled only)**: 미인증 포지션/잔량·위험 정책으로 인해 사용할 수 없는 Reduce Only를 주문 폼에 명시적 비활성 옵션과 제한 이유로 표시. 실제 주문/API 및 데모 계산 미연결. 신규 2건 포함 프런트 140/140 PASS. 문서 docs/tasks/UX-HL-04-reduce-only-availability/.
- **UX-HL-04-A2 (Pending browser)**: Reduce Only 비활성 컨트롤의 실제 모바일/키보드/스크린리더 인수. 샌드박스 지원 환경 필요.
- **UX-HL-04-B1 (Local Completed, unavailable only)**: 주문 티켓에서 Available/Reserved/Position Margin을 각각 — 미연결, UNAVAILABLE 출처·MOCK 참고 증거금 차이와 함께 표시. 신규 3건 포함 프런트 143/143 PASS. 문서: docs/tasks/UX-HL-04-margin-availability/.
- **UX-HL-04-B2 (Pending browser)**: Account Margin의 실제 모바일·키보드·스크린리더 상태 인수는 Chromium 샌드박스 지원 환경 의존.
- **UX-HL-04-C1 (Potential independent)**: 미지원 거래 편의 안내를 실제 사용자 필요와 안전 경계에 따라 검토. 승인되지 않은 포지션/위험 데이터 숫자는 만들지 않음.
- **UX-HL-04 execution (Dependent)**: 서명, Reduce Only 위험 정책, 포지션 감소·잔량 검증 및 M5~M8 승인 뒤 별도 구현.

### Hyperliquid 주문 티켓 UX 진행

- **UX-HL-02-A (Local Completed)**: Market/Limit DEMO 입력 전환, Limit Price 범위·형식 검사, 선택 시장 MOCK 가격과 유형별 명목가치·참고 증거금/미리보기. 64/64 프런트 검증 PASS. 문서: docs/tasks/UX-HL-02-order-ticket/.
- **UX-HL-02-B1 (Local Completed)**: 9개 읽기 전용 리뷰 항목/미계산 위험 고지, 닫기/Escape/포커스 복귀·quantity/Limit 오류 ARIA. 프런트 72/72 PASS, 브라우저 인수 미실행.
- **UX-HL-02-B2-A (Local Completed)**: 실제 main.js import 기반 DOM 이벤트 7건 통합, 잘못된 submit의 수량/Limit 필드 포커스 이동. 프런트 79/79 PASS.
- **UX-HL-02-B2-B (Pending browser)**: 브라우저 미가용으로 데스크톱·태블릿·모바일/보조공학 실제 시각 인수 보류.
- **UX-HL-02-C1 (Local Completed)**: validPreviewQuantity의 bool/array/hex 암묵적 숫자형 변환 취약점 정정, 유효한 decimal/scientific form·범위만 허용. Market/Limit·UI 이벤트 회귀 4건, 프런트 116/116 PASS.
- **UX-HL-02-C2 (Pending browser)**: 모바일/키보드 실제 number input 형식과 오류 포커스의 브라우저 인수 미완료.
- **UX-HL-02-D1 (Local Completed)**: Number(leverage) 암묵 형변환으로 bool/array/hex 등을 수락하는 독립 결함 수정. 원본 slider 값 형식 검증 및 ARIA 오류/submit 차단, 신규 5건 포함 프런트 121/121 PASS.
- **UX-HL-02-D2 (Pending browser)**: 실제 range slider의 키보드·모바일/스크린리더 인수 미실행.
- **UX-HL-02-E1 (Local Completed)**: 현재 시장 버튼 재선택 때 직접 입력한 Limit Price·오류·검토 결과가 초기화되는 실제 결함 수정. 실제 시장 변경 때만 기존 갱신 수행, 실행형 2건 신규 포함 프런트 127/127 PASS.
- **UX-HL-02-E2 (Pending browser)**: 모바일/키보드 실제 브라우저에서 같은 마켓 반복 클릭과 초안 보존 인수 미실행.
- **UX-HL-02-F1 (Local Completed)**: 소액 MARKET/LIMIT 양수 명목가치·증거금이 $0.00으로 잘못 표시되는 문제 수정, 1센트 미만은 <$0.01로 정직하게 표시. 신규 3건 포함 전체 프런트 130/130 PASS.
- **UX-HL-02-F2 (Pending browser)**: 실제 모바일·키보드·스크린리더에서 소액 금액 표기 인수 미실행.
- **UX-HL-02-G1 (Local Completed)**: 현재 선택한 주문 방향·유형을 재클릭하면 모의 검토 결과가 사라지던 상태 전환 결함 수정. 실제 BUY/SELL·MARKET/LIMIT 변경만 기존 검토 무효화, 신규 2건 포함 프런트 134/134 PASS.
- **UX-HL-02-G2 (Pending browser)**: 실제 브라우저에서 선택 버튼/키보드·모바일/스크린리더 인수 미실행.
- **UX-HL-02-H1 (Local Completed)**: 같은 빠른 수량 버튼 재클릭에도 기존 검토 결과가 사라지는 실제 상태 전환 오류 수정. 다른 수량 변경 시만 기존 재계산·검토 무효화. 신규 2건 포함 프런트 136/136 PASS.
- **UX-HL-02-H2 (Pending browser)**: 빠른 수량 재클릭의 모바일·키보드·스크린리더 실 브라우저 인수 미실행.
- **UX-HL-02-I1 (Local Completed)**: 빠른 수량 버튼에 CSS active만 있고 ARIA 선택 상태가 없던 결함 수정. 네 프리셋의 aria-pressed 초기 및 동적 동기화, 신규 2건 포함 프런트 138/138 PASS.
- **UX-HL-02-I2 (Pending browser)**: 실제 브라우저·키보드/스크린리더에서 선택 상태 전달 및 모바일 인수 미실행.
- 계정별 실제 read API/wallet 인증이 준비되지 않아 UX-HL-01-B2-B2-B2는 게이트 보류.

## M9 — Sepolia 테스트넷 무기한 선물 거래 MVP (신규 최종 목표)

**사용자 목표:** 메인넷 실자금이 아닌 Ethereum Sepolia에서 무가치 테스트 담보로 MetaMask 연결 → 입금 → EIP-712 signed 주문 → BTC-USD-PERP Long/Short 체결 → 포지션 종료/정산 → 출금까지 검증 가능한 서비스. 상세 인수 조건: docs/releases/SEPOLIA-TESTNET-TRADING-MVP.md.

| 단계 | 내용 | 상태 |
|---|---|---|
| M9-T1 | 지갑 연결·Sepolia chainId 검증, 테스트 토큰·approve UI | Planned |
| M9-T2 | M8 선물 전용 Vault/ClearingHouse의 Sepolia 테스트 담보 입출금 결속 | Planned |
| M9-T3 | 백엔드 공개 HTTPS API·테스트 DB·서명 주문/포지션 화면 연결 | Planned |
| M9-T4 | 선물 포지션/PnL·증거금 잠금의 온체인 검증 정산과 재조정 | Planned |
| M9-T5 | 2개 테스트 계정 전체 입금→체결→종료→정산→출금 E2E | Planned |
| M9-T6 | 전용 테스트넷 배포 및 안전·운영 인수 | Approval required |

**필수 선행 단계:** 현재 M5 이후 M6 funding/M7 liquidation/M8 선물 담보·정산 안전성 및 실제 PG 검증. 기존 M1 direct settle/withdraw는 선물 청산·증거금 잠금을 보장하지 않으며 바로 활성화하지 않는다. 시작 범위는 단일 BTC-USD-PERP, 테스트용 무가치 ERC-20, 검증 전 partial fill 비활성. GitHub Pages는 현재 정적 Simulation Preview이므로 실제 체결처럼 소개하지 않는다. 이 목표 확정은 on-chain 배포/지갑 키/가스 사용 승인이 아니다.

---

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
- **M5-T2 (Local Completed):** `backend/src/perp/pre-trade-risk.ts`의 전체 주문량·가상 부분 체결량 분리, reduce-only flat/증가/과다 금지 및 비-reduce-only 반전 방지, M4 전이 후 IM/MM/Equity/레버리지 위험 등급·증거금 예약 고려 검사 (신규 22개 테스트). **M5-T3-A (Local Completed):** `012_perp_reduce_reservations.sql` 기반 SIMULATION_ONLY reduce-only account guard/예약 합계/가상 소진·취소·원자적 history; M3 잔고/버전과 M4 position version·trusted oracle hash 검증. **M5-T3-B1 (Local Completed):** 양측 FULL reduce-only 예약을 같은 TX에서 M4 paired OI·양쪽 position·공통 receipt 및 M5 두 주문 소진 event와 원자 처리; guarded 계정의 M4 direct paired/standalone 공개 writer 우회 차단. **M5-T3-B2 (Local Completed):** 양측 SIMULATION_ONLY 여러 reduce-only 예약 동시 존재시 지정 주문 부분 체결/연속 소진·다른 OPEN 주문 post-position/version 위험 재평가와 양측 OI 원자 기록. **M5-T3-B3-A (Local Completed):** 신규 013 지연 COMMIT 트리거로 guarded 포지션·양측 M4 체결/Reduce-only 소진·시장 OI 무결성 강제, arbitrary `guarded=true` 호출을 정책/오라클/마진 검증된 예약 주문 ID로 교체. **M5-T3-B3-B (Local Completed):** SQL 014로 guard/주문/event 직접 변조/삭제 및 shadow 원장 불변식 커밋 검증, 013/014 미설치·비활성 시 B1/B2 fail-closed. DB 최소권한·실 PG role QA는 미실행, 운영 권한 승인 필요. **M5-T3-C1 (Local Completed):** 서명된 v2 비-Reduce-only M3 shadow OPEN 주문의 nonce/영속 RESERVE posting·3개 margin 버킷과 M4 position/OI·M5 before/after risk를 1TX read-only 평가. `executionAuthorized:false`, DB 체결·자금 이동 없음. **M5-T3-C2-A (Local Completed):** 양측 signed v2 OPEN 주문의 공통 후보 체결가/수량과 M3 예약/nonce, M4 position/OI, M5 양측 pre/post risk를 1TX 읽기 전용 검증. **M5-T3-C2-B1 (Local Completed):** SQL 015 signed OPEN 우회 writer·무연계 ALLOCATE 차단과 nonce/원장/포지션 commit-time fence, 예약 하한·영속 이력 불변식. **M5-T3-C2-B2-A (Local Completed):** signed 양측 전량 FLAT opening 후보의 EIP-712/예약·위험 트랜잭션 검증과 불변 PREPARED 영수증 영속화 (SQL 016, 체결 권한 없음). **M5-T3-C2-B2-B (Local Completed):** SQL 017 COMMIT 영수증과 서명된 양측 FLAT 전량 opening M4/OI + M3 RESERVED→POSITION·FILLED 소진 한 TX 결속. **M5-T3-C3-A (Local Completed):** signed 계정의 OPEN/CANCELED/FILLED M3 예약·release·allocation 책임, M4 원가/mark PnL 읽기 전용 감사(자금이동 없음). **M5-T3-C3-B (Local Completed):** SQL 018 immutable signed cancel receipt, EIP-712 인증된 취소 서비스, nonce/CANCELED 상태와 M3 RELEASE 두 분개·잔고 COMMIT 검증. **M5-T3-C3-C1 (Local Completed):** SQL 019에서 signed v2 주문별 영속 전량·terminal 완료 수량/잔량·실행 가능 수량 FULL-only COMMIT 감사와 read-only API. **M5-T3-C3-C2-A (Local Completed):** SQL 020 signed 계정별 OPEN/FILLED IM 책임·RESERVED/POSITION 버킷·M3 이중분개·비서명 잔여금 원자 COMMIT 집계 검증. **M5-T3-C3-C2-B1 (Local harness completed; real PG unavailable):** opt-in private Unix socket/new QA schema 전용 독립 PG backend 경합 하네스. **M5-T3-C3-C2-B2-A (Local permission-audit implemented):** 읽기 전용 감사자 role·보호 테이블 12종 DDL/DML·트리거·owner/SECURITY DEFINER 유효권한의 fail-closed 카탈로그 검증기. **M5-T3-C3-C2-B2-B1 (Local trigger catalog audit completed):** SQL 015~020 signed 강제 트리거 31개 활성/이벤트/커밋 지연/함수 연결 pg_catalog 검사기·PGlite 통합 테스트. **M5-T3-C3-C2-B2-B2 (Next, environment dependent):** 실제 전용 PG 제공 후 세션/role/트리거 실 인수. 이후 C3-C3 실제 부분 fill 원자 저널(정책 전제), C3-D PnL/fee/funding. **M5-T3-C3:** M3 부분 버킷 배분·realizedPnL/fee/funding/취소 경쟁 결산. 이후 M5-T4 실제 PG QA. 실 시장 위험 숫자/자산/fee/funding/청산·M8 온체인 인출 정책은 사용자/운영 승인 전 비활성화.
