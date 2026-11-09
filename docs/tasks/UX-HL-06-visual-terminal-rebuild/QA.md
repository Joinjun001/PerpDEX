# UX-HL-06 QA

상태: **A1/A2 정적·회귀 검사 완료, A3 실제 브라우저 인수 미완료** (2026-11-10)

## 검증 환경 및 범위

- 작업 경로: `/shared/PerpDEX`; 시작 Git 상태는 clean, 기준 커밋 `f4fa79f`.
- 실행: `node --test frontend/*.test.mjs` — 기존 210개 및 UX-HL-06-A 신규 3개를 포함한 전체 결과는 최종 검증 기록 참조.
- 문법: `node --check`로 프런트엔드 JS 모듈 검사; `git diff --check` 사용.
- 새 테스트 `frontend/ux-hl-06-layout.test.mjs`: 계정 패널의 동일 Grid 소속, 우측 주문 패널 독립 배치, 데스크톱 3열 비율, 1070/760px 분기, 모바일 내비게이션, MOCK_SAMPLE/UNAVAILABLE·지갑 비활성·네트워크 차단 회귀.
- 기존 `frontend/mobile-portfolio-link.test.mjs`는 모바일에서 내비게이션을 다시 표시하는 설계 변경을 반영해 갱신.

## 브라우저 검증 시도 — 실패 (완료로 주장하지 않음)

- Playwright 설치는 확인했으나 기본 Chromium 실행 파일은 캐시에 없음.
- 로컬에 보존된 `.local-browser-qa/browsers/chromium-1208/chrome-linux64/chrome`를 **샌드박스 활성 상태**로 실행 시도했으나 브라우저 프로세스가 종료되어 시각 검증에 실패.
- `--no-sandbox` 등의 보안 우회 옵션은 사용하지 않음.
- 따라서 1536×960, 1280×800, 768×1024, 390×844, 200% 확대, 실제 오버플로/클릭/스크린리더 검증은 **미완료**. 정적 Grid 규칙만 검증함.

## 보존한 안전/데이터 계약

- 정적 차트·모의 호가·시장별 MOCK 샘플 수치의 의미·출처 유지.
- Mark/Oracle/Funding/OI/Available/Position 등 실제 미연결 값은 계속 대시(—) 표시.
- 주문 버튼은 미리보기 전용이며 지갑·RPC·네트워크 연결/배포는 하지 않음.
- 기존 M5~M9 개발·실거래 선행 게이트 불변.

## 잔여 결함/위험

1. 브라우저에서 Grid의 시각적 너비와 주문 스크롤, 브레이크포인트 경계/200% 확대를 확인하지 못함.
2. 좁은 화면에서 시장 선택/주문 티켓 줄바꿈 및 계정 표 가로 스크롤을 실제 터치/키보드로 인수해야 함.
3. A3 인수 후 B단계 차트 개선을 진행할 수 있으며, 검증 전 A 전체 완료 판정 금지.

## 최종 검증 결과

- 전체 프런트엔드 테스트: **213/213 PASS**, 실패 0건.
- `frontend/*.js`·`frontend/*.mjs` 전체 `node --check`: **PASS**.
- `frontend/trade.html` Python HTMLParser 파싱: **PASS** (실제 렌더링 인수 아님).
- `git diff --check`: **PASS**.


## 2회차 UX-HL-06-B1 — 2026-11-10

### 구현 및 데이터 검증

- frontend/sample-candles.mjs: 기존 sampleChart(market,64)의 64개 고정 가격 샘플을 4/8개씩 묶어 합성 OHLC를 산출. 각 bar의 open/close는 그룹 시작/끝 샘플, high/low는 그룹 최대/최소값. 실제 거래소 캔들·시각 기준 분봉·거래량이 아님.
- frontend/main.js: Line ↔ Sample OHLC, 4/8 묶음 전환, aria-pressed 동기화, 시장 전환 시 재계산. 시각화 토글은 기존 주문 리뷰를 무효화하지 않음.
- frontend/trade.html 및 trade.css: MOCK_SAMPLE 출처와 모드 설명, 비활성 1m/5m/1h·Volume/Indicators. Mark/Oracle 및 계정 미연결 유지.
- 신규 sample-candles.test.mjs 4건에서 3시장×2그룹 OHLC 집계, 입력 경계, 원본 불변, 가격 범위/종단가격, SVG 경로 유한성과 결정성 검사.
- order-interactions.test.mjs 신규 1건에서 실제 main.js 핸들러를 테스트용 DOM으로 실행해 모드 전환·시장 변경·주문 리뷰 보존·무효화 회귀 확인.

