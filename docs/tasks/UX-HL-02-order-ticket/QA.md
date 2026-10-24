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
