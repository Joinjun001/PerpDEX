# UX-HL-02 — Market/Limit 주문 입력 및 모의 확인 UX

## 범위

- 주요 참고: Hyperliquid의 주문 유형 전환과 사용자 입력 정보 계층. 원본 디자인이나 코드는 복제하지 않는다.
- UX-HL-02-A (이번 회차): 주문 패널 Market/Limit 모드 전환, 사용자 Limit Price 입력/오류 표시, 명목가치·참고 증거금의 타입별 미리보기, 시장 변경 시 해당 가상 기준가로 Limit Price 초기화.
- UX-HL-02-B1 (로컬 완료): Market/Limit 및 Long/Short 주문 미리보기를 9개 읽기 전용 검토 항목으로 표시. 닫기/Escape/포커스 복귀와 quantity/Limit 에러 ARIA 보강. 실제 주문 제출·지갑 서명 없음.
- UX-HL-02-B2-A (이번 회차 로컬 완료): browser가 없는 환경에서 실제 main.js를 import하여 MOCK DOM click/input/submit/keydown을 전달하는 통합 검증. invalid quantity/Limit form submit에서는 해당 입력으로 포커스 이동하며 모의 결과는 차단.
- UX-HL-02-B2-B (다음): 실제 브라우저·모바일·키보드·스크린리더/레이아웃 인수. 도구가 없으면 재검토하되 fake DOM 통합 테스트만으로 실제 렌더링 완료 주장 금지.
- UX-HL-02-C (후속): 브라우저 렌더링 도구가 안전하게 준비되면 데스크톱/모바일 실제 렌더링·입력 포커스 인수.

## UX-HL-02-A 인수

1. 기본 MARKET은 BTC/ETH/SOL 고정 mock 기준 가격을 사용. 선택 시장 변경 시 기준가/차트/호가/주문 계산 모두 일치.
2. LIMIT은 입력한 USD 가격(0.01~1,000,000,000; 소수 최대 2자리)로만 가상 명목가치와 참고 증거금을 계산. 형식이 틀리면 경고, 제출 미리보기 버튼 비활성화.
3. 양쪽 모드의 수량(0.0001~100), 레버리지(정수 1~10) 기존 검증 유지. Long/Short 유지.
4. 가격 필드는 LIMIT에서만 보이며 MARKET 상태는 disabled. 두 모드의 aria-pressed, aria-invalid, 접근성 레이블 유지.
5. 시장/유형/가격/수량/레버리지 변경 시 이전 주문 미리보기를 숨겨 stale 결과 유지 금지.
6. 견적은 DEMO SIMULATION ONLY. Limit 주문이 체결되는지, 수수료·펀딩·청산·오라클 상태를 계산하거나 예상하지 않는다. 실제 인증·API/DB·지갑·트랜잭션 미연결, CSP connect-src none 유지.
7. 정적/순수 함수 테스트, JS 문법, TS 빌드, HTML 태그/ID와 Git diff 검사 통과. 실제 브라우저·지갑/네트워크 QA는 미실행으로 표기.

## UX-HL-02-B1 인수 기준

1. 방향/유형/마켓/가격 출처/가격/수량/레버리지/가상 명목가치/참고 증거금 9항목을 고정 순서로 표시.
2. 서버 전송·지갑 서명·체결 0건 및 수수료·펀딩·청산·체결 가능성 미계산을 명시.
3. 모든 동적 값은 DOM textContent로 표시, HTML 주입·실제 주문 요청 금지.
4. 리뷰 출력 시 패널 포커스, 닫기 버튼·Escape로 원래 preview 버튼 포커스 복귀.
5. 잘못된 수량 aria-invalid 및 role alert; Limit Price help+error와 aria-describedby 연결.
6. 기존 Market/Limit·Long/Short·모의 계산·CSP/홈 페이지 및 5개 계정 탭 회귀 유지.

## B2-A 인수 기준

1. 이미 설치된 chromium/firefox/Playwright/Puppeteer를 확인하고 부재 시 설치나 승인 우회 없이 오프라인 QA로 전환.
2. 실제 main.js를 브라우저가 아닌 테스트 DOM에 import해 시장/Market·Limit/Long·Short/quantity/leverage/button 및 이벤트 동작 확인.
3. 잘못된 quantity/Limit의 aria-invalid·role alert·disabled button과 폼 submit 시 해당 입력 포커스 이동, 리뷰 미노출.
4. submit preventDefault 및 9항목 read-only 리뷰, 닫기·Escape/preview 버튼 포커스 복귀, 시장/방향/모드/수량/가격/레버리지 변경 시 stale 리뷰 미노출.
5. 기존 구조·계정 탭·CSP 및 DEMO/네트워크/실체인 격리 불변. 브라우저 viewport/픽셀·실보조공학은 별도 검증.