### 테스트 실패와 조치

- 추가 통합 테스트 작성 시 소스에 문자 그대로의 역슬래시+n이 포함되어 SyntaxError 발생. 문자열을 실제 줄바꿈으로 수정한 뒤 전체 테스트 재실행하여 218/218 PASS.

### 브라우저 재검증 (미완료)

- 기존 정식 Chromium은 libnspr4 보완 후에도 libcups.so.2 누락으로 실행 불가.
- 로컬 Chromium Headless Shell의 실행 파일 확인. 일반 사용자(node)와 chromiumSandbox:true 설정으로 실행했으나 Chromium sandboxing failed 오류 발생.
- 보안 우회 옵션을 사용하지 않았으며 1536/1280/768/390 및 200% 확대, 실제 클릭/포커스/스크린리더 인수는 미완료.
- 최종 검증 결과: 프런트 전체 218/218 PASS, JS/HTML/변경 검사 별도 최종 확인.


## 3회차 UX-HL-06-C1 — 2026-11-10

### 구현 및 검증

- frontend/trade.html, trade.css, market-depth-tabs.js, mobile-market-depth.js: market-depth-surface 중간열을 공통 영역으로 구성하여 기존 market-depth-book과 market-depth-trades를 유지한다.
- JS 미실행 시 탭 바 숨김 + 두 영역 region으로 공개. 모듈 초기화 성공 후 탭 바 노출, 한 영역만 tabpanel로 표시하고 선택하지 않은 영역은 hidden 처리.
- 클릭·ArrowLeft/Right·Home/End·Enter/Space, Tab 비간섭, aria-selected/aria-controls/aria-labelledby 및 roving tabindex를 신규 테스트로 점검. 실제 스크린리더 인수는 별도.
- 모바일 접기 버튼은 공통 surface를 aria-controls로 가리키며 접기/펼치기 시 선택 탭을 보존. 760px 미디어쿼리에서만 접힌 surface 숨김.
- 원본 main.js의 7개 Ask+7개 Bid 호가, 누적 깊이/스프레드와 9개 샘플 체결, 시장별 단위와 Side ARIA는 불변. 시장 변경 시 숨겨진 영역도 갱신되며 주문 미리보기와 독립됨을 통합 회귀 검증.
- account-tabs.test.mjs의 전역 role=tab 카운트 단언을 계정 워크스페이스 내부 5개 탭 범위로 좁혀 타 컴포넌트 탭과 독립적으로 검증.
- 프런트 테스트: 225/225 PASS (이전 218에서 신규 7건), JS/HTML/변경 검사 최종 커밋 전 재실행.

### 실제 브라우저 제한

- Chromium Headless Shell을 일반 사용자, chromiumSandbox:true 상태로 다시 기동했으나 브라우저 프로세스 초기화 실패. 보안 우회 옵션 사용하지 않음.
- 1536/1280/768/390 너비, 200% 확대, 실제 키보드 포커스·모바일 터치·스크린리더 시각 인수는 미완료(A3·C2·F). 정적/가상 DOM 검사만 통과.

### 다음 작업

- UX-HL-06-C2: 호가 중간열 실제 시각 밀도·스프레드·모바일 접기/보조공학 인수. 브라우저 환경이 계속 제한되면 UX-HL-06-D1 주문 패널 정보 계층의 독립 구현을 진행.


## 4회차 UX-HL-06-C2a — 2026-11-10

### 로컬 구현과 데이터 출처

