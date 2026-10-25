# UX-HL-01 QA

## 2026-10-25 A

- 시작 상태 main HEAD 4676116, Git clean, origin/main보다 1개 앞섬. UX TASK 파일은 기존에 없어 생성.
- Node frontend 전체 테스트 15/15 PASS: 신규 hyperliquid-terminal.test.mjs 6/6, 기존 preview-model/site-routes 9/9.
- node --check frontend/main.js PASS.
- npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser 거래 페이지 태그 중첩과 중복 ID 검사 PASS.
- git diff --check PASS.
- 브라우저 실제 렌더링/화면 캡처 **미실행**. CSS 반응형 분기 테스트만 했으므로 픽셀 레벨 시각 인수는 미완료.
- 실제 oracle/mark/funding/open interest/API/지갑/실체인 연결 **미구현**. demo 값은 MOCK SAMPLE로만 표기.

## 2026-10-25 B1 계정 탭·키보드 탐색 QA

- 시작: main HEAD ebe7587, 작업 트리 clean, origin/main보다 2개 커밋 앞섬. PROJECT_STATE·ROADMAP·Hyperliquid 문서와 UX-HL-01 SPEC/TODO/QA/RESULT·프런트 실제 코드 확인.
- 신규 account-tabs.test.mjs 6/6 PASS: 5개 tab/tabpanel ARIA 연결, 표 헤더와 빈 tbody, ArrowLeft/Right wrap·Home·End, 미연결/로딩/성공 빈 응답/오류 분리 및 입력 거부, 실제 DOM 대응 모의 이벤트에서 aria-selected/roving tabindex/hidden/focus 갱신, 모바일 스크롤.
- 기존 3개 파일 15/15 PASS, 프런트엔드 전체 21/21 PASS.
- node --check frontend/account-tabs.js, node --check frontend/main.js, npm --prefix backend run build PASS.
- 소개/거래 HTMLParser 태그 계층 및 중복 ID 없음. 거래 HTML ID 46개.
- CSP connect-src none 및 정적 데모/계정 파일의 주문·네트워크 호출 없음 확인. git diff --check PASS.
- 브라우저 실행파일/Playwright/Puppeteer 부재: 화면 캡처·픽셀 레벨 모바일·실보조공학 테스트 미실행.
- 실제 wallet, 계정 API, PostgreSQL 기록, 테스트넷 거래 및 네트워크 요청 오류 전환은 미연결. 오프라인 상태 모델 검증을 실제 오류 발생 인수로 표시하지 않음.

## 2026-10-25 B2-B1 오프라인 응답 계약 QA

