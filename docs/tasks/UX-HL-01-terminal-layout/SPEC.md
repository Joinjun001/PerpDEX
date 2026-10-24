# UX-HL-01 — Hyperliquid 거래 터미널 정보 구조

- 주요 레퍼런스: docs/architecture/HYPERLIQUID-UX-REFERENCE.md
- 범위: frontend/trade.html, trade.css, 관련 데모 JavaScript와 테스트. 기존 서비스 소개, 백엔드 M5~M9, 컨트랙트는 변경하지 않는다.
- **UX-HL-01-A (이번 회차):** 데스크톱 차트 / 호가·체결 / 주문 티켓 3열 구현, 모바일·태블릿 반응형. 상단 선택 시장의 reference/sample change만 MOCK 값으로 갱신, 실제 Mark/Oracle/Funding/OI는 미연결로 표시.
- **UX-HL-01-B (다음):** Positions/Open Orders/Order History/Trade History/Funding History 계정 하단 탭, 빈 상태·키보드·ARIA 처리.
- **UX-HL-01-C (후속):** 브라우저가 준비되면 wide/tablet/mobile 시각·접근성 인수.

## A 인수 기준

1. 차트·호가/Recent Trades·Long/Short 폼 3개 독립 컬럼.
2. <=1070px 태블릿: 차트+주문, 하단 호가/체결; <=760px 모바일: 차트→주문→호가/체결.
3. 샘플 reference/change는 시장 선택마다 갱신, Mark/Oracle/Funding/OI는 미연결 값으로 고정.
4. 기존 주문 DEMO 미리보기, mock chart/orderbook, CSP connect-src none 유지.
5. UI·CSS 테스트, HTML 태그 계층/ID, TS 빌드 PASS; 픽셀 단위 브라우저 시각 인수는 미실행 별도 표기.