## UX-HL-02-C1 (2026-10-25) — 수량 형변환 검증 강화

- 발견 결함: 이전 validPreviewQuantity()는 모든 입력에 Number(value)를 적용해 true, [1], 0x1 같은 형식도 유효한 주문 수량으로 잘못 수락했다. 빈 공백만 거부하려던 조건은 양쪽 분기가 동일해 작동하지 않았다.
- 이번 수정은 공통 모델에 한정한다. 수량은 숫자 primitive 또는 문자로 된 정상 십진수/HTML number 입력의 지수 표기만 수락한다. 정수·소수·선행 . 또는 후행 .·e/E 지수(부호 가능)를 정상 처리한다.
- 0.0001~100 범위의 유한 수만 허용하며, hex/binary/octal, whitespace, 임의 객체, 배열, bool, 숫자형 wrapper, Infinity/NaN 및 비정상 문법은 거부한다.
- 정상 BTC/ETH/SOL Market/Limit preview, 기존 레버리지·가격 검증 및 static demo CSP/account read 경계는 유지한다. 이 검증은 체결 가능성·증거금 위험 엔진 정책을 의미하지 않는다.
- 반례가 수정 전 실제 실패하는지 재현하고 순수/통합 검증, JS syntax, TS build, HTML 태그·고유 ID, git diff 검사를 통과해야 완료.

## UX-HL-02-D1 (2026-10-25) — 레버리지 입력 형식 및 UI 경계 강화

- 발견 결함: previewEstimate()가 Number(leverage)로 먼저 변환하여 true, [3], 0x3, 3e0 등 네이티브 range 슬라이더가 내지 않는 형식을 정상 레버리지로 수락. main.js도 Number(raw value)를 모델로 전달해 원본 입력을 재검증할 수 없었다.
- 공통 미리보기 레버리지는 1~10의 정수 primitive 또는 기본 HTML range input과 동일한 정규 십진 문자열 1~10만 허용한다. 지수·16진·공백/선행 0·배열/불리언/임의 객체는 거부한다.
- main.js는 원본 leverage 문자열을 모델에 전달한다. 잘못된 형식에는 aria-invalid와 role alert, 요약 placeholder/미리보기 버튼 비활성화, 강제 폼 제출 시 입력으로 포커스를 이동한다.
- 브라우저 range slider는 통상 1~10을 반환하지만, 테스트·리팩터링·외부 상태 주입 시 모델/표시 경계를 보장한다. 이 변경은 실제 거래 레버리지 정책의 승인이나 백엔드 리스크 계산이 아니다.
- 기존 Market/Limit·Long/Short·차트/호가/모의 기록/5개 계정 ARIA 탭/미연결 API 및 CSP를 유지한다.

## UX-HL-02-E1 (2026-10-25) — 현재 시장 재선택의 주문 초안 손실 방지

- 재현된 결함: 현재 BTC인 상태에서 BTC 시장 버튼을 다시 누르면 실제 선택 시장이 바뀌지 않았는데 updateMarket()가 재실행되어 직접 입력한 Limit Price를 BTC 기본 MOCK 가격으로 덮고 읽기 전용 주문 검토 결과도 숨겼다.
- 클릭한 시장이 현재 view.market와 같다면 시장 전환 핸들러에서 즉시 종료하고, 현재 Limit 초안·수량·레버리지·검증 오류·미리보기 상태를 보존한다.
- BTC→ETH처럼 시장 ID가 실제로 달라질 때만 기존 updateMarket() 호출로 차트/호가/체결 샘플·기준가를 교체하고 오래된 검토 결과를 닫는다.
- MOCK 데이터 표기·Market/Limit·Long/Short·ARIA 5탭·모바일 호가/계정 탐색·CSP 및 API 미연결을 그대로 유지한다. 실제 주문 실행을 만들지 않는다.
- 실제 main.js 이벤트를 이용한 수정 전 실패 테스트와 수정 후 회귀, JS/TS/HTML/CSP/Git 검사로 검증한다.

## UX-HL-02-F1 (2026-10-25) — 양수 소액 금액 표시 정합성

