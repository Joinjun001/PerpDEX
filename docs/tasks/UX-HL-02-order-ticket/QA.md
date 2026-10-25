# UX-HL-02 QA

## 2026-10-25 UX-HL-02-A 로컬 테스트

- 시작 main HEAD 38f92a4, clean, origin/main 대비 ahead 6. PROJECT_STATE/ROADMAP/Hyperliquid UX와 UX-HL-01 전체 문서 및 프런트 코드 확인.
- backend/src/http/create-order-http.ts와 기존 백엔드 계정 read gap 문서를 다시 점검: 계정 소유권을 인증하고 포지션/주문/체결을 반환하는 전용 HTTP API는 없음. 실제 계정/지갑 연결은 보류.
- frontend/order-ticket.test.mjs 신규 9/9 PASS: 모의 MARKET 계산 회귀, LIMIT 가격 적용, Long/Short 가격 정합성, 허용/거부 입력, 수량/레버리지/마켓 거부, HTML ARIA/숨김 필드, UI 이벤트·CSP·서버 미전송 제약, 소개/계정 영역 보존.
- node --test frontend/*.test.mjs: 총 64/64 PASS (이전 55건 + 신규 9건). 부동소수점 UI 참고 계산 허용오차 정정 후 재검증.
- node --check frontend/main.js 및 frontend/preview-model.mjs PASS. npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser 검사: index.html 고유 ID 4개, trade.html 고유 ID 53개, 중첩 태그·ID 중복 없음. 코드 검사에서 frontend/main.js 및 preview-model.mjs 외부 네트워크·실거래 API 호출 없음, Git diff --check PASS.
- 브라우저 실렌더링/포커스 수동 검사, 백엔드 거래·지갑·DB·Sepolia/가격 오라클/정산/실제 체결 검증은 **미실행**. 주문 가격·수량은 JavaScript UI 모의 계산이며 안전한 실거래 경제/수량 정책을 대체하지 않는다.

## 2026-10-25 UX-HL-02-B1 — 모의 주문 검토/오류 UX

- 시작 main HEAD c6fe6ac, clean, origin/main보다 7개 커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid 레퍼런스/UX-HL-02 SPEC·TODO·QA·RESULT와 프런트 코드를 확인.
- 신규 frontend/order-review.mjs 및 frontend/order-review.test.mjs: 8/8 PASS. 9개 항목, Market/Limit 가격 출처, Long/Short, 입력 거부, 구조화된 DOM textContent, HTML 인젝션 문자열 처리, 닫기 콜백 및 정적 Escape/ARIA 연결 시험.
- 기존 account-tabs.test.mjs와 order-ticket.test.mjs의 정적 검사는 새 결과 패널 tabindex=-1을 계정 탭으로 잘못 합산하지 않고, 서버 전송 0건 문구가 있는 새 리뷰 모듈에서 확인하도록 조정.
- node --test frontend/*.test.mjs: 프런트 전체 72/72 PASS (기존 64 + 신규 8). JavaScript 문법 main/order-review/preview-model PASS. npm --prefix backend run build(tsc --noEmit) PASS.
- index.html 고유 ID 4개, trade.html 고유 ID 54개, HTMLParser 태그 구조 및 중복 ID 검사 PASS. connect-src none 및 프런트 JS 외부 요청/지갑/실체인 API 없음; git diff --check PASS.
- 실제 chromium/Playwright/Puppeteer 미가용으로 픽셀 렌더링·브라우저 키보드·스크린리더 QA는 미실행. 가짜 DOM 단위 테스트가 실제 브라우저 인수를 뜻하지 않음.
- 실계정/메인넷/Sepolia/백엔드 거래/실제 주문·자산 처리/오라클/경제 리스크 검증은 미수행, MOCK 가격 참고 금액만 산출.

## 2026-10-25 UX-HL-02-B2-A 이벤트 통합 QA

- 시작 main HEAD 0c0f391, clean, origin/main 대비 ahead 8. PROJECT_STATE, ROADMAP, Hyperliquid reference, UX-HL-02 SPEC/TODO/QA/RESULT 및 실제 frontend 코드 확인.
- 원격 명령 검색으로 chromium, chromium-browser, google-chrome, firefox, Node playwright/playwright-core/puppeteer/puppeteer-core/jsdom/happy-dom/linkedom 부재 확인. 설치·권한 우회 시도 없음.
- 신규 frontend/order-interactions.test.mjs 7/7 PASS: 실제 main.js를 테스트용 DOM 객체에 import하여 이벤트 dispatch. MOCK 차트/호가 초기화, Market/Limit·Long/Short 전환, Limit·quantity 오류/disabled 상태, submit preventDefault·리뷰 포커스·Escape/닫기, 시장/가격/레버리지/quick quantity 변경에 따른 이전 결과 숨김, 네트워크 호출 미실행 검사.
- frontend/main.js: 비정상 입력의 프로그램적/키보드 form submit에도 리뷰 열지 않으며 수량 또는 Limit Price 입력으로 포커스 이동. 기존 role alert/aria-invalid를 활용.
- Node 프런트엔드 전체 79/79 PASS (기존 72 + 신규 7), JavaScript 문법 검사 및 npm --prefix backend run build (tsc --noEmit) PASS.
- 테스트용 DOM은 브라우저 레이아웃·기본 키 이벤트·스크린리더·실제 포커스 정책을 구현하지 않음. **실제 데스크톱·태블릿·모바일 시각/터치/보조공학 검증은 미실행**.
- 실계정·API·지갑·체인/실주문 연결 없음. 변경은 프런트 로컬 테스트/오류 포커스 및 한국어 문서 한정, push/배포 없음.

## 2026-10-25 UX-HL-02-C1 — 비숫자 입력의 암묵적 형변환 거부

- 시작 main HEAD e43af4d, clean, origin/main보다 14커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid reference, UX-HL-01 SPEC/TODO/QA/RESULT 및 frontend 코드 검토.
- chromium/google-chrome/firefox 실행파일과 Playwright/Puppeteer 패키지 미가용, 설치·우회 없음. 실 브라우저 UX-HL-01-F2/E2, UX-HL-02-B2-B 미완료 유지.
- 구체적 결함: validPreviewQuantity()의 삼항 분기가 모두 Number(value)로 이어져 문자열 0x1과 bool true 및 array [1] 등이 범위 0.0001~100 검사를 우연히 통과. 수정 전 새 회귀 3건 가운데 2건 실제 FAIL 확인.
- 수정: preview-model.mjs 수량은 string 또는 number primitive 타입만 받고, string은 십진수/선택적 e/E 지수 입력 문법 검사 후 Number로 범위 판정. Number(input)는 validation을 통과한 값에만 적용.
- 신규 4건: preview-model.test.mjs 2, order-ticket.test.mjs 1, order-interactions.test.mjs 1. 비숫자/hex/진법 prefix, 객체의 valueOf 위조, 공백 거부 및 0.0001/100/.05/1e-4 등의 정상 범위/지수 허용, Market/Limit 양쪽 및 실제 UI aria-invalid/disabled/focus 흐름 확인.
- 수정 후 node --test frontend/*.test.mjs 116/116 PASS (기존 112 + 신규 4). node --check frontend/preview-model.mjs, frontend/main.js 및 3개 관련 테스트 PASS. npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html 고유 ID 4개, trade.html 67개, 구조/중복 ID PASS. 정적 계정 tbody 5개 빈 상태 및 trade.html CSP connect-src none 유지. git diff --check PASS.
- 브라우저 실제 입력·화면/접근성 트리, 실계정·wallet/backend API·Sepolia 거래/DB·실리스크 인수는 미실행. Push/배포 금지.

## 2026-10-25 UX-HL-02-D1 — 레버리지 형식 변환 차단 QA

- 시작 main HEAD fa764ff, clean, origin/main보다 로컬 15커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX 레퍼런스, UX-HL-02 SPEC/TODO/QA/RESULT 및 frontend 모델/UI 실제 코드 확인.
- chromium/google-chrome/firefox/Playwright/Puppeteer 실행 환경 미가용으로 UX-HL-02-C2/B2-B 및 D2 브라우저 인수 보류, 설치·권한 우회 미수행.
- 재현: frontend/preview-model.mjs previewEstimate은 Number(leverage)에 의해 true, [3], 0x3 등의 부정형을 범위 1~10의 정수로 받아들임. frontend/main.js renderTicket도 미리 Number(raw)를 호출하므로 모델 경계를 통과시키는 결함. 신규 회귀 테스트 실행 시 수정 전 2건 FAIL 확인.
- 구현: validPreviewLeverage는 primitive 정수 1~10 또는 정규 decimal integer string "1"..."10"만 수락, 그 밖의 JSON/객체/배열/부울/진법 표기/선행 공백/지수 거부. 모델 검증 전에 Number 사용 금지.
- 화면: renderTicket에서 원본 slider.value를 미리보기 모델로 전달. 이상 입력 시 leverage aria-invalid, aria-describedby/role alert, 입력값 출력 '—', 미리보기 비활성화. 강제 폼 submit도 결과 대신 leverage field focus.
- 신규 5건: preview-model.test.mjs 2, order-ticket.test.mjs 2, order-interactions.test.mjs 1. 정상 slider 1..10 테스트, Market/Limit의 타입 일관성, 실제 main.js 이벤트 invalid·valid 복귀/화면 ARIA/submit blocked.
- node --test frontend/*.test.mjs **121/121 PASS** (기존 116 + 신규 5), 주요 JS 파일/테스트 node --check PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser: index.html ID 4개, trade.html ID 68개, 태그 중첩·중복 ID 없음. Static account tbody 5개 비어 있음, CSP connect-src none, leverage 오류 안내 ARIA 존재, git diff --check PASS.
- 실 브라우저/터치/스크린리더·실거래·실계정·지갑/백엔드 API·Sepolia/운영 DB 미실행, push/배포 미수행.

## 2026-10-25 UX-HL-02-E1 — 동일 시장 반복 선택 시 주문 초안 보존

- 시작 main HEAD 91668ba, clean, origin/main보다 18개 커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-02 SPEC·TODO·QA·RESULT 및 frontend/main.js, order-interactions.test.mjs 확인.
- chromium/chromium-browser/google-chrome/google-chrome-stable/firefox 실행 파일과 Node Playwright/Puppeteer 미가용. 패키지 설치·권한 우회 없음. 기존 H2 및 UX-HL-02-D2 실제 브라우저 인수 미완료.
- 수정 전 실제 DOM 이벤트 통합 테스트 2건 FAIL: 현재 BTC 버튼 재선택 시 사용자 Limit Price 60000.25가 기본 65240.50으로 덮임. 비정상 Limit 초안 invalid 역시 기본가로 바뀌는 문제 확인.
- 수정: frontend/main.js 시장 버튼 click listener에서 b.dataset.market===view.market 경우 return. BTC→ETH 등 실제 변경은 updateMarket 호출 및 이전 미리보기 무효화 그대로 수행.
- 신규 frontend/order-interactions.test.mjs 2건: 정상 Limit 초안/가격·수량·레버리지·차트·검토 패널의 상태/노드 유지, 잘못된 Limit 가격 오류 보존, 실제 다른 시장 변경 시 기본가·모의 시장 UI 갱신 및 과거 결과 숨김 검증.
- Node 지정 실행형 테스트 16/16 PASS, 전체 node --test frontend/*.test.mjs 127/127 PASS (기존 125 + 신규 2).
- node --check frontend/main.js 및 frontend/order-interactions.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser와 고유 ID 검사/CSP connect-src none·계정 empty state 및 git diff --check PASS (커밋 전 재검증).
- 실제 Chromium 키보드·터치/보조공학·픽셀 배치, 지갑/인증 API·실거래/온체인·운영 DB/배포·원격 push 미실행.

## 2026-10-25 UX-HL-02-F1 — 1센트 미만 양수 표시 QA

- 시작 Git main HEAD f6ab7b7, clean, origin/main보다 19커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 참고, UX-HL-02 SPEC/TODO/QA/RESULT, frontend 모델/화면/검토 코드 확인.
- Chromium/chromium-browser/google-chrome/firefox 및 Node Playwright/Puppeteer 실행 도구 미가용. 설치/안전 검사 우회 없음. UX-HL-02-E2, UX-HL-01-H2 브라우저 인수 계속 미완료.
- 결함 재현: BTC LIMIT Qty=0.0001, Price=0.01, Leverage=10인 유효한 주문의 명목가치 약 0.000001 USD 및 참고 증거금 약 0.0000001 USD는 양수지만 FORMAT_USD.format로 두 값 모두 $0.00으로 표시. 수정 전 리뷰/실제 main.js 신규 회귀 실패 확인.
- 변경: preview-model.mjs의 formatDemoUsdAmount는 유한 비음수에 대하여 양수 1센트 미만만 <$0.01 표시, 0 또는 1센트 이상 기존 포맷 유지. main.js/ order-review.mjs의 명목가치·참고 증거금 표시만 수정, 원본 계산/사용자 가격 변경 없음.
- 신규 preview-model.test.mjs 1건(소액·0/경계/비정상), order-review.test.mjs 1건(LIMIT 소액 및 SOL MARKET 소액 증거금), order-interactions.test.mjs 1건(실제 main.js 이벤트 기반 소액 입력·읽기 전용 검토 일치), 총 3건.
- 수정 후 관련 대상 37/37 PASS, frontend 전체 node --test frontend/*.test.mjs 130/130 PASS (기존 127 + 신규 3). JS node --check/TypeScript tsc --noEmit/HTML/CSP/git diff 검사 PASS.
- 실제 브라우저 화면·스크린리더/모바일 터치 인수, 실지갑·인증 API/실체인·운영 DB 변경/푸시/배포는 미실행.

## 2026-10-25 UX-HL-02-G1 — 동일 선택 버튼의 상태 보존 검증

- 시작 main HEAD 49b86a6, working tree clean, origin/main보다 21커밋 앞섬. PROJECT_STATE.md, ROADMAP.md, Hyperliquid UX 레퍼런스, UX-HL-01 SPEC/TODO/QA/RESULT와 main.js/order-interactions.test.mjs 및 UX-HL-02 관련 문서를 검토.
- chromium/chromium-browser/google-chrome/google-chrome-stable/firefox 및 Node Playwright/Puppeteer 패키지 미가용. 설치·권한 우회 없이 UX-HL-01-I2와 UX-HL-02-F2 실 브라우저 인수 미완료 유지.
- 실제 결함: 현재 BUY/MARKET 방향·유형 버튼을 다시 클릭해도 order-result.hidden=true가 되어 동일한 유효한 9항목 읽기 전용 검토가 사라짐. SELL/LIMIT 선택에서도 동일. 신규 실제 main.js DOM 이벤트 테스트 2건 수정 전 FAIL.
- 수정: frontend/main.js의 방향·유형 클릭 핸들러에서 view.side 또는 view.orderType이 이미 선택한 값이면 return. 실제 선택이 바뀌면 기존 renderTicket 및 review 무효화 유지.
- 신규 frontend/order-interactions.test.mjs 2건: BUY/MARKET 재클릭 시 기존 검토 DOM 유지, 실제 SELL/LIMIT 변경 시 닫힘; SELL/LIMIT의 비정상 Limit 초안/오류 상태 및 유효한 검토 결과 재클릭 보존, BUY/MARKET 실제 변경 시 닫힘.
- 대상 node --test frontend/order-interactions.test.mjs 20/20 PASS. 전체 node --test frontend/*.test.mjs 134/134 PASS (기존 132 + 신규 2), node --check main.js/order-interactions.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser trade/index 태그·고유 ID, CSP connect-src none, 계정 tbody 5개 미연결 및 git diff --check 검사 PASS.
- 브라우저/모바일/스크린리더 실제 렌더링, 실거래·지갑·계정 인증/DB·Sepolia 트랜잭션·원격 push/배포 미실행.

## 2026-10-25 UX-HL-02-H1 — 빠른 수량 재선택 시 검토 보존 QA

- 시작 main HEAD 58d0195, 작업 트리 clean, origin/main 대비 22개 로컬 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 레퍼런스, UX-HL-02 SPEC/TODO/QA/RESULT와 frontend 실제 이벤트 코드를 확인했다.
- chromium/chromium-browser/google-chrome/firefox 실행 파일 및 Node Playwright/Puppeteer 미가용. 설치·권한 우회 없이 G2/I2 브라우저 인수는 미완료로 유지했다.
- 수정 전 신규 실제 main.js 이벤트 테스트 2건 FAIL: 값 0.05에서 활성 0.05 버튼 재클릭 시 결과 hidden=true, 값 0.01에서도 같은 문제. 실제 0.1/0.25 변경 때는 검토가 닫혀야 한다.
- 수정: data-qty 클릭 이벤트에서 현재 input.value===button.dataset.qty일 때 즉시 return, 값이 다를 때만 기존 수량 반영/renderTicket/기존 결과 무효화 유지.
- 신규 frontend/order-interactions.test.mjs 2건: 기본 0.05 동일 클릭에 따른 리뷰 DOM 보존·다른 수량 변경의 무효화, 0.01 선택 후 같은 수량 재클릭과 0.25 변경의 상태 전환 검증.
- 지정 이벤트 테스트 22/22 PASS. 전체 node --test frontend/*.test.mjs 136/136 PASS (기존 134+신규 2), node --check frontend/main.js 및 order-interactions.test.mjs PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 구조·고유 ID, CSP connect-src none, 미연결 계정 tbody 5개 및 network/wallet transaction API 부재, git diff --check PASS.
- 실제 브라우저 픽셀·터치/키보드·스크린리더·실주문·API/지갑/운영 DB·Sepolia 거래·배포/원격 push는 수행하지 않았다.

## 2026-10-25 UX-HL-02-I1 — 빠른 수량 버튼 aria-pressed 정합성 QA

- 시작 HEAD fb0232a, Git clean, origin/main보다 로컬 23커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX 가이드 및 UX-HL-02 SPEC·TODO·QA·RESULT·main.js·trade.html 실제 파일 검토.
- chromium/chromium-browser/google-chrome/firefox와 Node Playwright/Puppeteer 미가용. 설치·권한 우회 없음. UX-HL-02-H2/G2·UX-HL-01-I2 실제 브라우저 검증 계속 미완료.
- 재현: 모든 data-qty 버튼은 초기/실행 중 CSS active만 토글하므로 aria-pressed 없음. 수정 전 실제 main.js DOM 이벤트 테스트 1건 및 HTML 정적 초기 상태 검사 1건 FAIL 확인.
- 변경: frontend/trade.html 네 버튼에 초기 aria-pressed(true는 0.05만)를 추가. frontend/main.js renderTicket에서 quantity === b.dataset.qty와 동일한 판정으로 CSS active 및 aria-pressed를 동시에 설정한다.
- 추가 frontend/order-interactions.test.mjs 1건: 초기 수량 0.05, 프리셋 0.25 클릭, 수동 0.07(모두 false), 수동 0.01과 동일 프리셋 재클릭의 선택 상태·CSS 정합성을 검증. frontend/order-ticket.test.mjs 1건: HTML 네 버튼 중 정확히 0.05만 초기 aria-pressed true.
- 수정 후 관련 36/36 PASS, 전체 node --test frontend/*.test.mjs **138/138 PASS** (기존 136+신규 2). Node JS 문법검사 main.js/order-ticket.test.mjs/order-interactions.test.mjs PASS, npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser trade.html/index.html 태그/고유 ID, CSP connect-src none, 지갑·계정 데이터 5개 tbody 공백, git diff --check PASS.
- 진짜 스크린리더/브라우저 접근성 트리·모바일 뷰포트/터치 인수, 실지갑/백엔드 API·Sepolia·운영 DB·실거래/푸시/배포 없음.

## 2026-10-25 UX-HL-02-J1 — 같은 수치의 빠른 수량 재선택 회귀

- 시작 로컬 main HEAD 2ccf535, Git clean, origin/main 대비 31커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX reference, UX-HL-01-N1 및 UX-HL-02 SPEC/TODO/QA/RESULT, main.js/preview-model.mjs/실제 이벤트 통합 테스트를 확인.
- 샌드박스 점검: 기존 프로젝트 내부 Playwright/Chromium 설치(약 643MB), 비특권 사용자 unshare -Ur 실행은 Operation not permitted. 브라우저 인수 UX-HL-01-N2와 UX-HL-02-J2는 미완료. no-sandbox·권한 우회 금지 유지.
- 수정 전 신규 order-interactions.test.mjs 2건 FAIL: 정상 0.050 입력 후 0.05 프리셋 클릭 시 사용자의 입력 포맷이 0.05로 바뀌고 리뷰가 무효화되며, aria-pressed도 0.050 프리셋을 false로 표시.
- 수정: matchesQuickQuantity(quantity,preset)는 기존 validPreviewQuantity(quantity) 후 Number(quantity)===Number(preset)일 때만 true. renderTicket의 active CSS·aria-pressed 및 data-qty 클릭 핸들러의 동일 수량 검출에서 공통 사용한다.
- 실행형 회귀: 유효한 0.050 검토 후 0.05 클릭은 기존 리뷰 노드/입력 포맷·표시 보존; 다른 프리셋 0.1은 리뷰 무효화. 입력 직접 변경 0.050/5e-2/0.0100/0.07와 부적합 공백·문자 입력의 선택 상태 점검.
- 수정 후 대상 node --test frontend/order-interactions.test.mjs 34/34 PASS, 전체 node --test frontend/*.test.mjs 154/154 PASS (기존 152+신규 2), 모든 프런트 JS node --check PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html·trade.html 태그/중복 ID, 정적 CSP connect-src none·계정 tbody 5개 빈 상태, git diff --check PASS.
- 실제 브라우저/스크린리더 입력 포맷 및 모바일 인수 미실행. 서버/지갑·실주문·Sepolia 트랜잭션·운영 DB·원격 push/배포 미실행.

## 2026-10-25 UX-HL-02-K1 — 수량 직접 입력과 모의 검토 일관성

- 시작 main HEAD 10b612b, 작업 트리 clean, origin/main 대비 34커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX 레퍼런스, UX-HL-01/P1 및 UX-HL-02 SPEC/TODO/QA/RESULT, frontend/main.js/trade.html/model/이벤트 회귀 확인.
- Playwright/Chromium은 .local-browser-qa/에 존재(약 643MB). 비특권 사용자 unshare -Ur true 실행은 Operation not permitted. UX-HL-01-P2 및 UX-HL-02-K2 실제 브라우저 인수 보류, --no-sandbox·안전 제한 우회 없음.
- 수정 전 실제 main.js 입력 이벤트 테스트 신규 2건 FAIL. DEMO 검토 후 Quantity를 0.05에서 0.050처럼 같은 유효 수치로 직접 바꾸면 order-result.hidden=true로 바뀌던 문제 확인.
- 수정: 성공적으로 생성한 DEMO 검토의 당시 Quantity 숫자값을 보관. quantity input 시 현재 검토가 열려 있고 새 값이 validPreviewQuantity를 만족하며 검토 당시 수치와 같은 경우에만 숨김 처리 생략. 실제 0.06 변경, 비정상 0.05bad 입력과 다시 원래 수치로 되돌아가는 경우는 검토 숨김 지속.
- 신규 회귀는 Market 0.05→0.050→5e-2→.05→0.05의 기존 리뷰 DOM/명목가치 유지, 수량 변경 시 무효화·이전 값 복귀 시 재표시 금지 및 Limit 주문 중 유효 표기 변경 후 부적합 입력 차단을 실제 DOM 이벤트로 검사.
- 수정 후 대상 node --test frontend/order-interactions.test.mjs 40/40 PASS, 전체 node --test frontend/*.test.mjs 160/160 PASS (기존 158+신규 2), 모든 프런트 JS node --check PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html, frontend/trade.html 중첩 태그·고유 ID, CSP connect-src none 및 빈 계정 tbody 5개, git diff --check PASS.
- 실제 브라우저/보조공학/모바일 검증 미수행. 지갑/실계정/서명·실체인 거래·운영 DB·원격 Push·배포 미실행.

## 2026-10-25 UX-HL-02-L1 — Limit Price 수치 동치 편집 검증

- 시작 HEAD 545a6cc, main 작업 트리 clean, origin/main보다 35개 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 레퍼런스, UX-HL-02 SPEC/TODO/QA/RESULT 및 frontend/trade.html/main.js/preview-model.mjs/회귀 테스트 확인.
- 브라우저: 프로젝트 로컬 .local-browser-qa Playwright/Chromium 약 643MB, 비권한 runuser -u node -- unshare -Ur true 실행은 Operation not permitted. Chromium 샌드박스 지원 불가. UX-HL-01-P2/UX-HL-02-K2/L2 실제 브라우저 인수는 미완료, --no-sandbox 우회 미실행.
- 결함: DEMO Limit 검토 생성 후 입력 60000.50→60000.5는 동일 가격인데도 limit-price input 처리에서 검토가 무조건 닫힘. 신규 main.js 이벤트 테스트 2건 수정 전 FAIL.
- 변경: frontend/main.js의 성공한 DEMO 검토 경로에 reviewedLimitPrice(유효 Limit 가격 숫자) 저장. limit-price 입력 시 LIMIT·가시적 검토·validPreviewLimitPrice 통과·reviewedLimitPrice와 수치 동치일 경우에만 검토를 유지. 다른 가격/부적합 문자열은 기존처럼 숨김.
- 회귀: 동일값 표현 60000.50/60000.5 왕복의 기존 리뷰 DOM·참고 증거금 유지, 60000.51 실제 변경 시 숨김, 원래 가격 복귀 시 자동 복구 금지, 부적합 60000.500/6e4/0/60000.5x 차단 및 aria-invalid/disabled 확인.
- 수정 후 node --test frontend/order-interactions.test.mjs 42/42 PASS, 전체 node --test frontend/*.test.mjs 162/162 PASS(기존 160+신규 2). 모든 프런트 JavaScript node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser 두 HTML의 태그/고유 ID, 정적 CSP connect-src none·미연결 계정 tbody 5개·실주문 차단, git diff --check PASS.
- 실제 브라우저·스크린리더 인수 미실행. 지갑/실거래·Sepolia 트랜잭션·운영 DB·원격 push/배포·권한 우회 없음.

## 2026-10-25 UX-HL-02-M1 — DEMO Long/Short 버튼 방향 아이콘 검증

- 시작 main HEAD 2a1a201, Git clean, origin/main보다 로컬 36커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX 레퍼런스, UX-HL-02 SPEC/TODO/QA/RESULT, 실제 frontend/main.js 및 테스트 확인.
- 프로젝트 내부 .local-browser-qa Playwright/Chromium 약 643MB 설치. 비특권 사용자 unshare -Ur → Operation not permitted. Chromium 샌드박스 우회 없이 UX-HL-02-L2/UX-HL-01-P2 실브라우저 인수 미완료.
- 재현: Short 선택 시 기존 텍스트와 CSS/ARIA는 Short로 변경되지만 화살표는 상승 ↗로 남는다. 기존 DOM 이벤트 회귀 2건 신규, 수정 전 2/2 FAIL.
- frontend/main.js에서 같은 renderTicket 처리의 아이콘 span을 sideBuy?↗:↘ 방향으로 계산한다. 기존 주문 미리보기·검증·데이터·모델은 변경하지 않는다.
- 재검증: 신규 2건 포함 실제 DOM 이벤트 44/44 PASS, 프런트 전체 164/164 PASS (162+2), 모든 프런트 JS 문법, npm --prefix backend run build의 tsc --noEmit PASS. HTMLParser/index.html/trade.html 중첩/고유 ID·정적 CSP connect-src none·계정 tbody 5개 미연결·git diff --check PASS.
- 화면 실렌더링/보조공학·모바일 인수 미실행. 지갑/인증·실체인 트랜잭션·실거래·운영 DB·원격 Push/배포·보안 제한 우회 미실행.

## 2026-10-25 UX-HL-02-N1 — 레버리지 동일 입력 이벤트 시 DEMO 리뷰 상태 검증

- 시작 HEAD 63a4b56, main 작업 트리 clean, origin/main 대비 38커밋 ahead. PROJECT_STATE, ROADMAP, Hyperliquid UX reference, UX-HL-01-Q1·UX-HL-02 SPEC/TODO/QA/RESULT, 실제 frontend/main.js/preview-model.mjs/order-interactions 테스트 점검.
- 브라우저 체크: 프로젝트 내부 Playwright/Chromium 643 MB 설치 존재. 비특권 사용자 runuser -u node -- unshare -Ur true는 Operation not permitted. 권한·안전 검사 우회 없이 UX-HL-01-Q2 및 UX-HL-02-N2 브라우저 인수 미완료 유지.
- 수정 전 main.js leverage input은 renderTicket 뒤 order-result.hidden=true를 무조건 실행. 신규 회귀 2개에서 3× 검토 후 값 변화 없이 input 이벤트를 다시 보내자 검토가 숨겨져 둘 다 FAIL.
- 수정: 성공한 DEMO 검토의 reviewedLeverage를 Number(...)로 보관. 같은 값 input 이벤트 때 검토가 이미 보이고 validPreviewLeverage 검사에 성공한 경우에만 기존 DOM·금액을 보존한다. 실제 3×→4× 변경/부적합 03/이미 숨긴 리뷰는 기존처럼 무효화, 값 복귀로 stale 리뷰 재표시하지 않음.
- 수정 후 대상 node --test frontend/order-interactions.test.mjs 48/48 PASS, 전체 node --test frontend/*.test.mjs 168/168 PASS(기존 166+신규 2). 모든 frontend JavaScript node --check, npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html·frontend/trade.html 중첩 태그 및 고유 ID 검사, CSP connect-src none·미연결 계정 tbody 5개·실주문 금지 고지 및 git diff --check PASS.
- 실제 브라우저·모바일/스크린리더·키보드 기본 동작 인수, 실거래·Sepolia 트랜잭션·운영 DB·자격증명·원격 push/배포 미실행.

## 2026-10-25 UX-HL-02-O1 — 레버리지 슬라이더 눈금 비율

- 시작 main HEAD 4e208cb, Git clean, origin/main 대비 48커밋 ahead. PROJECT_STATE/ROADMAP, Hyperliquid UX reference, UX-HL-02 SPEC/TODO/QA/RESULT, frontend/main.js, trade.html/trade.css/styles.css 및 기존 프런트 전체 테스트 확인.
- 브라우저: .local-browser-qa Chromium/Playwright 약 643MB 존재하나 비특권 runuser -u node -- unshare -Ur true → Operation not permitted. 권한·샌드박스 우회 없이 J2/O2 실제 Chromium·인증 API 인수 보류.
- 실제 결함: CSS 기본 .leverage-ticks display:flex; justify-content:space-between은 4개의 1×·3×·5×·10× 눈금을 0%, 33.33%, 66.67%, 100%에 배치한다. 실제 1~10 range 내 3×·5× 위치는 각각 약 22.22%, 44.44%. 수정 전 신규 정적 회귀 2건 중 실제 CSS 위치 검증 1건 FAIL, HTML 범위·라벨 검증 1건 PASS.
- 수정: frontend/trade.css에서 눈금을 position:relative/block으로 배치, 중간 span 22.22%·44.44%, 양 끝 0/100%. pointer-events:none을 사용해 눈금이 실제 슬라이더 입력을 가로막지 않도록 함. html·JavaScript·입력 이벤트·레버리지/주문 계산 불변.
- 수정 후 node --test frontend/leverage-ticks.test.mjs 2/2 PASS; 전체 node --test frontend/*.test.mjs 188/188 PASS(기존 186+2). 모든 frontend JS node --check, npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 구조·중복 ID, CSP connect-src none·빈 계정 tbody 5개·실거래 미실행 안내 및 Git diff --check PASS.
- 실제 Chromium 픽셀/모바일 터치/키보드/스크린리더 인수는 미수행. 지갑·실주문·Sepolia 트랜잭션·운영 DB·자격증명·원격 Push/배포/샌드박스 우회 없음.

## 2026-10-25 UX-HL-02-P1 — 빠른 수량 버튼의 단위 접근성

- 시작 HEAD c9d2704, main clean, origin/main보다 로컬 50커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX reference/UX-HL-01-R1·UX-HL-02-O1 문서 및 실제 main.js, trade.html, preview model/모바일·계정 관련 코드 확인.
- 브라우저: Playwright/Chromium .local-browser-qa 약 643 MB 존재, 비특권 runuser -u node -- unshare -Ur true 는 Operation not permitted. 권한 우회 없이 실제 Chromium R2/O2/P2 인수 미완료.
- 수정 전 신규 frontend/order-interactions.test.mjs 2건 모두 FAIL: 동적 BTC preset aria-label null, 정적 기본 BTC preset ARIA에 자산 단위 없음.
- 수정: renderTicket에서 각 data-qty 버튼의 ARIA 이름에 모의 수량 및 현재 view.market 단위 동기화. 정적 trade.html에도 BTC 기본 이름 추가. visible 숫자, aria-pressed, 계산/리뷰 불변.
- 수정 후 node --test frontend/order-interactions.test.mjs 52/52 PASS, node --test frontend/*.test.mjs 192/192 PASS(기존 190+2). 전체 frontend JS node --check 및 npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser 두 HTML 구조·고유 ID, CSP connect-src none, 미연결 계정 tbody 5개 및 DEMO-only, git diff --check PASS.
- 실제 Chrome/모바일/스크린리더 인수·지갑/API·실거래·Sepolia 트랜잭션·운영 DB·원격 push/배포·자격증명 및 보안 제한 우회 없음.

## 2026-10-25 UX-HL-02-Q1 — JavaScript 부재 시 주문 미리보기 가짜 활성 상태 제거

- 시작 main HEAD adfc6dd, 작업 트리 clean, origin/main 대비 로컬 52커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-01-S1/UX-HL-02-P1 TASK SPEC·TODO·QA·RESULT 및 실제 main.js, trade.html, 반응형/모바일/접근성 코드, preview-model·order-review/test 검토.
- Chromium 상태: .local-browser-qa Playwright 캐시 약 643MB, 비특권 runuser -u node -- unshare -Ur true → Operation not permitted. 보안 제한 우회 없이 S2/R2/P2 및 Q2의 실 브라우저 인수 미완료.
- 결함 재현: 기존 정적 Preview Long Order submit 버튼은 enabled, 이벤트 listener는 main.js 후반부에서만 등록. JS-off 또는 로딩 오류 시 클릭해도 미리보기 동작이 없으며 form-action none으로 서버 전송도 불가. 신규 static regression은 수정 전 FAIL, 동적 유효/무효/복구 검사 1건은 기존 동작 PASS.
- 수정: frontend/trade.html의 preview-order에 disabled 속성 추가, noscript에 JavaScript 미실행 안내문 배치. frontend/main.js 수정 없음: updateMarket → renderTicket에서 입력 유효성에 따라 버튼을 활성화하는 기존 로직으로 정상 초기화 시 기능 회복.
- 변경 후 대상 node --test frontend/order-interactions.test.mjs 54/54 PASS, 전체 node --test frontend/*.test.mjs 196/196 PASS(기존 194+2). 모든 frontend JS node --check, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser frontend/index.html/trade.html 태그 중첩·중복 ID, CSP connect-src none 및 form-action none, 계정 tbody 5개 비연결과 LOCAL PREVIEW·NO EXECUTION, git diff --check PASS.
- 실제 JS-off/JS-on Chromium 시각·키보드·스크린리더 인수는 미실행. 지갑/계정 API·실거래·Sepolia 트랜잭션·운영 DB·원격 push/배포·자격증명·보안 우회 없음.

## 2026-10-25 UX-HL-02-R1 — 조건부 ARIA 오류 연결과 영구 입력 안내

- 시작 로컬 main HEAD 8e6f9a4, Git clean, origin/main 대비 53커밋 ahead. PROJECT_STATE, ROADMAP, Hyperliquid UX reference, UX-HL-02-Q1/UX-HL-01-S1 TASK SPEC/TODO/QA/RESULT 및 실제 main.js/trade.html, 주문 모델/리뷰, 모바일/계정 탭 테스트 코드 확인.
- Chromium Playwright 캐시 .local-browser-qa 약 643MB 존재하나 비특권 runuser -u node -- unshare -Ur true → Operation not permitted. 권한/샌드박스 우회 없이 UX-HL-02-Q2/UX-HL-01-S2/UX-HL-02-P2 및 R2 실제 브라우저 인수 보류.
- 결함: 양호한 quantity/limit-price/leverage도 명시적인 aria-describedby에서 hidden 오류 문구를 참조했다. 수량·레버리지의 입력 가능 범위에 관한 상시 비오류 설명도 없었다.
- 신규 프런트 DOM 회귀 2건 모두 수정 전 FAIL: 정상 입력에서 중립 help ID만 연결해야 하며, 비정상 입력에서 error ID 추가·정상 복귀 시 제거해야 한다는 조건. 원래 정적 aria-describedby 기대값을 가진 기존 테스트 2건은 새 동작에 맞게 기대값 갱신.
- 수정: HTML 수량/레버리지 중립 help 추가, Limit 기존 help 유지; 정적 속성에서 오류 ID 분리. main.js renderTicket에서 세 입력의 aria-describedby를 유효성 검사 결과와 동기화. 주문 계산·버튼/리뷰 정책 불변.
- 수정 후 핵심 3파일 node --test frontend/order-interactions.test.mjs frontend/order-review.test.mjs frontend/order-ticket.test.mjs 78/78 PASS, 전체 node --test frontend/*.test.mjs 198/198 PASS (기존 196+2). 전체 frontend JS node --check 및 npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html·frontend/trade.html 태그 중첩·고유 ID, CSP connect-src none/form-action none, 미연결 계정 tbody 5개, 초기 정적 aria-describedby/도움말/비활성 Preview 및 git diff --check PASS.
- 실제 Chromium/스크린리더/모바일 음성·시각 인수 미실행. 실거래·지갑/계정 API·Sepolia 트랜잭션·운영 DB·원격 Push/배포·자격증명/샌드박스 우회 없음.

## 2026-10-25 UX-HL-02-S1 — change 이벤트-only 주문 값 변경 회귀

- 시작 로컬 main HEAD 5f907f8, Git clean, origin/main보다 56커밋 ahead. PROJECT_STATE/ROADMAP·Hyperliquid UX reference·UX-HL-01-U1/UX-HL-02-R1 SPEC/TODO/QA/RESULT 및 실제 frontend/main.js, trade.html, preview-model, order-review, 모바일/계정 탭·기존 테스트 확인.
- 브라우저: Playwright/Chromium .local-browser-qa 약 643MB 존재. 비특권 runuser -u node -- unshare -Ur true 명령은 Operation not permitted. 샌드박스/권한 우회 없이 UX-HL-01-U2/T2, UX-HL-02-R2/S2 실제 브라우저 인수 보류.
- 수정 전 신규 2건 FAIL: 정상 검토를 생성하고 quantity=0.2로 값만 변경한 뒤 change만 발행하면 이전 검토 패널이 여전히 visible. Limit=40000으로 change만 발행해도 앞선 가격의 검토가 visible. 이는 JS addEventListener('input')만 등록한 기존 동작의 누락이다.
- 수정: frontend/main.js의 기존 수량·Limit 가격·레버리지 콜백을 각 이름 있는 공용 핸들러로 바꾸어 input/change를 함께 구독. 검토된 수치의 동등성 비교·검토 무효화 및 renderTicket 재검증은 기존 알고리즘 그대로 재사용.
- 수정 후 신규 frontend/order-interactions.test.mjs 2건 PASS: change-only 수정·잘못된 값/수정 복구 및 참고 USD 금액·리뷰 감춤 확인. 대상 node --test frontend/order-interactions.test.mjs 61/61 PASS, 전체 node --test frontend/*.test.mjs 204/204 PASS(기존 202+신규2).
- 전체 frontend JS node --check, npm --prefix backend run build(tsc --noEmit), Python HTMLParser index.html/trade.html 구조·고유 ID, CSP connect-src none/form-action none, 계정 미연결/비실거래 고지, git diff --check PASS.
- 실 Chrome/스크린리더/모바일 인수 미실행. 실제 API·실주문·Sepolia 트랜잭션·운영 DB·자격증명·원격 push·배포·보안 우회 없음.

## 2026-10-25 UX-HL-02-T1 — 주문 검토 결과 패널 포커스 스크롤

- 시작 main 로컬 HEAD 07244d9, Git clean, origin/main 대비 57커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-01-U1·UX-HL-02-S1 TASK SPEC/TODO/QA/RESULT, frontend/main.js·order-review.mjs·trade.html·trade.css 및 관련 DOM/렌더러/모바일 테스트 재점검.
- 브라우저: .local-browser-qa 약 643MB Playwright Chromium 캐시 존재. 비특권 runuser -u node -- unshare -Ur true → Operation not permitted. 제한 우회 없이 UX-HL-02-S2/T2·UX-HL-01-U2/T2·UX-HL-02-R2 실제 브라우저 인수 미완료.
- 사용자 흐름 결함: 주문 결과는 버튼 아래 새로 드러나는 role=status / tabindex=-1 패널이며 렌더러가 focus({preventScroll:true})를 호출했다. 좁은 모바일 뷰포트에서 focus 대상이 화면 아래에 남을 수 있으므로 검토 확인 흐름 방해.
- 신규 렌더러 unit과 실제 주문 폼 submit DOM 통합 회귀 2건 모두 수정 전 FAIL(패널 focus 인자에 preventScroll:true 확인). DOM fixture가 실제 스크롤/페인트는 모의 실행하지 않는 한계를 명시.
- 수정: frontend/order-review.mjs의 패널 hidden=false 이후 panel.focus()로 변경, 기존 검토 9개 행·Esc/닫기/포커스 복귀 및 DEMO-only 정책 유지.
- 수정 후 node --test frontend/order-review.test.mjs frontend/order-interactions.test.mjs 72/72 PASS, 전체 node --test frontend/*.test.mjs 206/206 PASS(기존 204 +2). 전체 프런트 JS node --check, npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser 두 HTML 구조/고유 ID, CSP connect-src none/form-action none, Preview 버튼 초기 disabled, 계정 tbody 5개 및 DEMO 고지, git diff --check PASS.
- 실제 모바일 자동 스크롤·포커스·키보드/스크린리더 시각 인수는 미수행. 지갑/실계정 API·실거래·Sepolia 트랜잭션·운영 DB·원격 push/배포·자격증명/샌드박스 우회 없음.
