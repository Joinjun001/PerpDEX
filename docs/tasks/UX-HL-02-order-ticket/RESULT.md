# UX-HL-02 결과

## 2026-10-25 UX-HL-02-A — 로컬 완료

- frontend/trade.html: 기존 읽기 전용 Market 표기를 Market/Limit 선택 버튼으로 전환, 조건부 Limit Price 필드/유효성 안내 및 모의 가격 타입 라벨.
- frontend/preview-model.mjs: 기존 previewEstimate 호환 유지하면서 validPreviewLimitPrice/previewOrderEstimate 추가. Market은 mock reference 가격, Limit은 사용자 입력 가격만을 견적에 사용하며 모든 반환값은 simulated/orderExecutable=false/executionGuaranteed=false.
- frontend/main.js: 유형별 버튼 상태/aria-pressed·입력 비활성화/유효성 표시·가격·명목가치·참고 증거금 갱신, market switch 시 Limit Price를 해당 mock 값으로 재설정. Long/Short와 기존 수량·레버리지 데모 유지. 입력 변경 시 이전 preview 결과 숨김.
- frontend/trade.css: 좁은 주문 패널 내 Market/Limit 전환 스타일과 키보드 포커스·모바일·오류·hidden 상태.
- frontend/order-ticket.test.mjs: 신규 9건. 프런트 전체 64/64 PASS, JS 문법·backend TS 빌드·HTML 구조/CSP/파일 Git 검사 PASS.
- 로그인/서버·wallet·실자금·Sepolia 트랜잭션·실시간 시장 데이터·체결/청산·push/배포는 실행하지 않음. 브라우저 화면 수동 인수는 미실행.
- 다음 UX-HL-02-B1: preview 확인 패널/오류 UX와 키보드·사용자 동작 시나리오 강화. UX-HL-01-B2-B2-B2는 서버 계정 인증 API가 실제 준비되기 전까지 보류.