- 결함: 유효한 Quantity=0.0001, Limit Price=0.01 USD, Leverage=10에서 명목가치 0.000001 USD와 참고 증거금 0.0000001 USD가 산출되지만 둘 다 $0.00으로 출력되어 0달러로 오인될 수 있었다.
- 실제 계산값·가격 검증 규칙을 변경하지 않는다. 표시에만 사용하는 공통 함수 formatDemoUsdAmount를 도입한다.
- 0보다 크고 0.01 USD 미만인 명목가치/참고 증거금은 <$0.01로 표시. 0과 0.01 이상은 기존 2자리 USD 표기. 비정상/음수/무한 입력은 거부한다.
- frontend/main.js 주문 입력 요약과 order-review.mjs 읽기 전용 검토 9항목에 동일 함수를 적용한다. 사용자 Limit Price, MOCK 참조 가격, previewOrderEstimate의 산술 값은 변경하지 않는다.
- 실제 정산·위험 엔진/수수료·펀딩·청산 정책 추가, 지갑/서버 주문 연결은 금지.

## UX-HL-02-G1 (2026-10-25) — 동일 주문 방향·유형 재선택 시 검토 결과 보존

- 실제 결함: 이미 BUY와 MARKET이 선택된 상태에서 동일한 Long/Buy 또는 Market 버튼을 누르더라도 main.js는 renderTicket()을 호출하고 order-result를 hidden으로 전환하였다. SELL/LIMIT도 동일했다. 주문 조건이 변하지 않았는데 검토 결과가 지워지는 상태 전환 오류다.
- 현재 선택한 BUY/SELL 또는 MARKET/LIMIT를 다시 누르면 이벤트 핸들러에서 종료하고, 기존 검토 결과 DOM·초안·입력 검증 상태를 유지한다.
- BUY→SELL 또는 MARKET→LIMIT처럼 실제 값이 변경된 경우에는 기존 동작(renderTicket과 검토 결과 무효화)을 유지한다.
- 데모 주문 실행·체결·지갑/백엔드 계정 API·실제 위험값을 생성하지 않는다. 기존 MOCK 차트/호가/계정 탭/모바일 및 CSP는 변경하지 않는다.
- 실제 main.js의 이벤트를 이용한 변경 전 실패 2건을 재현한 후 수정한다. 브라우저 픽셀/보조공학 인수는 별도 보류.

## UX-HL-02-H1 (2026-10-25) — 동일 빠른 수량 버튼 재선택 시 모의 검토 보존

- 발견 결함: 기존 빠른 수량 data-qty 버튼 이벤트는 이미 선택된 수량을 다시 선택해도 renderTicket() 및 order-result.hidden=true를 수행했다. 주문 수량 값이 변하지 않았는데 읽기 전용 검토 결과가 사라졌다.
- 현재 quantity input의 문자열과 클릭한 data-qty의 문자열이 동일하면 입력값이나 검토 결과를 변경하지 않는다. 실제로 새 수량을 선택한 경우에는 기존 검증·모의 계산 갱신 및 과거 검토 무효화를 유지한다.
- 빠른 수량 0.01/0.05/0.1/0.25만 처리하며 기존 수량 검증·직접 입력 이벤트·시장/방향/유형 선택 로직은 변경하지 않는다.
- 정적 DEMO/미연결 계정, MOCK 시세·호가·차트, CSP/실거래 차단을 보존하고 실제 브라우저 UX 인수는 별도 미완료로 둔다.

## UX-HL-02-I1 (2026-10-25) — 빠른 수량 선택 버튼의 보조공학 상태 동기화

- 확인 결함: 현재 빠른 수량 버튼은 시각적 active 클래스만 갱신하고 aria-pressed 상태를 표시하지 않았다. 키보드·스크린리더 사용자가 모의 주문 수량 버튼 그룹의 현재 선택값을 접근성 상태에서 알 수 없었다.
- 현재 quantity 문자열과 data-qty가 동일한 버튼만 aria-pressed=true로, 나머지는 false로 동기화한다. 일치하는 프리셋이 없을 때는 전부 false. CSS active와 동일 조건이다.
- JavaScript 실행 전 HTML에서도 네 버튼의 초기 상태를 일관되게 제공한다. 초기 quantity=0.05이므로 0.05만 true, 0.01/0.1/0.25는 false.
- 기존 주문 미리보기·수량 검증 및 빠른 수량 재클릭 시 검토 유지 UX-HL-02-H1을 변경하지 않는다. 네이티브 button 클릭/키보드 기본 동작, MOCK 데이터·지갑/API 미연결·CSP를 유지한다.
- 이 변경은 DOM 접근성 속성 수준의 검증이다. 실제 스크린리더·모바일 브라우저 인수는 별도 미완료이다.
