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