- 기준 로컬 커밋 309d9f1, 최초 Git 작업 트리 clean.
- frontend/trade.html: 기존 asks/bids/book-mid/book-spread/recent-trades ID와 계산 계약 보존. 매도·매수 라벨 ASKS/BIDS · MOCK_SAMPLE 추가.
- 기존 reference는 REFERENCE · MOCK, 계산된 spread는 SPREAD + MOCK으로 별도 강조하고 최우선 합성 매도−매수라는 근거를 노출. JS 미실행 시 spread — 및 미계산 접근성 이름 유지.
- frontend/trade.css: 공통 3열 숫자 Grid (1.35/1/1), tabular 숫자, 행간·폰트·대비, 누적 깊이 그라데이션 및 1330/760/360px 브레이크포인트를 보강.
- 기존 7개 Ask/7개 Bid, 9개 최근 거래, 시장/스프레드·누적 깊이 계산, 모바일 접기/ARIA 탭 및 주문/계정 로직 변경 없음.
- 신규 ux-hl-06-depth-visual.test.mjs 5개: MOCK 표시/DOM ID, 공통 열·숫자/깊이 스타일, spread 계산·ARIA, 반응형/접기 보존, 명목 대비 계산.
- 프런트 회귀 230/230 PASS (기준 225 + 신규 5), JavaScript 문법·HTML 파싱·Git 변경 검사는 커밋 전 최종 재검증.

### 실제 브라우저 제약

- 일반 사용자 node 권한 및 chromiumSandbox:true로 보존된 Chromium Headless Shell을 재실행했지만 Chromium sandboxing failed 오류 재현. 우회 옵션 사용 안 함.
- 1536/1280/768/390 및 200% 확대, 실제 픽셀·overflow·터치/스크린리더 검증은 미완료. 정적 CSS와 색상 계산 결과를 실제 시각 인수로 주장하지 않음.
- 따라서 완료 단위는 C2a 코드/정적/회귀로 한정. C2b/A3/F 실브라우저 인수 보류.

### 후속

- 환경이 허용되면 C2b/A3/F 시각 검증. 동일한 샌드박스 실패가 지속되는 동안은 다음 독립 구현 UX-HL-06-D1 주문 패널 밀도·정보 계층 개선을 진행.


## 5회차 UX-HL-06-D1 — 2026-11-10

### 실제 구현·계약

- 시작 로컬 Git 상태 clean, 최신 커밋 709ddff.
- frontend/trade.html: Order Preview 헤더, REFERENCE · MOCK_SAMPLE / ACCOUNT · UNAVAILABLE 출처 표시. Long/Short·Market/Limit → 수량/빠른 수량 → (Limit 선택 시) 가격 → 모의 배율 → 참고 가격/Notional/Indicative Margin → DEMO Preview CTA → 검토 결과 순으로 DOM 자체 순서를 변경.
- 금액과 계정 위험이 혼동되지 않게 Account & Risk/UNAVAILABLE 섹션(Available/Reserved/Position 및 비활성 Reduce Only)은 실제 검토 CTA 다음의 명시적 별도 읽기 영역으로 유지. 이 위치 변경은 기능 활성화가 아니라 상태 표시의 분리다.
- 실제 검토 결과 DOM(order-result)을 CTA 직후 동일 form 내에 배치해 생성 직후 키보드 포커스/읽기 순서를 보존. 검토 내 닫기 버튼은 기존 type=button 사용. 주문 서버/서명/지갑 전송 API 무변경.
- No-JS 기본 Preview CTA disabled, 예측 금액 —, Limit 입력 hidden/disabled, Reduce Only disabled, 인증 계정 금액 —, Fees/Funding Not configured. Indicative margin의 위치 안내 문장을 변경된 DOM 순서에 맞춰 수정.
- frontend/trade.css: 오른쪽 레일의 Source strip, Side/Type 버튼, 촘촘한 입력·비용 요약, CTA 최소 48px, 위험 상태 섹션, 모바일 760/360px 키보드·터치 크기 개선.
- 새 ux-hl-06-order-rail.test.mjs 정적/구조·데이터 출처·무JS·반응형 검사 4건, order-interactions.test.mjs에서 실제 main.js 핸들러의 Preview→Esc→Limit→시장 변경/계정 비활성 회귀 1건 추가.

### 검증 결과 및 한계

