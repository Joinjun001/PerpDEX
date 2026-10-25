# UX-HL-02 결과

## 2026-10-25 UX-HL-02-A — 로컬 완료

- frontend/trade.html: 기존 읽기 전용 Market 표기를 Market/Limit 선택 버튼으로 전환, 조건부 Limit Price 필드/유효성 안내 및 모의 가격 타입 라벨.
- frontend/preview-model.mjs: 기존 previewEstimate 호환 유지하면서 validPreviewLimitPrice/previewOrderEstimate 추가. Market은 mock reference 가격, Limit은 사용자 입력 가격만을 견적에 사용하며 모든 반환값은 simulated/orderExecutable=false/executionGuaranteed=false.
- frontend/main.js: 유형별 버튼 상태/aria-pressed·입력 비활성화/유효성 표시·가격·명목가치·참고 증거금 갱신, market switch 시 Limit Price를 해당 mock 값으로 재설정. Long/Short와 기존 수량·레버리지 데모 유지. 입력 변경 시 이전 preview 결과 숨김.
- frontend/trade.css: 좁은 주문 패널 내 Market/Limit 전환 스타일과 키보드 포커스·모바일·오류·hidden 상태.
- frontend/order-ticket.test.mjs: 신규 9건. 프런트 전체 64/64 PASS, JS 문법·backend TS 빌드·HTML 구조/CSP/파일 Git 검사 PASS.
- 로그인/서버·wallet·실자금·Sepolia 트랜잭션·실시간 시장 데이터·체결/청산·push/배포는 실행하지 않음. 브라우저 화면 수동 인수는 미실행.
- 다음 UX-HL-02-B1: preview 확인 패널/오류 UX와 키보드·사용자 동작 시나리오 강화. UX-HL-01-B2-B2-B2는 서버 계정 인증 API가 실제 준비되기 전까지 보류.

## 2026-10-25 UX-HL-02-B1 — 로컬 완료

- frontend/order-review.mjs: previewOrderEstimate 기반 9개 고정 항목의 읽기 전용 createDemoOrderReview와 안전한 DOM renderDemoOrderReview. 서버·지갑·체결/서명 0건 및 미계산 정책 안내.
- frontend/main.js: 이벤트 preventDefault 후 리뷰 렌더링/초점 이동, 닫기 또는 Escape로 결과 숨김+preview 버튼 복귀. 입력·마켓·유형·방향 변경 시 오래된 리뷰 숨김. invalid quantity ARIA 검증.
- frontend/trade.html 및 frontend/trade.css: 결과 status/aria-label/tabindex, 모바일 항목별 읽기/포커스 스타일, quantity role alert와 Limit 설명/오류 연계.
- frontend/order-review.test.mjs 신규 8건, 기존 정적 회귀 2곳 검사 위치 조정. 프런트 전체 72/72 PASS, JS 문법·백엔드 TS build·HTML 구조·CSP 및 격리 검사 PASS.
- 브라우저 시각·실보조공학 인수는 미실행. 실제 계정 API/지갑/거래/온체인 및 push·배포 없음.
- 다음 UX-HL-02-B2: 실제 브라우저/모바일/키보드 상호작용 QA 또는 가능한 독립적 접근성/통합 QA.

## 2026-10-25 UX-HL-02-B2-A — 로컬 이벤트 통합 완료

- 신규 frontend/order-interactions.test.mjs: 실제 main.js import·모의 DOM으로 7개 통합 이벤트 시나리오 실행. 기존 단위/정적 테스트와 별도로 버튼 클릭·입력·폼 submit·Escape·오래된 리뷰 처리 확인.
- frontend/main.js: 유효하지 않은 quantity 또는 Limit Price가 있는 form submit 시 결과를 보이지 않게 하고 오류 필드에 focus. 정상 미리보기 흐름은 기존 유지.
- 프런트 79/79 PASS, JS/TypeScript 빌드 PASS. 실제 browser/viewport/스크린리더는 미실행.
- 다음 UX-HL-02-B2-B: 지원 브라우저 환경 마련 시 실제 데스크톱·태블릿·모바일/키보드/접근성 인수. 브라우저가 없으면 독립 UX TASK로 분리하며 현재 통합 테스트를 실제 브라우저 완료로 간주하지 않음.

## 2026-10-25 UX-HL-02-C1 — 로컬 구현 완료

