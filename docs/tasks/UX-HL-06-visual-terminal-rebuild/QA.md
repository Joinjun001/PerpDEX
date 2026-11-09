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