- 개발 중 신규 이벤트 테스트는 실제 앱 결함이 아닌 FakeDOM의 초기 HTML 자식 텍스트 미파싱 때문에 234/235 PASS. 계정 텍스트의 존재는 정적 HTML 검사, 이벤트 핸들러는 가상 DOM 동작 검사로 나누어 정정했다. 최종 전체 프런트 235/235 PASS, 실패 0개.
- JS/HTML/CSP/중복 DOM ID 및 Git 변경 검사는 커밋 전 최종 점검.
- Chromium Headless Shell을 일반 사용자, chromiumSandbox:true로 실행해도 Chromium sandboxing failed; 샌드박스 비활성화/우회 없이 종료. A3/C2b/F 실화면 1536/1280/768/390/200% 확대, 실제 화면 키보드/터치/스크린리더 검증 미완료.
- 미연결 계정 데이터를 실제 0이나 실잔액으로 바꾸지 않고, 기존 M5~M9·실거래 게이트/원격 push/배포 제한 유지.

### 다음 미완료 작업

- UX-HL-06-D2: Available/Position/Margin/Risk 출처/미지원 옵션의 정보 명료성·독립 회귀 보강. D1 화면의 실제 반응형/스크린리더 인수는 A3/F와 함께 보류.


## 6회차 UX-HL-06-D2 — 2026-11-10

### 출처·위험 표시 구현

- 시작 Git 상태: main clean, 기준 커밋 09b1eba. 읽은 파일: SPEC/TODO/QA/RESULT, PROJECT_STATE, ROADMAP, Hyperliquid architecture/UX reference, trade.html, trade.css, main.js, preview-model.mjs 및 관련 회귀 테스트.
- Market 모드는 REFERENCE · MOCK_SAMPLE, 실제 모의 주문 검토에도 동일한 가격 출처가 전달됨. Limit 최초 자동 설정 가격은 LIMIT PRICE · MOCK_DEFAULT, 사용자가 Limit 필드를 편집하면 LIMIT PRICE · USER_INPUT 출처를 표시. 선택 시장 변경 시 기존 MOCK 가격으로 Limit 기본값이 초기화되고 출처도 MOCK_DEFAULT로 복원. 같은 시장 재선택은 편집값과 출처를 유지.
- 미리보기 금액은 여전히 기존 previewOrderEstimate 함수로만 계산. Indicative margin(모의 명목가치÷모의 배율)은 초기/유지증거금·실제 가용 잔고·청산 위험이 아니라고 명시.
- Available/Reserved/Position Margin 3개는 여전히 — 미연결 상태. 새로운 Execution & Risk 읽기 영역에서 Trading Fee — 미설정, Funding Payment — 미연결, Liquidation Price — 미산출 표시. 숫자 0을 의미하지 않는다는 경고와 검증되지 않은 위험 데이터의 선행 조건 표시.
- Reduce Only 입력 disabled 유지. TP/SL, Cross/Unified, TWAP/Chase의 미구현 상태를 네이티브 details/summary 안내로 추가(새로운 거래 조작 UI는 생성하지 않음).
- 자금 사용, 실제 RPC, API 호출, 지갑 서명, 주문 실행, 백엔드 로직, 기존 계정 렌더러 변경 없음.

### 검증 범위와 중간 오류

- 신규 ux-hl-06-risk-source.test.mjs 5건: 데이터 출처, 데이터 미연결과 0 구분, 참고 증거금 수식, 미지원 기능/네트워크 안전, 키보드·모바일 CSS 상태.
- order-interactions.test.mjs 신규 3건: 실제 main.js 테스트 DOM에서 Market/Limit 초기 MOCK_DEFAULT 및 USER_INPUT 전환, 기존 주문 리뷰 무효화/금액 계산, 비정상 Limit 입력 거절, 동일 시장 재선택과 타 시장 전환 출처 보존/초기화.
- 테스트 작성 중 새 테스트의 문자열에 ASCII 인용 부호 미이스케이프가 있어 SyntaxError 1건 발생. 테스트 이름을 수정한 뒤 회귀 재실행 완료.
- 전체 테스트는 최종 **245/245 PASS** (기존 235, 신규 10), JS 문법/HTMLParser·고유 ID·CSP 및 git diff 검사 별도 최종 확인.

### Chromium 실브라우저 검사

- 프로젝트 내 Headless Shell을 일반 사용자와 chromiumSandbox:true 설정으로 기동 재시도했으나 Chromium sandboxing failed 오류가 다시 발생. --no-sandbox / chromiumSandbox:false는 사용하지 않음.
- 1536×960, 1280×800, 768×1024, 390×844, 200% 확대·실제 focus/키보드/스크린리더·스크롤 인수는 A3/C2b/F와 함께 **미완료**. Mock DOM / CSS 정적 테스트를 실제 화면 검증으로 간주하지 않음.

