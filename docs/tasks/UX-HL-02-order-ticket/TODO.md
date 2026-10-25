# UX-HL-02 TODO

- [x] A0 Git status/최근 커밋, PROJECT_STATE/ROADMAP/Hyperliquid 참고 문서/기존 UX-HL-01 문서·프런트엔드 코드를 점검하고 실제 계정 인증 API 부재 재확인
- [x] A1 Market/Limit 전환 버튼, aria-pressed/disabled Limit 입력·오류 메시지·반응형 CSS
- [x] A2 LIMIT 가격 형식/범위, 수량/레버리지/시장 검증과 모드별 mock 예상 명목가치·참고 증거금 순수 계산
- [x] A3 시장·유형·가격·수량·레버리지 변경 시 preview 갱신과 과거 결과 숨김, 실제 서명/주문 전송 미활성화
- [x] A4 프런트엔드 테스트와 HTML/JS/TS 빌드 검증
- [x] B1-1 9항목 모의 주문 검토 패널과 textContent 안전 DOM 렌더러
- [x] B1-2 닫기/Escape·키보드 포커스 복귀, quantity/Limit Price 오류 접근성 개선
- [x] B1-3 신규 8건 및 전체 72건 회귀, JS/TS/HTML/CSP 검증
- [x] B2-A1 기존 browser binary/Playwright/Puppeteer 실행 가능 여부 점검: 미가용, 설치·우회 없음
- [x] B2-A2 실제 main.js 이벤트 통합 테스트: Market/Limit·Long/Short·시장·가격·수량·레버리지/preview·닫기/Escape/stale 결과
- [x] B2-A3 invalid submit을 quantity/Limit 필드로 포커스 보내고 결과 생성 차단
- [ ] B2-B 실제 브라우저·모바일·스크린리더/키보드와 viewport 레이아웃 인수 (환경 미가용)
- [ ] C1 환경이 갖춰졌을 때 wide/tablet/mobile 브라우저 실제 상호작용 검증 및 시각 인수

- [x] C1 validPreviewQuantity의 암묵적인 Number() 형변환으로 비숫자형 수량이 통과하는 결함 재현
- [x] C1 수량을 primitive number 또는 문법상 유효한 decimal/scientific 문자열로 한정하고 기존 0.0001~100 범위 유지
- [x] C1 공통 모델 검증 2건, Market/Limit 계약 1건, 실제 main.js 이벤트 통합 1건 추가
- [x] C1 프런트 전체 116/116, JS syntax·backend TypeScript build·HTML 구조·CSP·Git diff 검사
- [ ] C2 기존 브라우저 환경 확보 시 실제 숫자 input 동작/키보드·모바일 검증 (미실행)

- [x] D1 Number(leverage)의 bool/array/0x 및 잘못된 문자열 암묵 형변환 결함을 수정 전 테스트로 재현
- [x] D1 validPreviewLeverage 1~10 정규 정수/문자열 검증과 모델/시장형 양쪽 거부
- [x] D1 화면에서는 원본 leverage string으로 validate, 오류 ARIA·버튼 disabled·키보드 submit 포커스 연결
- [x] D1 새 검증 5건 포함 프런트 121/121, JS 문법·TypeScript build·HTML/ID/CSP·git diff 검사
- [ ] D2 실제 브라우저에서 native range slider·키보드/터치/스크린리더 입력 인수 (환경 미가용)

- [x] E1 동일 시장 클릭의 Limit 가격·미리보기 초기화 버그를 실제 main.js 이벤트 기반 테스트 2건으로 수정 전 재현
- [x] E1 같은 시장 선택에 한해 updateMarket 호출을 건너뛰고 입력 중 초안/에러 상태·검토 결과 보존
- [x] E1 BTC→ETH 같은 실제 시장 변경 시 MOCK 참조 가격 갱신·기존 검토 숨김 회귀 유지
- [x] E1 전체 프런트 127/127 PASS, JS 문법/TypeScript 빌드/HTML 고유 ID·CSP/Git diff 검사
- [ ] E2 실제 브라우저·모바일·키보드로 같은 시장 반복 클릭/초안 유지 시각 인수 (환경 미가용)

