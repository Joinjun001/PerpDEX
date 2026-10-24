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