### 다음

- UX-HL-06-E1: 하단 5개 기존 account tab과 읽기 상태·모바일 표 탐색의 정보 밀도 및 접근성 개선. 원장/실계정 데이터 없음, E2 새 잔고 탭 보류. 실브라우저 인수는 가용한 정상 샌드박스 환경 확보 후 처리.


## 7회차 UX-HL-06-E1 — 2026-11-10

### 진단 및 구현

- 시작 Git: aa4df30, main...origin/main [ahead 7], clean. UX-HL-06 SPEC/TODO/QA/RESULT, PROJECT_STATE, ROADMAP, 참조 설계 및 실제 계정 탭/모델/렌더러/스크롤 안내와 HTML/CSS를 점검.
- 기존 5개 Positions, Open Orders, Order History, Trade History, Funding History 탭 id, tabindex, aria-selected, arrow/Home/End 이동 및 가로 스크롤 위치 보존. Balances 등 신규 탭 없음.
- trade.html: 5개 빈 상태용 ACCOUNT NOT CONNECTED 배지, 키보드 탭 이용 안내, 가로 탐색 region 및 기본 tabindex=-1 추가. JS 미실행/계정 검증 전 5개 표 hidden, tbody 전부 비어 있음.
- account-tabs-renderer.mjs: 상태 배지 필수 DOM 계약. disconnected→ACCOUNT NOT CONNECTED, loading→LOADING, 인증 후 empty→NO RECORDS, error→DATA UNAVAILABLE. 검증되지 않은 ready/empty는 disconnected로 처리, 유효한 ready만 데이터 표 표시, 잘못된 ready는 error. 기존 검증/레코드 투영 게이트 불변.
- account-table-scroll-hint.mjs: 원래의 모바일·선택됨·표 보임·overflow 조건 유지. 현재 왼쪽/중간/오른쪽 위치별 방향 안내, scroll/resize/보임 변경 반영. 숨김·데스크톱·종료 시 포커스/속성 해제.
- trade.css: 5탭 밀도·강조·표 숫자·빈 상태/오류/로딩 배지, 반응형 탭 44px 목표, 표/키보드 스크롤 영역과 텍스트 대비. 지갑/RPC/실계정/주문 활성화 없음.

### 검증·개발 중 조치

- 신규 10건: renderer 상태 배지/잘못된 ready/필수 DOM 검사 3, table scroll 위치/실제 scroll/hidden+dispose 3, account workspace 기존 5탭/JS 없는 표 숨김/출처·게이트/반응형 ARIA 4.
- 기존 FakeElement의 새 속성 제거 메서드 누락과 변경된 계정 헤더 문구로 최초 236/245 PASS. 테스트용 DOM 및 문구 기대값 수정 후 기준 245/245 PASS. 신규 10건 포함 전체 **255/255 PASS**. JS/HTML/중복 ID/CSP/Git 변경 최종 커밋 전 검사.
- Renderer의 테스트 전용 검증된 ready 경로 유지; 공개 페이지에서는 실제 인증·계정 조회 활성화 없음.

### 브라우저 한계 및 후속

- 일반 사용자 및 chromiumSandbox:true의 Headless Shell 기동 재시도 결과 Chromium sandboxing failed. 보안 우회 옵션 사용 안 함.
- 1536/1280/768/390, 200% 확대 및 실제 픽셀/클릭/키보드/스크린리더/표 스크롤 인수 A3/C2b/F1·F2 실브라우저 항목 미완료. 가상 DOM과 CSS 정적 테스트를 실제 브라우저 인수로 주장하지 않음.
- 다음 독립 작업: UX-HL-06-F2a — 오프라인 상태, 키보드·ARIA·출처·미지원 기능의 정적/DOM 통합 감사와 결함 보완. E2 신뢰 계정 데이터 미충족으로 보류, F 실브라우저 인수 미완료 유지.


## 8회차 UX-HL-06-F2a — 2026-11-10

### 시작 상태 및 감사 대상

