# UX-HL-02 QA

## 2026-10-25 UX-HL-02-A 로컬 테스트

- 시작 main HEAD 38f92a4, clean, origin/main 대비 ahead 6. PROJECT_STATE/ROADMAP/Hyperliquid UX와 UX-HL-01 전체 문서 및 프런트 코드 확인.
- backend/src/http/create-order-http.ts와 기존 백엔드 계정 read gap 문서를 다시 점검: 계정 소유권을 인증하고 포지션/주문/체결을 반환하는 전용 HTTP API는 없음. 실제 계정/지갑 연결은 보류.
- frontend/order-ticket.test.mjs 신규 9/9 PASS: 모의 MARKET 계산 회귀, LIMIT 가격 적용, Long/Short 가격 정합성, 허용/거부 입력, 수량/레버리지/마켓 거부, HTML ARIA/숨김 필드, UI 이벤트·CSP·서버 미전송 제약, 소개/계정 영역 보존.
- node --test frontend/*.test.mjs: 총 64/64 PASS (이전 55건 + 신규 9건). 부동소수점 UI 참고 계산 허용오차 정정 후 재검증.
- node --check frontend/main.js 및 frontend/preview-model.mjs PASS. npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser 검사: index.html 고유 ID 4개, trade.html 고유 ID 53개, 중첩 태그·ID 중복 없음. 코드 검사에서 frontend/main.js 및 preview-model.mjs 외부 네트워크·실거래 API 호출 없음, Git diff --check PASS.
- 브라우저 실렌더링/포커스 수동 검사, 백엔드 거래·지갑·DB·Sepolia/가격 오라클/정산/실제 체결 검증은 **미실행**. 주문 가격·수량은 JavaScript UI 모의 계산이며 안전한 실거래 경제/수량 정책을 대체하지 않는다.