- [x] F1 최소 허용 수량/Limit Price에서 양수 명목가치·참고 증거금이 $0.00으로 나오는 오류를 수정 전 실행형/리뷰 테스트로 재현
- [x] F1 0보다 크고 0.01 USD 미만인 표시 전용 양수 금액을 <$0.01로 통일, 산술 결과 불변
- [x] F1 Market/Limit 주문 티켓과 9항목 읽기 전용 검토에 동일 표기 적용
- [x] F1 신규 3건, 프런트 전체 130/130, JS 문법·TypeScript build·HTML ID/CSP·Git diff 검사
- [ ] F2 실제 브라우저·모바일·스크린리더 금액 대체 표현 인수 (환경 미가용)

- [x] G1 동일 주문 방향 및 주문 유형 재클릭이 기존 모의 검토 결과를 숨기는 문제를 수정 전 이벤트 테스트 2건으로 재현
- [x] G1 BUY/SELL과 MARKET/LIMIT 버튼에 선택이 달라진 경우에만 갱신/검토 무효화 처리
- [x] G1 정상 검토 내용·Limit 입력 오류 상태 보존과 실제 방향·유형 변경의 결과 무효화 회귀 검증
- [x] G1 프런트 전체 134/134, JS 문법/TypeScript build/HTML 구조·ID/CSP/git diff 검증
- [ ] G2 실제 브라우저에서 선택 버튼 재클릭/키보드·모바일/스크린리더 접근성 인수 (도구 미가용)

- [x] H1 현재 값과 같은 data-qty 클릭에도 기존 읽기 전용 검토가 닫히는 오류를 수정 전 실제 DOM 이벤트 테스트 2건 실패로 재현
- [x] H1 같은 빠른 수량 재클릭은 상태 변경을 생략하고, 다른 수량 선택은 기존 재계산 및 검토 무효화 유지
- [x] H1 정상 검토 결과 및 다른 빠른 수량 간 변경 동작 실행형 회귀 2건 추가
- [x] H1 프런트 전체 136/136 PASS, JS syntax·TS build·HTML 구조/ID/CSP/git diff 검증
- [ ] H2 실 브라우저·모바일/키보드/스크린리더에서 빠른 수량 버튼 재선택 동작 인수 (환경 미가용)

- [x] I1 네 빠른 수량 버튼에서 aria-pressed 미선언 및 직접 수량 변경 시 상태가 노출되지 않는 결함을 수정 전 테스트 2건 FAIL로 확인
- [x] I1 초기 HTML의 수량 0.05만 aria-pressed=true, 다른 세 수량은 false로 명시
- [x] I1 main.js renderTicket에서 CSS active와 aria-pressed를 동일 조건으로 갱신하고 수량 직접 입력/프리셋 클릭/일치하는 프리셋 없는 경우 검증
- [x] I1 전체 프런트 138/138, JS syntax·TypeScript build·HTML 구조/고유 ID/CSP 및 git diff 검사
- [ ] I2 실제 브라우저/키보드·스크린리더에서 선택 수량의 상태 읽기 및 모바일 배치 인수 (환경 미가용)

- [x] J1 정상 0.050 vs 프리셋 0.05의 재선택이 입력 텍스트 및 완료 검토를 불필요하게 초기화하는 결함 수정 전 실제 main.js 테스트 FAIL
- [x] J1 validPreviewQuantity 기반 숫자 동치 비교로 동일 수량 검토 보존, 다른 수량만 검토 무효화
- [x] J1 0.050, 5e-2, 0.0100 및 일치하지 않는 0.07/부적합 입력의 aria-pressed·CSS active 상태 확인
- [x] J1 프런트 전체 154/154 PASS, 모든 JS syntax/TypeScript build/HTML 고유 ID·태그 구조/CSP/git diff 검사
- [ ] J2 실제 브라우저/모바일·키보드/스크린리더에서 수량 등가 표현·재선택·미리보기 유지 인수 (Chromium 샌드박스 권한 미가용)