- Git 기준: bdbe07b / clean / main...origin/main [ahead 8]. PROJECT_STATE, ROADMAP, UX-HL-06 SPEC/TODO/QA/RESULT, 설계 레퍼런스와 market-picker, chart, market-depth-tabs, mobile-market-depth, order-preview/review, account-tabs 및 오프라인 account renderer/hint의 소스·테스트 점검.
- 시장: aria-pressed 전환, 합성 시세 aria-label/실제 시세 아님 명시, aria-live 선택 계약 알림. Market picker에 그룹 레이블 추가.
- 차트: Line/OHLC aria-pressed, 4/8 그룹 enable/disable, SVG-native display, 생성 가격의 출처, 실제 시간축/Volume/Indicators 비활성 확인.
- 호가: Book/Trades 탭 roving tabindex, Arrow/Home/End, 모바일 접기, 시장 변경 시 가상 호가/체결 재계산, 선택 탭 보존. 모의 가상 깊이/스프레드 유지.
- 주문: Mock reference, Limit 자동 MOCK_DEFAULT, Limit 직접 USER_INPUT, 금액 미리보기·리뷰의 출처 일치 및 비활성 계정·수수료·펀딩/청산가 확인.
- 계정: 5개 탭만 제공, 조회 전 hidden 빈 테이블, disconnected != 조회 성공 후 empty, keyboard focus/overflow hint 및 인증 전 데이터 불허 확인.

### 실제 수정된 독립 결함

- 이전에는 자동 입력 MOCK_DEFAULT 가격으로 리뷰를 생성한 뒤 같은 숫자로 Limit Price를 편집하면 상단 출처만 USER_INPUT으로 바뀌고 과거 리뷰의 MOCK_DEFAULT 출처가 유지될 수 있었음.
- frontend/main.js에서 검토 시점의 Limit price origin을 보존하고, 현재 사용자 편집 출처와 다르면 숫자가 같더라도 과거 리뷰를 hidden 처리함. 기존 USER_INPUT에서 동등한 숫자 서식 변경 시에는 기존 리뷰 유지, Escape 키로 검토 닫기/Preview 버튼 focus 복귀 유지.
- Limit 가격 레이블은 기본값일 때 Limit Price (MOCK default), 사용자 편집 이후 Limit Price (user input)으로 표시. frontend/trade.html에 시장 그룹의 접근성 이름과 선택 시장 aria-live/atomic 설명을 명시.
- 기존 거래 계산, authenticated record 계약, 실제 데이터/RPC/결제/지갑 및 미지원 옵션의 비활성 상태 불변.

### 실행 검증과 한계

- frontend/order-interactions.test.mjs 실제 main.js 이벤트 기반 신규 2건: 같은 숫자의 출처 변경/기존 Review 무효화/후속 재검토/키보드 Escape 포커스 복귀, 그리고 차트/Book·Trades 키보드 탐색과 주문 검토 독립성·시장 변경 무효화 및 MOCK 호가 동기화.
- frontend/ux-hl-06-f2a-offline-audit.test.mjs 신규 4건: 시장/차트 ARIA, 호가·모바일 탭/무JS 복구, 계정 5탭/검증 없는 표 숨김, 출처·CSP·비활성 거래 게이트 정적 교차 검증. 기존 가격 레이블/출처 정적 테스트는 변경된 정확한 계약에 맞춰 갱신.
- 프런트 전체 **261/261 PASS** (기준 255/255 + 신규 6). JS 문법, HTML 파싱, 중복 DOM ID/CSP, Git 변경 검사는 최종 커밋 전에 다시 확인.
- 일반 사용자 chromiumSandbox:true에서 보존된 Headless Shell 실행 재시도: Chromium sandboxing failed. --no-sandbox/chromiumSandbox:false 미사용. 실제 브라우저 화면·터치·스크린리더·폭 1536/1280/768/390 및 200% 확대 인수 미완료.
- **완료 판정은 F2a 오프라인 접근성/동작 감사에 한정**; A3, C2b, F1, F2b 브라우저 인수/최종 F3 확정은 미완료.

### 후속

- F3a: 현재 통과한 오프라인 근거와 브라우저 인수 미완료 항목을 매트릭스로 대조하고, 릴리스 준비 상태/누락된 사용성 인수 증거를 문서로 고정. 실제 브라우저 인수를 통과했다고 표시하지 않음.
- B2 실 OHLCV/거래량 및 E2 Balances는 신뢰 출처 미확보로 미구현 유지.