- frontend/preview-model.mjs: 기존 Number(value) 무조건 호출로 true/[1]/0x1을 수량으로 수락하던 모델 결함 수정. 유효한 string decimal/exponent 또는 number primitive, 0.0001~100만 허용.
- frontend/preview-model.test.mjs: 엄격한 비숫자 형식 거부와 숫자/십진수/1e-4 형식 호환 2개 회귀 추가.
- frontend/order-ticket.test.mjs: Market·Limit 양쪽의 잘못된 수량 형변환 경계 1개 회귀 추가.
- frontend/order-interactions.test.mjs: 실제 main.js에서 비정상 숫자 문자열은 aria-invalid=true, 오류 표시/미리보기 비활성화/submit 차단 및 오류 필드 focus, 정상 지수 수량은 미리보기 표시를 확인하는 실행형 1건.
- 신규 4건 포함 프런트 전체 116/116 PASS, JS syntax/TypeScript build/HTML 구조·CSP/Git diff PASS. 서버/지갑/온체인·API 연결 및 원격 push/배포 없음.
- 다음: 실제 브라우저 가용 시 UX-HL-02-C2 및 UX-HL-02-B2-B, 이외엔 다른 코드 결함을 발견할 때만 독립 후속 TASK 선정.

## 2026-10-25 UX-HL-02-D1 — 로컬 수정 완료

- frontend/preview-model.mjs: validPreviewLeverage 추가, 원본 leverage를 형식 검증한 뒤 Number 적용. 정상 1..10 기본 slider 문자열/숫자만 수락하고 암묵 형변환 거부.
- frontend/main.js: 원본 leverageInput 전달, 비정상 UI 값의 aria-invalid/오류·출력/참고 요약/미리보기 차단 및 submit 입력 focus. 서버/지갑 이벤트 없음.
- frontend/trade.html: leverage-error role alert/aria-describedby 연결. 기존 HTML 구조·주문 미리보기·MOCK 구분 유지.
- frontend/preview-model.test.mjs, order-ticket.test.mjs, order-interactions.test.mjs: 신규 5건으로 model/Market+Limit/실제 main.js 실행형 회귀 보완.
- frontend 전체 121/121 PASS, JS syntax·backend TypeScript build·HTML ID/중첩·CSP·git diff PASS.
- 다음 UX-HL-02-D2: 실제 브라우저에서 range input과 오류 안내/키보드/모바일 접근성 인수. 부재 시 실제 코드에서 재현된 결함이 있을 때만 별도 작은 TASK 진행. 실제 거래·API/지갑·push/배포 없음.

## 2026-10-25 UX-HL-02-E1 — 로컬 완료

- frontend/main.js: 이미 선택된 마켓 버튼 재클릭 때 불필요한 updateMarket을 건너뛰도록 해 사용자가 입력한 Limit Price, 오류/수량/레버리지 상태, 읽기 전용 검토 결과를 보존한다. 실제 마켓 변경 시 MOCK 가격 초기화와 기존 결과 숨김 동작 유지.
- frontend/order-interactions.test.mjs: 정상/비정상 Limit 초안 반복 클릭의 수정 전 실패 2건 및 수정 후 통합 회귀. 프런트 전체 127/127 PASS.
- JS syntax·backend TypeScript build·HTML 구조/ID·CSP/Git diff 검증 PASS. 계정/지갑·실거래/온체인·백엔드/API 연결 없음.
- 다음 UX-HL-02-E2: 실제 브라우저가 준비된 경우 동일 시장 클릭 초안 보존·키보드·모바일 인수. 준비되지 않으면 중복 없는 실제 결함이 확인된 경우에만 새 작업을 시작한다.

## 2026-10-25 UX-HL-02-F1 — 로컬 완료

- frontend/preview-model.mjs: 양수 1센트 미만의 MOCK USD 금액이 0으로 오해되지 않도록 <$0.01를 반환하는 공통 표시 함수를 추가. 산술 값/주문 실행 게이트 불변.
- frontend/main.js: 모의 주문 패널의 명목가치·참고 증거금 표시 개선. 사용자 Limit Price/기준 시세는 원래 포맷 그대로.
- frontend/order-review.mjs: 읽기 전용 9항목 검토의 동일 두 금액을 같은 표시 정책으로 변환.
- frontend/preview-model.test.mjs, order-review.test.mjs, order-interactions.test.mjs: 소액 금액과 MARKET/LIMIT/화면 일치 검증 3건, 전체 130/130 PASS. JS syntax/TS build/HTML/CSP/diff PASS.
- 브라우저·모바일·스크린리더 검증 UX-HL-02-F2 미실행; 서버/지갑/온체인·실주문·운영 DB/푸시/배포 미연결·미실행.

