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