- 시작: main HEAD f3fbf8e, clean, origin/main 대비 앞선 로컬 커밋 3개. PROJECT_STATE, ROADMAP, Hyperliquid reference, UX SPEC/TODO/QA/RESULT 및 frontend 실제 코드 확인.
- account-query-contract.test.mjs 신규 13/13 PASS: 탭 5종 contract, account/chain/source/request/revision 위조, 레코드 필드·중복/주문 잔량·funding 부호 및 uint256 숫자 문자열 오염, 연결 전 begin 거부, loading/empty/ready/error, concurrent stale/계정 변경/disconnect/reconnect/revision 역행 차단.
- 프런트엔드 전체 node --test frontend/*.test.mjs: 34/34 PASS.
- JavaScript 문법(계약/기존 account-tabs/main) PASS; npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser로 index/trade 페이지 중첩·고유 id PASS, git diff --check PASS.
- 실제 네트워크·로그인·백엔드/테스트넷/브라우저 시각 인수는 미실행. 선언된 source 문자열만으로 신뢰된 API임을 인증하지 않는다.
- 공개 페이지·계정 탭/DOM/실제 체결 기능 변경 없음, push/배포/실체인 미실행.

## 2026-10-25 UX-HL-01-B2-B2-A 렌더링 경계 QA

- 시작: main HEAD 79c0890, clean, origin/main보다 로컬 4커밋 앞섬. PROJECT_STATE·ROADMAP·Hyperliquid UX 참조·UX SPEC/TODO/QA/RESULT/ACCOUNT_QUERY_CONTRACT 및 프런트엔드 코드 확인.
- 신규 account-tabs-renderer.test.mjs 9/9 PASS: 기본값에서 검증 안 된 ready 차단, 4개 상태별 빈 표/안내, 5개 탭별 안전한 셀 매핑, HTML 인젝션 textContent 처리, empty ready 거부, 겹친 요청·오류·disconnect 이후 기록 지우기, 중복/타 chain 거부, 정적 demo가 인증 adapter에 연결되지 않았는지 확인, 실제 HTML 헤더 수와 출력 컬럼 수 합치성.
- 기존 frontend 테스트 34/34 PASS → 전체 43/43 PASS.
- JavaScript syntax 및 npm --prefix backend run build (TypeScript tsc --noEmit) PASS.
- 브라우저 직접 실행 및 스크린샷·실보조공학 검증은 **미실행**. fake DOM 이벤트/렌더링 테스트를 실제 브라우저 인수로 주장하지 않음.
- 실제 MetaMask·HTTPS 계정 API·PostgreSQL/chain data source 신뢰성 검증 **미구현**. allowValidatedRecords는 로컬 렌더링 사용 여부를 구분하는 UI 옵션일 뿐 인증/서명·데이터 신뢰 증명이 아니다.
- 공개 데모의 계정 표는 모두 지갑 미연결·빈 tbody를 유지. 안전한 데이터 어댑터가 준비될 때까지 실제 record 출력 기능 비활성.

## 2026-10-25 UX-HL-01-B2-B2-B1 — 계정 read adapter 오프라인 QA

- 시작: main HEAD 9e22fe5, clean, origin/main 대비 ahead 5. PROJECT_STATE/ROADMAP/Hyperliquid UX 및 TASK SPEC/TODO/QA/RESULT/ACCOUNT_QUERY_CONTRACT, frontend/ 소스 확인.
- backend/src/http/create-order-http.ts의 GET /api/orders, GET /api/orders/:orderId 및 backend/src/orders/order-store.ts의 listPublic/findPublicById SQL 확인: account owner 인증 및 강제 WHERE account 제약 없음. signed-sim-account-reconciliation은 내부 API이며 HTTP read endpoint 미구현. 기존 공개 GET을 개인 account history 연동에 사용하지 않음.
- 신규 frontend/account-read-flow.mjs: 주입된 verifySession/query 기반의 지갑 세션 재검증, version monotonicity, per-tab request sequence, AbortController, 계정 전환 및 reconnect stale 차단, coordinator accept/fail 연결. 정적 UI·실 네트워크 미연결.
- 신규 frontend/account-read-flow.test.mjs **12/12 PASS**: 인증 콜백 누락/잘못된 연결/계정·체인/출처, 요청 전후 세션 재검증, 중복 응답, 동시 요청/이전 토큰, disconnect/계정 전환, 탭별 실패, 버전 역행·동일 버전 다른 계정 거부, 세션 취소 등 테스트.
- 검증: frontend Node 전체 **55/55 PASS** (기존 43건+신규 12건), JavaScript 파일 문법 검사 PASS, npm --prefix backend run build PASS, backend/test/order-read-http.test.ts **6/6 PASS**.
- HTMLParser로 index(고유 ID 4개)/trade(고유 ID 46개) 문서 중첩·중복 ID 검사 PASS. Git diff check PASS. 실제 크롬/Playwright 시각 렌더링 검증은 미실행.
- 실제 사용자 지갑 권한, 백엔드 계정 endpoint/CORS/HTTPS, 독립 DB/체인 데이터 신뢰성 및 브라우저 시각 인수는 미실행. 검증 콜백은 테스트에서 주입한 코드로서 실제 인증 증명이 아님.

## 2026-10-25 UX-HL-01-D1 — 모바일 호가 영역 독립 QA

- 시작 main HEAD 9a20e44, origin/main 대비 9 커밋 앞섬, working tree clean. PROJECT_STATE/ROADMAP/Hyperliquid 문서, UX-HL-02 SPEC/TODO/QA/RESULT 및 실제 frontend 코드 검사.
- chromium/chromium-browser/google-chrome/firefox 및 playwright/puppeteer 실행 패키지 없음. 자동 설치/우회 없이 UX-HL-02-B2-B 실제 브라우저 인수 계속 미완료.
- 신규 mobile-market-depth.test.mjs 6/6 PASS: 토글/두 패널 ID·aria-controls 관계, 초기 버튼 감춤+콘텐츠 보존, JS 초기화 시 모바일 접기, 클릭/프로그램 상태·ARIA 갱신, 마크업 일부 없을 때 버튼 비노출, max-width 760px 미디어쿼리 조건, 주문/계정 MOCK/보안 기능 유지.
- node --test frontend/*.test.mjs 전체 85/85 PASS (기존 79 + 신규 6), JS syntax main/account-tabs/mobile module PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser index.html ID 4개/trade.html ID 59개 중복 없음, 중첩 태그 검사 PASS; CSP connect-src none 및 신규 JS의 네트워크·지갑·실체인 호출 부재 확인, git diff --check PASS.
- 브라우저 시각 테스트, 실제 CSS 페인트/모바일 스크린 너비/터치 활성화/스크린리더 결과: 미실행. JS가 없는 실제 브라우저와 CSS 브레이크포인트 인수 역시 미실행.
- 기존 서버/지갑/테스트넷·실제 거래 미연결. 로컬 UI/테스트/문서 이외 수정 없음. push/배포 금지 준수.

## 2026-10-25 UX-HL-01-E1 — MOCK 차트 출처/접근성 QA

- 시작 Git main HEAD 4097d86, working tree clean, origin/main 대비 로컬 12커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX/UX-HL-03 TASK SPEC·TODO·QA·RESULT 및 frontend 실제 코드와 기존 테스트 확인.
- chromium/chromium-browser/google-chrome/google-chrome-stable/firefox 및 playwright/playwright-core/puppeteer/puppeteer-core 미가용. 브라우저/스크린리더 픽셀 인수 미실행; 패키지 설치·권한 우회 없음.
- 분석: 기존 frontend/preview-model.mjs sampleChart는 고정 64개 합성 값만 반환하며 타임스탬프를 갖지 않는데 frontend/trade.html은 08:00~18:00 시간축을 사용하여 오해 위험 발견.
- 신규 frontend/chart-sample-accessibility.test.mjs **5/5 PASS**: BTC/ETH/SOL 샘플 범위 정합성, 개수 변화, 잘못된/비유한 값 거부, unsupported time axis 제거, 차트 svg aria-describedby/텍스트·MOCK 표시·CSP 격리.
- 기존 frontend/order-interactions.test.mjs에 실제 main.js의 BTC→ETH→SOL 이벤트 전환에 따라 가시 최저/최고와 스크린리더용 설명이 변하는 통합 회귀 **1건 추가 PASS**.
- 전체 node --test frontend/*.test.mjs **109/109 PASS** (이전 103 + 신규 6). JS 문법 검사 frontend/main.js/preview-model.mjs/chart-sample-accessibility.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser index.html ID 4개 / trade.html ID 67개, HTML 구조 및 중복 ID PASS. CSP connect-src none, SVG 설명 결속/기존 시간 텍스트 부재, git diff --check PASS.
- 실제 렌더링·스크린리더·모바일 간격/터치 QA는 실행하지 않았다. 실제 시세/오라클/체결 데이터 및 계정 API·지갑·DB·체인은 호출하지 않음.

## 2026-10-25 UX-HL-01-F1 — 모의 체결 출처 QA

- 시작: Git main HEAD 7e50f09, clean, origin/main 대비 13커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX 레퍼런스, UX-HL-01 SPEC/TODO/QA/RESULT 및 프런트 실제 코드 확인.
- chromium/google-chrome/firefox 및 Playwright/Puppeteer 미가용; 브라우저/스크린리더 인수는 미실행. 설치·우회 없음.
- 발견 결함: 타임스탬프 없는 합성 Recent Trades 9건에 고정 시각 18:50~18:18과 Time 헤더가 표시됨.
- main.js에서 제3열을 #01~#09 순번으로 교체하고 trade.html 머리글/실제 체결 기록 아님 고지 변경. 가격·수량·시장 전환 기존 동작 유지.
- order-interactions.test.mjs 실행형·정적 회귀 3개: 초기 순번과 가짜 시간 부재, BTC/ETH/SOL 전환의 데이터/순번 정합성, HTML 출처 안내. 테스트 작성 과정의 정규식 이스케이프 오류 수정 후 재검증.
- 프런트 전체 node --test frontend/*.test.mjs 112/112 PASS (기존 109 + 신규 3). JS node --check main.js/order-interactions.test.mjs/preview-model.mjs PASS, npm --prefix backend run build TypeScript PASS.
- HTMLParser index.html 4개/trade.html 67개 고유 ID, 태그 구조 PASS, CSP connect-src none/계정 5개 빈 tbody/샘플 번호·안내/git diff --check 검사 PASS.
- 실제 브라우저 렌더링·보조공학/지갑·backend·Sepolia·실거래·push·배포 없음.

## 2026-10-25 UX-HL-01-G1 — 합성 Order Book 누적 Total 검증

- 시작 main HEAD 3f34f8a, clean, origin/main 대비 로컬 16커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid 레퍼런스/UX-HL-02 SPEC·TODO·QA·RESULT와 frontend 실제 코드를 확인.
- Chromium/google-chrome/firefox 및 Playwright/Puppeteer 실행 도구가 없어 실 브라우저 UX-HL-02-D2 등 인수 미실행. 외부 설치·권한 우회 안 함.
- 발견된 오류: frontend/main.js renderBook()에서 Size × (i+1)로 Total 표시. 현재 BTC Ask 첫 행은 Size 0.045 / Total 0.045였지만 7개 현재 화면 Ask의 최우선가 기준 실제 누적합은 0.342임을 수정 전 신규 테스트로 재현(FAIL 확인).
- 수정: 기존 합성 7개 Size를 먼저 계산하고 Ask는 행 i부터 최우선(마지막)까지, Bid는 최우선(첫 행)부터 행 i까지 합한 값을 Total로 표시한다. 기존 가격·Size·mock depth 그라디언트 및 마켓별 호가 정렬 불변.
- frontend/order-interactions.test.mjs 실행형 신규 1건: 실제 main.js import/DOM 이벤트 환경에서 BTC/ETH/SOL별 7 Ask/Bid 행, 가격 내림차순, 표시 Size들의 누적합(소수 표기 오차 허용), 최우선 호가 total=size를 검증.
- 변경 직후 해당 테스트 포함 14/14 PASS. 전체 node --test frontend/*.test.mjs 122/122 PASS (기존 121+신규 1).
- node --check frontend/main.js 및 order-interactions.test.mjs PASS; npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser index.html 고유 ID 4개/trade.html 68개, 태그·중복 ID 검사 PASS. 계정 5개 tbody 비어 있음, CSP connect-src none 및 SYNTHETIC LIQUIDITY 유지, git diff --check PASS.
- 실제 브라우저 픽셀/터치/스크린리더·실거래·실 API/지갑·Sepolia/운영 DB 인수 미실행. 원격 push·배포·네트워크 요청 없음.

## 2026-10-25 UX-HL-01-H1 — 지원 시장 ID 검증 QA

- 시작 main HEAD 62af292, Git clean, origin/main보다 17커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 레퍼런스와 UX-HL-01 SPEC/TODO/QA/RESULT, frontend 소스 확인.
- chromium/google-chrome/firefox 및 Playwright/Puppeteer 실행 환경 부재, 설치·권한 우회 미실행, UX-HL-01-G2 실제 브라우저 QA 보류.
- 문제 재현: sampleChart('constructor',4), sampleChart('toString',4), sampleChart('__proto__',4) 호출 시 기존 NaN 4개 반환. describeSampleChart에 toString 메서드가 BTC를 반환하는 객체를 넘기면 허용되는 결함도 확인. 신규 테스트 3건 수정 전 FAIL.
- 변경: preview-model.mjs에 typeof market string 및 Object.hasOwn(MARKETS,market) 조건으로 공통 허용 시장 검증. sampleChart/previewEstimate/describeSampleChart에 적용.
- 신규 preview-model.test.mjs 2건, chart-sample-accessibility.test.mjs 1건. prototype property와 임의 객체/배열/String wrapper/숫자 ID 거부, BTC/ETH/SOL 정상 기능 유지.
- 대상 단위 16/16 PASS, 전체 node --test frontend/*.test.mjs 125/125 PASS (기존 122 + 신규 3).
- node --check preview-model.mjs, preview-model.test.mjs, chart-sample-accessibility.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html 고유 ID 4개/trade.html 68개, 태그 중첩/ID 중복 PASS. 계정 tbody 5개 빈 상태, CSP connect-src none, 모델 외부 통신·서명 API 부재, git diff --check PASS.
- 실제 브라우저/모바일·스크린리더, 지갑/backend API, 실계정/실주문, Sepolia/운영 DB/푸시/배포 미실행.

## 2026-10-25 UX-HL-01-I1 — 샘플 변화율 표시 정합성 QA

- 시작 main HEAD 4038929, Git clean, origin/main 대비 로컬 20커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX reference, UX-HL-02 SPEC/TODO/QA/RESULT, main.js/preview-model.mjs/테스트 확인.
- Chromium/chromium-browser/google-chrome/firefox 및 Node Playwright/Puppeteer 미가용으로 UX-HL-02-F2/E2·UX-HL-01-H2 실브라우저 인수 미실행. 설치·권한 우회 없음.
- 구체적 재현: sampleChart 64개 첫/마지막 샘플로 계산한 변화율 BTC +1.32715667%, ETH +1.34341744%, SOL -1.27747196%인데 기존 마켓 스트립/market-stats-change/차트 change는 고정 metadata인 +2.41%, +1.18%, -0.82% 표시. 신규 테스트 2건이 수정 전에 실패함.
- 수정: describeSampleChart에 first/changePercent를 계산하고 screen-reader 설명에 샘플 첫 값 대비 마지막 변화 명시. updateMarket에서 모든 마켓 버튼과 선택 차트·지표를 같은 sampleChart(64)에서 계산한 변화율로 정합; 초기 HTML 숫자도 동기화. MARKETS.change는 MOCK 시계열 방향 생성용 설정으로 유지.
- 신규 chart-sample-accessibility.test.mjs 1건(실제 샘플 delta와 접근성 설명), order-interactions.test.mjs 1건(BTC/ETH/SOL 클릭, 선택 카드/차트/지표 일치), 기존 hyperliquid-terminal.test.mjs 구조 테스트 1건을 새로운 계약으로 수정.
- 수정 후 타깃 25/25 PASS, 전체 node --test frontend/*.test.mjs 132/132 PASS (기존 130 + 신규 2). JS node --check main.js/preview-model.mjs/관련 3개 테스트 PASS. npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html 고유 ID 4개 / frontend/trade.html 고유 ID 71개, 태그/중복 ID PASS. 계정 tbody 5개 빈 상태 및 CSP connect-src none, git diff --check PASS.
- 실제 브라우저 뷰포트/스크린리더·실계정/지갑/실시세 API/체인/DB 및 원격 push·배포는 실행하지 않았다.

## 2026-10-25 UX-HL-01-J1 — 모의 누적 호가 시각 깊이 정합성 QA

- 시작 HEAD a0ec5f3, main Git clean, origin/main 대비 로컬 26개 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX reference 및 UX-HL-01와 UX-HL-04-A1/B1 SPEC·TODO·QA·RESULT, 실제 frontend/main.js, 기존 누적 Total 회귀 및 CSS 확인.
- 브라우저: 프로젝트 내부 Playwright/Chromium 파일 존재(약 643MB). 비권한 유저 user namespace 생성이 Operation not permitted이며 Chromium 샌드박스 실행 불가. 보안 옵션 우회/추가 권한 사용 없이 실제 UI 인수 보류.
- 문제 재현: 기존 renderBook은 누적 Total 계산과 무관한 --depth=12+(i*19)%76을 사용. BTC Ask 가장 먼 호가 첫 행은 전체 누적 Total에 해당하여 깊이 100%가 맞지만 12%로 표시. 신규 실제 main.js DOM 회귀 1건 수정 전 FAIL.
- 변경: sizes의 전체 합 maxDepth를 산출한 후 각 행이 이미 계산한 total을 maxDepth로 나눠 백분율 toFixed(2) CSS --depth에 적용. 가격/size/total 합성 생성 및 순서/실행 동작 불변.
- 신규 order-interactions.test.mjs 1건은 BTC/ETH/SOL 시장 변경 후 Ask/Bid 7행 Total과 depth의 비례 관계(가시 숫자 반올림 허용 0.20%p), 0~100%·유효값, Ask 단조 감소/Bid 단조 증가와 최대 100% 검증.
- 수정 후 대상 이벤트 24/24 PASS, node --test frontend/*.test.mjs 전체 144/144 PASS (기존 143+신규 1). node --check frontend/main.js 및 order-interactions.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 고유 ID·태그 검사, CSP connect-src none 및 빈 계정 tbody 5개, git diff --check PASS.
- 실제 브라우저·터치/스크린리더 픽셀 인수, 실자금/계정 API/지갑/체인, 운영 DB·원격 push/배포 미실행.

## 2026-10-25 UX-HL-01-K1 — 합성 호가 ARIA 목록·행 검증

- 시작 로컬 main HEAD 205d7b0, Git clean, origin/main 대비 27개 로컬 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 레퍼런스 및 UX-HL-01/04 관련 SPEC/TODO/QA/RESULT, main.js/trade.html/통합 테스트 확인.
- 프로젝트 내부 Playwright/Chromium은 설치됐으나 비특권 사용자 unshare -Ur가 Operation not permitted로 Linux 샌드박스를 시작할 수 없어 실 브라우저 UX-HL-01-J2 및 K2 인수 미실행. --no-sandbox·권한 우회는 시도하지 않음.
- 재현: 기존 asks/bids 영역과 각 div.book-row는 ARIA list/listitem/방향·열 의미가 없었다. 정적 마크업과 실제 main.js 렌더용 테스트 신규 2건이 수정 전 FAIL.
- 수정: trade.html의 두 목록 role=list 및 합성 매수/매도 구분·실주문 아님 레이블. main.js의 renderBook이 시장 전환마다 목록 이름을 갱신하고 각 행에 role=listitem 및 현재 표시된 Price/Size/Total과 방향/출처를 포함한 aria-label을 부여. 시각용 span에 aria-hidden=true를 추가, 데이터 산출/화면 배열은 불변.
- 테스트: order-interactions.test.mjs 신규 2건. BTC/ETH/SOL 전환 × asks/bids × 7행에서 가시적인 가격·수량·누적값과 행 설명, 원본 시장 및 정적 마크업을 확인. 테스트 레이블 정규식 단어 순서 수정 뒤 target 26/26 PASS, 전체 node --test frontend/*.test.mjs 146/146 PASS (기존 144+신규 2). 모든 frontend JS 문법, npm --prefix backend run build (tsc --noEmit), HTMLParser 중첩·고유 ID, CSP connect-src none/5개 계정 tbody 빈 상태, git diff --check PASS.
- 실제 스크린리더/브라우저 접근성 트리, 모바일 터치·시각 검증은 미실행. 실거래·백엔드 연결·지갑/서명·Sepolia 트랜잭션·운영 DB·원격 push/배포 없음.

## 2026-10-25 UX-HL-01-L1 — Recent Trades 모의 예시 접근성 검증

- 시작 로컬 main HEAD d43a1d6, Git clean, origin/main 대비 28커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX reference, UX-HL-01 SPEC/TODO/QA/RESULT, 프런트 실제 main.js/trade.html/테스트 확인.
- 기존 프로젝트 내부 .local-browser-qa 약 643MB. unprivileged userns 생성 명령 runuser -u node -- unshare -Ur true가 Operation not permitted. 브라우저 샌드박스 사용 불가·우회 금지로 UX-HL-01-K2·L2 실제 시각 인수 미완료 유지.
- 발견: 기존 recent-trades/각 trade-row에 list/listitem·모의 방향/열별 가격·수량·샘플 순번 설명이 없었다. 신규 main.js 이벤트 통합 테스트 1건과 정적 마크업 테스트 1건 수정 전 FAIL.
- 수정: trade.html recent-trades 컨테이너에 role=list와 BTC 합성 최근 체결 예시 목록 기본 이름. main.js renderTrades에서 시장별 목록 이름과 각 9행에 role=listitem, aria-label(모의 매수/매도 방향, Sample #, 화면 표시된 가격과 수량, 실제 체결 기록 아님)을 생성. 가시적인 3개 span은 aria-hidden=true.
- 수정 후 대상 node --test frontend/order-interactions.test.mjs 28/28 PASS, 전체 node --test frontend/*.test.mjs 148/148 PASS (기존 146+신규 2). 모든 frontend/*.js/*.mjs node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser index.html/trade.html 유효 태그 중첩·고유 ID, CSP connect-src none/계정 tbody 5개 미연결, git diff --check PASS.
- 실제 스크린리더·모바일 픽셀/터치·접근성 트리 인수 미실행. 체결·서명·지갑·API·Sepolia/운영 DB·푸시/배포 변경 없음.

## 2026-10-25 UX-HL-01-M1 — 최근 체결 방향의 텍스트 표시

- 시작 main HEAD 5121995, Git clean, origin/main보다 29개 로컬 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 가이드 및 UX-HL-01 최근 SPEC/TODO/QA/RESULT, 프런트 실제 HTML/JS/CSS·통합 회귀를 확인.
- 브라우저: 프로젝트 내부 Playwright/Chromium 643MB 설치돼 있으나 runuser -u node -- unshare -Ur true → Operation not permitted. 정책 우회·no-sandbox 실행 없이 실제 렌더링/스크린리더 인수 미완료 유지.
- 재현: Price 색상만 매수·매도를 나타내고 Recent Trades의 가시 열은 Price/Size/Sample # 셋뿐. 실제 main.js BTC/ETH/SOL 실행 기반 표시 방향·ARIA 정합성 테스트 및 정적 HTML/CSS 4열 검사 신규 2건 수정 전 FAIL.
- 변경: trade.html 최근 체결 헤더에 Side 추가. main.js renderTrades의 기존 buy 불리언을 재사용해 가시 Buy/Sell을 네 번째 열에 추가. 기존 aria-label 모의 방향/색상 및 9개 샘플 순번 불변. trade.css Recent Trades에만 4열 그리드·좁은 폭 텍스트 스타일 적용. 과거 F1 테스트의 샘플 추출을 마지막 행 칸이 아니라 세 번째 칸 인덱스로 변경.
- 수정 후 대상 order-interactions.test.mjs 30/30 PASS, 전체 node --test frontend/*.test.mjs 150/150 PASS (기존 148+신규 2). 모든 프런트 JS node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- 첫 git diff --check에서 새 CSS 끝 불필요한 빈 줄 1건 발견, 수정 후 검사 PASS. HTMLParser index.html/trade.html 태그/고유 ID, CSP connect-src none 및 5개 계정 tbody 빈 상태 확인.
- 실제 브라우저 픽셀·터치/스크린리더 가독성, 서버/지갑/실자금·실거래·Sepolia 트랜잭션, 운영 DB·원격 push/배포 미실행.

## 2026-10-25 UX-HL-01-N1 — 시장별 가시 수량 단위 검증

- 시작 HEAD 7c72243, main Git clean, origin/main 대비 30개 로컬 커밋 앞섬. PROJECT_STATE.md, ROADMAP.md, Hyperliquid UX reference, UX-HL-01 SPEC/TODO/QA/RESULT, HTML/JS/모델 및 기존 프런트 테스트 확인.
- 브라우저: 프로젝트 내부 Playwright/Chromium 643MB 설치됨. 비특권 사용자 unshare -Ur 실행이 Operation not permitted로 실패하며 샌드박스 Chromium을 사용할 수 없어 UX-HL-01-M2/N2 실제 브라우저 인수는 미완료. 안전 제한 우회 없음.
- 선행 검토: chart-value-label 가격은 chartSample 마지막 값과 같은 MOCK 기준가라는 사실을 모델·기존 테스트에서 확인해 결함으로 판단하지 않음.
- 실제 결함: 호가 Size/Total과 최근 체결 Size 수치의 단위가 해당 섹션의 가시 헤더에 없음. BTC/ETH/SOL 전환 시 가시 단위 확인 불가. 신규 정적 HTML/실제 main.js 통합 테스트 2건 수정 전 FAIL.
- 수정: frontend/trade.html에 각각 book-size-label, book-total-label, trade-size-label와 BTC 초기 단위를 추가. main.js updateMarket에서 선택된 m.symbol 단위를 헤더에 반영. 실제 수치 계산·MOCK 출처 및 ARIA 행 설명은 그대로 유지.
- 수정 후 실제 main.js 이벤트 테스트 포함 order-interactions.test.mjs 32/32 PASS, 전체 node --test frontend/*.test.mjs 152/152 PASS (기존 150+신규 2). frontend 모든 JS node --check PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 구조 및 고유 ID, CSP connect-src none/계정 tbody 5개 비어 있음, git diff --check PASS.
- 실제 Chromium 렌더링/스크린리더·모바일 뷰포트 인수, API·지갑/서명·실거래/실체인·운영 DB·원격 push/배포 미실행.

## 2026-10-25 UX-HL-01-O1 — 합성 호가 스프레드 검증

- 시작 로컬 main HEAD 072d5df, Git clean, origin/main 대비 32개 로컬 커밋 앞섬. PROJECT_STATE.md, ROADMAP.md, Hyperliquid UX reference, UX-HL-01 및 UX-HL-02 SPEC·TODO·QA·RESULT와 trade.html/main.js/모델·회귀 테스트 확인.
- 브라우저 실행 전 점검: .local-browser-qa 안에 Playwright/Chromium 643MB가 설치돼 있으나 비특권 유저 runuser -u node -- unshare -Ur true는 Operation not permitted. no-sandbox·권한 우회 없이 UX-HL-02-J2/UX-HL-01-N2 및 O2 인수 보류.
- 확인된 UX 누락: Order Book은 중앙 기준가와 SPREAD DEMO 문구만 노출. 최우선가 실제 차이 금액을 읽을 수 없는 상태. 신규 order-interactions.test.mjs 2건이 수정 전 FAIL(동적 book-spread ID 부재 및 정적 MOCK 상태 누락).
- 변경: trade.html의 SPREAD 문구에 초기 —인 output#book-spread와 MOCK 고지 추가, trade.css에 출력값/고지 서식. main.js에서 화면에 이미 보이는 합성 최우선 매도가·매수가 사이의 2*depthStep을 FORMAT_USD 통화로 표시하고 시장별 합성 설명을 aria-label로 갱신.
- 첫 수정의 실행형 테스트에서 Fake DOM이 HTML 초기 aria-label을 자동 수집하지 않아 1건 FAIL. 시장 변경 시 aria-label을 명시적으로 설정하도록 구현을 보완한 뒤 재검증.
- BTC/ETH/SOL 각각 표시된 최우선 Ask(매도 목록 마지막 행)와 Bid(매수 목록 첫 행) 숫자의 차액을 검사하는 실제 main.js 테스트, 정적 비실거래 출처·초기 — 검사 2건 PASS. 대상 order-interactions 36/36, node --test frontend/*.test.mjs 전체 156/156 PASS (기존 154+신규 2).
- 전체 frontend JS node --check, npm --prefix backend run build (tsc --noEmit), Python HTMLParser index.html/trade.html 구조·고유 ID 및 CSP connect-src none·계정 tbody 5개 빈 상태, git diff --check PASS.
- 실제 브라우저/스크린리더 인수는 미수행. 실거래·지갑/서명·Sepolia 트랜잭션·운영 DB·원격 Push·배포/권한 변경 없음.

## 2026-10-25 UX-HL-01-P1 — 합성 차트 추세별 색상 검증

- 시작 main HEAD 5cee607, Git clean, origin/main 대비 33커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-01 SPEC/TODO/QA/RESULT 및 실제 frontend/main.js/trade.html/테스트를 확인.
- 기존 프로젝트 내부 Playwright/Chromium 설치 약 643MB. 비특권 사용자 unshare -Ur 명령은 Operation not permitted로 차단. 실제 브라우저 O2/P2 인수는 미완료 유지, no-sandbox·보안 권한 우회 없음.
- SOL은 고정 MOCK 시계열 기준 하락으로 표시되는데 차트 SVG line/point/gradient는 상승 녹색 고정. 신규 order-interactions.test.mjs의 실제 main.js 이벤트/정적 HTML 회귀 2건 수정 전 FAIL.
- 수정: trade.html gradient 두 stop ID 추가. main.js renderChart의 이미 계산한 summary.changePercent 부호로 기존 디자인 녹색(#43e1b4) 또는 빨강(#ff6c7b)을 선/끝점/면적 양끝에 할당. 샘플 값·축·가격·주문/계정 기능 불변.
- 수정 후 대상 order-interactions.test.mjs 38/38 PASS, 전체 node --test frontend/*.test.mjs 158/158 PASS (기존 156+2). 모든 frontend JavaScript node --check 및 npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html의 태그/중복 ID, CSP connect-src none·빈 계정 테이블 tbody 5개, git diff --check PASS.
- 실제 브라우저/스크린리더/모바일 인수 미수행. 원격 Push·배포·운영 DB·지갑·실거래·Sepolia 트랜잭션 미실행.

## 2026-10-25 UX-HL-01-Q1 — 선택 시장과 탭 제목 동기화

- 시작 main HEAD a0a5c93, Git clean, origin/main 대비 37개 로컬 커밋 ahead. PROJECT_STATE.md, ROADMAP.md, Hyperliquid UX reference, UX-HL-02 기존 TASK SPEC/TODO/QA/RESULT, 실제 frontend/trade.html/main.js 및 프런트 통합 테스트 확인.
- 브라우저: 프로젝트 .local-browser-qa에 Chromium/Playwright 약 643MB 존재. 비특권 사용자 runuser -u node -- unshare -Ur true 실행이 Operation not permitted로 실패. 안전 제한 우회 없이 실제 Chromium 브라우저 인수 미실행.
- 실제 결함: 거래 페이지 title은 거래 데모 · PerpDEX로 고정되어 시장 BTC/ETH/SOL를 클릭해도 브라우저 탭에 선택 시장이 드러나지 않음. 신규 테스트 2건(실제 HTML 초기 값 및 실제 main.js 이벤트) 수정 전 2건 FAIL.
- 변경: trade.html 초기 BTC-USD-PERP · 거래 데모 · PerpDEX. main.js updateMarket에서 이미 검증된 m.symbol을 재사용하여 document.title을 갱신. 가격·모의 차트/체결/호가·주문 모의·계정 API/권한 경계 변경 없음.
- 신규 테스트를 포함한 대상 order-interactions.test.mjs 46/46 PASS, frontend 전체 node --test frontend/*.test.mjs 166/166 PASS (기존 164+2). 모든 frontend JS node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser 정적 index.html/trade.html 태그/고유 ID 확인, CSP connect-src none·가짜 계정 테이블 빈 tbody 5개·NO EXECUTION 고지·git diff --check PASS.
- 실제 Chrome 픽셀·탭/스크린리더 수동 인수는 미실행. 원격 push·배포, 운영 DB, 지갑/비밀키, 실체인 거래/승인 우회 없음.

## 2026-10-25 UX-HL-01-R1 — 호가 스프레드 수치 접근성

- 시작 main HEAD b9bb533, Git clean, origin/main 대비 로컬 49커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-02-O1 및 UX-HL-01-Q1 TASK SPEC·TODO·QA·RESULT, trade.html/main.js/preview-model/order-interactions 관련 실제 코드 점검.
- Chromium .local-browser-qa 약 643MB 존재, 비특권 runuser -u node -- unshare -Ur true → Operation not permitted. 권한·샌드박스 우회 없이 UX-HL-02-O2 및 UX-HL-01-R2 실제 브라우저 인수 미완료 유지.
- 수정 전 신규 frontend/order-interactions.test.mjs 2건 FAIL. 가시 BTC 스프레드 $31.00와 달리 aria-label은 'BTC 합성 호가 스프레드 · 실제 호가 아님'으로 수치/단위 누락. 초기 no-script output(—)에도 '미계산' 정보 없음.
- 수정: frontend/main.js renderBook의 USD 형식 금액을 displayedSpread로 고정해 output textContent와 시장명/금액/USD·비실제 호가 안내를 포함한 aria-label 동기화. 정적 frontend/trade.html은 계산 전 output —/미계산 상태 명확화.
- 수정 후 대상 node --test frontend/order-interactions.test.mjs 50/50 PASS, 전체 node --test frontend/*.test.mjs 190/190 PASS (기존 188+2). 모든 frontend JS node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html·frontend/trade.html 구조/고유 ID, CSP connect-src none, 계정 미연결 tbody 5개·DEMO-only 고지 및 git diff --check PASS.
- 실제 Chrome·스크린리더·모바일 시각/스크린리더 인수는 미실행. 지갑/API 연결·실거래·Sepolia 트랜잭션·운영 DB·자격증명·원격 push/배포/권한 우회 없음.

## 2026-10-25 UX-HL-01-S1 — 모바일 계정 현황 진입점

- 시작 로컬 main HEAD 91a0ef6, Git clean, origin/main 대비 51커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-01-R1/UX-HL-02-P1 관련 SPEC/TODO/QA/RESULT 및 실제 trade.html, trade.css, styles.css, 모바일/계정/거래 코드와 테스트 확인.
- .local-browser-qa 내 Playwright/Chromium 약 643MB 확인. 비특권 runuser -u node -- unshare -Ur true 는 Operation not permitted. 샌드박스·권한 우회하지 않고 R2/P2/S2 실제 브라우저 인수 미실행.
- 실제 원인: 데스크톱 nav의 href=#portfolio가 650px 이하에서 CSS display:none으로 숨겨지며 모바일 거래 workspace에 동등한 링크가 없음. 신규 frontend/mobile-portfolio-link.test.mjs 2건 수정 전 FAIL(앵커 누락/CSS 노출 없음).
- 수정: frontend/trade.html 거래 제목 묶음에 #portfolio 링크 추가. frontend/trade.css에서 데스크톱 display:none, 650px 이하 inline-flex/min-height:44px/키보드 focus-visible CSS 적용. JavaScript, 계정 탭/주문 계산/API 경로 변경 없음.
- 수정 후 node --test frontend/mobile-portfolio-link.test.mjs 2/2 PASS, node --test frontend/*.test.mjs 194/194 PASS(기존 192+신규 2). 전체 프런트 JS node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 태그 구조·고유 ID, CSP connect-src none, 5개 계정 빈 tbody·NO EXECUTION/MOCK 고지 및 git diff --check PASS.
- 실제 Chrome 화면 크기별 픽셀 배치, 터치, 앵커 스크롤 및 스크린리더 인수는 제한으로 미수행. 자격증명·지갑/API 연결·실거래·Sepolia 트랜잭션·운영 DB·원격 Push/배포/보안 제한 우회 없음.