## 2026-10-25 UX-HL-02-G1 — 로컬 수정 완료

- frontend/main.js: 주문 방향 BUY/SELL과 주문 유형 MARKET/LIMIT 버튼의 실제 상태 변경에만 화면 갱신·검토 결과 무효화를 수행. 동일 선택 재클릭은 기존 초안·검증 오류·9항목 읽기 전용 검토 결과를 보존한다.
- frontend/order-interactions.test.mjs: 실제 main.js 클릭 이벤트 통합 회귀 2건. 수정 전 FAIL 재현 및 수정 후 프런트 전체 134/134 PASS.
- JavaScript 문법/백엔드 TypeScript 빌드/HTML 구조·CSP/Git diff 검사 PASS. 실제 거래·wallet/API/온체인·운영 DB와 연결하지 않고 원격 push·배포 없음.
- 다음 UX-HL-02-G2: 실제 브라우저/키보드·모바일/스크린리더에서 버튼 재선택 상태 인수. 실행 환경 부재 시 다른 명확히 재현되는 독립 결함만 검토.

## 2026-10-25 UX-HL-02-H1 — 로컬 수정 완료

- frontend/main.js: 빠른 수량 버튼에서 현재 값과 정확히 같은 data-qty 선택은 입력/검토 DOM을 유지하고, 실제 다른 수량 선택만 기존 renderTicket()과 검토 결과 무효화를 수행.
- frontend/order-interactions.test.mjs: 수정 전 실패 재현 및 수정 후 검증 2건 추가. 프런트 전체 136/136 PASS, JS syntax·TypeScript build·HTML/CSP/git diff PASS.
- Market/Limit·Long/Short 주문 DEMO, 기존 수량·레버리지/Limit 검증, MOCK 시세·차트/호가·계정 미연결 상태 유지. 실거래·지갑/API/온체인·운영 DB·원격 push/배포 없음.
- 다음 UX-HL-02-H2: 브라우저/스크린리더가 가용해질 때 빠른 수량 재선택과 포커스 인수. 준비 전에는 독립적으로 재현한 실제 결함이 있을 때만 추가 TASK를 시작한다.

## 2026-10-25 UX-HL-02-I1 — 로컬 구현 완료

- frontend/trade.html: 빠른 수량 0.01/0.05/0.1/0.25의 초기 aria-pressed 속성을 명시, 선택된 0.05만 true.
- frontend/main.js: renderTicket에서 active CSS와 aria-pressed를 동일한 현재 quantity 조건으로 동기화. 수동 입력이 어떤 프리셋과도 일치하지 않을 때 네 버튼 전부 false.
- frontend/order-ticket.test.mjs와 frontend/order-interactions.test.mjs: 정적/실제 이벤트 회귀 2건. 수정 전 FAIL 재현 후 전체 프런트 138/138 PASS, JS/TS/HTML/CSP/Git 검사 PASS.
- UX-HL-02-H1의 같은 빠른 수량 재클릭 검토 보존과 변경 시 검토 무효화는 기존 기능을 유지한다.
- 실제 브라우저·스크린리더 인수 UX-HL-02-I2는 미완료. 지갑/API/실자금/온체인·운영 DB·push/배포 미실행.

## 2026-10-25 UX-HL-02-J1 — 로컬 구현 완료

- frontend/main.js: 유효한 수량과 빠른 수량 프리셋을 수치적으로 비교하는 공통 함수 추가. 입력이 0.050이나 5e-2처럼 유효한 동치 표현이면 기존 모의 검토 유지 및 CSS active/aria-pressed 선택 일치. 다른 실제 수량은 기존처럼 검토 무효화. 잘못된 입력을 수치 형변환으로 선택 처리하지 않음.
- frontend/order-interactions.test.mjs: 실제 main.js DOM 이벤트에서 검토 보존과 서로 다른 수량 전환, 수치 동치/부적합 입력의 ARIA·CSS 일치 신규 2건 (수정 전 2/2 FAIL).
- 전체 프런트 154/154 PASS, JS syntax/TypeScript 빌드/HTML 구조·CSP/git diff PASS.
- 실제 브라우저 UX-HL-02-J2 인수 미완료. DEMO/계정 미연결/백엔드 현재 M5 상태 및 실거래·push·배포 금지 불변.