- [x] K1 0.05→0.050 직접 입력처럼 수량 숫자는 그대로인데 검토가 닫히는 결함을 실제 main.js 회귀 2건 수정 전 FAIL로 재현
- [x] K1 성공한 DEMO 검토 수량을 기억하고 유효한 수치 동치 입력에서만 기존 검토 DOM 유지
- [x] K1 실제 수량 변경·비정상 입력과 한 번 숨겨진 검토를 원래 수량으로 복귀시켜도 다시 보여주지 않는 차단 확인
- [x] K1 Market/Limit 경로, 빠른 수량 프리셋/ARIA, MOCK 계정·Reduce Only 및 기존 입력 검증 모두 유지
- [x] K1 프런트 전체 160/160·JS syntax·TypeScript 빌드·HTML 고유 ID·구조/CSP/git diff 검사
- [ ] K2 실제 Chromium 모바일·키보드/스크린리더에서 표기만 바꾸는 입력과 검토 유지·무효화 동작 확인 (샌드박스 지원 환경 필요)

- [x] L1 동일한 Limit Price 숫자 60000.50→60000.5 입력이 DEMO 검토를 불필요하게 숨기는 문제를 실제 main.js 이벤트 회귀 신규 2건 수정 전 FAIL로 재현
- [x] L1 성공한 Limit 검토의 가격을 저장하고 유효한 수치 동치·가시적 리뷰일 때만 기존 리뷰 DOM 보존
- [x] L1 가격 변경/부적합한 가격 입력은 결과 무효화하며 원래 가격 복귀 시 오래된 결과를 다시 보이지 않도록 검증
- [x] L1 Market/Limit·수량/레버리지·MOCK 입력/리뷰 계산/실주문 차단 등 기존 기능 회귀 유지
- [x] L1 프런트 전체 162/162, 전체 JS 문법·TypeScript build·HTML 구조·고유 ID/CSP/git diff 검사
- [ ] L2 실제 샌드박스 Chromium의 모바일·키보드/스크린리더에서 Limit Price 동일값 편집/리뷰 유지·무효화 인수

- [x] M1 Short 선택 뒤 버튼 화살표가 ↗로 남는 결함을 실제 main.js 이벤트 테스트 신규 2건 수정 전 FAIL로 확인
- [x] M1 BUY/SELL 방향에 따라 DEMO 미리보기 버튼 화살표 ↗/↘ 갱신
- [x] M1 Market/Limit 전환, 방향 재선택, 기존 aria-pressed·Long/Short 텍스트와 미리보기 DEMO-only 동작 유지
- [x] M1 전체 프런트 164/164, JS syntax/TypeScript build/HTML 구조·고유 ID/CSP/git diff 검증
- [ ] M2 안전한 실제 브라우저에서 화살표 표시·모바일·키보드/스크린리더 인수 (Chromium 샌드박스 허용 환경 의존)

- [x] N1 유효한 레버리지 3×에서 동일한 input 이벤트가 발생해 DEMO 검토를 불필요하게 숨기는 결함을 실제 main.js 신규 이벤트 회귀 2건 수정 전 FAIL로 재현
- [x] N1 성공한 검토의 레버리지 숫자값 저장 및 유효한 동일 값 이벤트에서 검토 DOM 보존
- [x] N1 Market/Limit 모두 실제 변경, 부적합 입력, 결과 숨김 후 이전값 복구를 검토 무효화로 유지
- [x] N1 전체 프런트 168/168·JS syntax·TypeScript build·HTML 구조/고유 ID/CSP/git diff 검사
- [ ] N2 샌드박스 Chromium 실제 모바일/키보드/스크린리더에서 동일값 범위 입력과 리뷰 상태의 실제 인수

- [x] O1 거래 페이지 레버리지 1×·3×·5×·10×의 동일 간격 레이아웃과 1~10 네이티브 슬라이더 단계 위치 불일치 확인
- [x] O1 CSS 눈금 위치 정렬 회귀 테스트를 변경 전 FAIL 확인, 1~10 범위·눈금 텍스트 검증 테스트 추가
- [x] O1 거래 CSS에서 3× 22.22%, 5× 44.44%로 정렬·양 끝 정렬, 기존 leverage 입력·DEMO 계산/리뷰 유지
- [x] O1 전체 프런트 188/188, JS 문법·TypeScript 빌드·HTML 구조/CSP/Git diff 검사
- [ ] O2 실제 안전한 Chromium 모바일/데스크톱에서 눈금·thumb 위치 및 키보드/스크린리더 동작 시각 인수