## 2026-10-25 UX-HL-02-K1 — 로컬 완료

- frontend/main.js: 성공한 모의 주문 검토 수량을 저장해 직접 입력에서 0.05/0.050/5e-2 같은 유효 동치 표기만 바꾼 경우 리뷰를 유지. 실제 수량 변화, 비정상 값, 이미 숨겨진 리뷰는 기존처럼 차단.
- frontend/order-interactions.test.mjs: 실제 main.js 이벤트 2건 회귀 추가. 수정 전 실패 확인; 프리셋 버튼·모의 주문 리뷰/데이터·접근성 상태 보존.
- 전체 프런트 160/160 PASS, JS 문법·TypeScript 빌드·HTML 구조/CSP/Git diff PASS. 서버/API/지갑/실거래 코드 변경 없음.
- UX-HL-02-K2 실제 브라우저·스크린리더/모바일 인수는 샌드박스 지원 환경에서만 진행. 백엔드 M5~M9 상태·원격 Push/배포 제한 불변.

## 2026-10-25 UX-HL-02-L1 — Limit Price 표기 동치 검토 보존 로컬 완료

- frontend/main.js: 성공한 Limit DEMO 검토의 가격을 저장하고 유효한 가격 표현만 바뀐 경우 기존 검토 DOM을 유지. 실제 Limit 가격 변경·부적합 입력·닫힌 리뷰는 기존처럼 무효화.
- frontend/order-interactions.test.mjs: 실제 main.js 입력 이벤트로 가격 동치의 리뷰 보존/9항목 동일성·검증 불합격/가격 변경 후 자동 복구 금지를 검증하는 신규 2건(수정 전 FAIL).
- 전체 프런트 162/162 PASS, 모든 JS 문법/TypeScript build/HTML 구조·고유 ID/CSP/Git diff PASS.
- 실제 브라우저 UX-HL-02-L2 인수 미완료. 주문 금액/위험 정책 변경, 서버·지갑·실거래·DB/Push/배포 없음.

## 2026-10-25 UX-HL-02-M1 — 로컬 완료

- frontend/main.js: Long ↗, Short ↘ DEMO 버튼 시각 방향 동기화.
- frontend/order-interactions.test.mjs: 실제 main.js에서 BUY/SELL, Market/Limit 변경/재클릭과 aria-pressed·DEMO 미리보기 경계의 신규 2건 회귀(수정 전 FAIL).
- 전체 프런트 164/164 PASS, JS/TypeScript/HTML/CSP/git diff 검사 PASS. 서명·지갑·백엔드·실주문·운영 DB 연결 및 Push/배포 없음.
- UX-HL-02-M2 실브라우저/스크린리더 인수는 Chromium 샌드박스 지원 환경에서만 수행 가능.

## 2026-10-25 UX-HL-02-N1 — 로컬 완료

- frontend/main.js: 성공한 DEMO 리뷰의 레버리지 정수값을 보관하고 동일한 유효 레버리지 input 이벤트가 발생한 경우 기존 리뷰 유지. 실제 수치 변경/유효하지 않은 값 및 이미 무효화한 리뷰는 유지하지 않음.
- frontend/order-interactions.test.mjs: Market/Limit에서 동일 입력의 리뷰·금액 보존, 실제 값 변경/invalid 검증/리뷰 자동 재등장 차단 회귀 2건 추가(수정 전 FAIL).
- 전체 frontend 테스트 168/168 및 JS/TS/HTML/CSP/git diff 통과. 브라우저 N2는 안전 샌드박스 지원 환경에서 인수 진행.
- 서버·실주문·계정 인증·지갑/실체인·운영 DB/원격 push·배포에는 영향 없음.

## 2026-10-25 UX-HL-02-O1 — 레버리지 눈금 위치 로컬 개선

- frontend/trade.css: 실제 native 1~10 슬라이더의 3×·5× 값에 맞춰 눈금을 22.22%·44.44%에 배치; 양끝 1×·10× 유지. 실제 주문/가격/증거금 계산 변경 없음.
- frontend/leverage-ticks.test.mjs: range 1~10/1단계와 4개 표시 눈금이 변경되지 않았는지, 중간 눈금 위치가 임의 등간격이 아닌 실제 정수 단계 비율인지 회귀 검증. 수정 전 배치 검증 1건 FAIL.
- 전체 프런트 188/188 PASS, JS/TS/HTML/CSP/Git diff PASS. 실제 브라우저 O2 시각 및 스크린리더 인수 보류.
- 실계정/지갑·서명 주문, Sepolia·운영 DB·배포/원격 Push 금지 유지.

## 2026-10-25 UX-HL-02-P1 — 빠른 수량 단위 접근성 로컬 완료

- frontend/main.js: 4개 빠른 수량 버튼에 현재 BTC/ETH/SOL 자산 단위와 MOCK 설명이 포함된 aria-label 적용.
- frontend/trade.html: no-script 초기 BTC 네 버튼의 정적 접근성 이름 추가.
- frontend/order-interactions.test.mjs: BTC/ETH/SOL/BTC 시장 변경, 기본 HTML의 BTC 단위 및 미연결 CSP 신규 회귀 2건(수정 전 FAIL).
- 프런트 192/192, JS·TS·HTML/CSP/git diff PASS. 버튼 숫자·선택/DEMO 미리보기 로직 그대로.
- 실제 브라우저 P2 접근성 인수 보류. 지갑/실주문·실체인·DB·원격 push/배포 정책 유지.

## 2026-10-25 UX-HL-02-Q1 — 주문 미리보기의 스크립트 준비 상태 정합성 로컬 완료

- frontend/trade.html: JavaScript 초기화 전 Preview Long Order 버튼 disabled, noscript 안내를 추가해 미실행 시 빈 클릭을 방지. 기존 DEMO 고지 및 CSP form-action none 유지.
- frontend/order-interactions.test.mjs: 스크립트 없이 정적 submit이 활성 상태가 아님을 검증하는 fail-first 회귀와 모의 초기화 시 유효/무효/유효 입력의 활성 상태를 검증하는 테스트 추가.
- 프런트 전체 196/196 PASS 및 JS·TS·HTML/CSP/Git diff PASS. 실제 주문/지갑·계정 API·서버 전송 없음.
- 실제 브라우저 UX-HL-02-Q2 인수는 안전한 Chromium 실행 환경에 의존하며 미완료; M5~M9·실거래/실체인·운영 DB·push/배포 제한 보존.

## 2026-10-25 UX-HL-02-R1 — 입력 안내와 오류 접근성 연결 동기화 로컬 완료

- frontend/trade.html: quantity-help와 leverage-help를 상시 표시, limit-price-help 유지, 정상 상태의 세 입력에서 hidden 오류 연결을 제거. 모의 값 범위와 비실거래를 명시.
- frontend/main.js: 세 필드의 aria-describedby를 해당 input 검증 결과와 함께 갱신. 오류는 invalid 때만 연결하고 정상화 시 즉시 해제; aria-invalid/오류 표시/기존 미리보기 로직 불변.
- frontend/order-interactions.test.mjs: 정상→오류→복구에서 수량/Limit 가격/레버리지의 접근성 설명 ID 정확성 2건 신규 수정 전 FAIL. frontend/order-review.test.mjs, frontend/order-ticket.test.mjs는 이전 정적 오류 ID 검사를 새 계약에 맞게 갱신.
- 전체 프런트 198/198 PASS 및 JS/TS/HTML/CSP/Git diff PASS. 실제 스크린리더 인수는 UX-HL-02-R2 미완료.
- M5~M9·실계정/지갑·실주문·실체인·운영 DB·원격 push/배포 제한 유지.

## 2026-10-25 UX-HL-02-S1 — change-only 입력에서 오래된 주문 검토 방지 로컬 완료

- frontend/main.js: 수량·Limit 가격·레버리지의 기존 검토 동등성 판정·참고 금액/오류 갱신 함수에 input과 change 이벤트를 연결. 실제 수정 시 오래된 preview 제거, 기존 정상 상태 유지.
- frontend/order-interactions.test.mjs: change-only 수량/Limit/레버리지 값 변경·미리보기 제거, 참고 가격/금액, 무효 입력의 차단 및 복구 신규 2건. 두 신규 회귀는 수정 전 FAIL 확인.
- 전체 프런트 204/204 PASS, JS 문법/TS build/HTML/CSP/Git diff PASS. 실제 거래·지갑·API 요청 및 계정 데이터는 계속 미연결.
- S2 실제 Chromium/모바일 보조입력·스크린리더 인수 미완료. M5~M9 서버·DB·Sepolia·원격 push/배포 관련 기존 승인 게이트 유지.
