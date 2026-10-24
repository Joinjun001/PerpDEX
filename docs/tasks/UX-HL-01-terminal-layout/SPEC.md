# UX-HL-01 — Hyperliquid 거래 터미널 정보 구조

- 주요 레퍼런스: docs/architecture/HYPERLIQUID-UX-REFERENCE.md
- 범위: frontend/trade.html, trade.css, 관련 데모 JavaScript와 테스트. 기존 서비스 소개, 백엔드 M5~M9, 컨트랙트는 변경하지 않는다.
- **UX-HL-01-A (이번 회차):** 데스크톱 차트 / 호가·체결 / 주문 티켓 3열 구현, 모바일·태블릿 반응형. 상단 선택 시장의 reference/sample change만 MOCK 값으로 갱신, 실제 Mark/Oracle/Funding/OI는 미연결로 표시.
- **UX-HL-01-B1 (이번 회차 로컬 완료):** Positions/Open Orders/Order History/Trade History/Funding History 독립 ARIA 탭. 표에 실제 계정 기록을 만들지 않고 빈 tbody와 미연결 안내 표시. 클릭, 방향키, Home/End 이동 및 roving tabIndex 지원.
- **UX-HL-01-B2 (다음):** 실제 조회 연결 전 계약, 지갑 미연결·정상 빈 응답·로딩·요청 오류 상태 결합. B1은 4종 상태 구분의 순수 모델만 구현, 실제 화면은 미연결만 사용.
- **UX-HL-01-C (후속):** 브라우저가 준비되면 wide/tablet/mobile 시각·접근성 인수.

## A 인수 기준

1. 차트·호가/Recent Trades·Long/Short 폼 3개 독립 컬럼.
2. <=1070px 태블릿: 차트+주문, 하단 호가/체결; <=760px 모바일: 차트→주문→호가/체결.
3. 샘플 reference/change는 시장 선택마다 갱신, Mark/Oracle/Funding/OI는 미연결 값으로 고정.
4. 기존 주문 DEMO 미리보기, mock chart/orderbook, CSP connect-src none 유지.
5. UI·CSS 테스트, HTML 태그 계층/ID, TS 빌드 PASS; 픽셀 단위 브라우저 시각 인수는 미실행 별도 표기.

## B1 인수 기준

1. 다섯 개 tab/tabpanel의 ARIA 관계와 단일 aria-selected=true, 활성 탭만 tabindex=0·나머지 패널 hidden.
2. 마우스 클릭·좌우 방향키 래핑·Home/End에서 활성화와 버튼 포커스 이동.
3. 포지션·주문·체결·펀딩 표의 column header만 정의하며 tbody는 실제 데이터 연동 전까지 비어 있음.
4. 화면 기본 상태는 계정 미연결. 정상 빈 응답과 오류/로딩은 독립 모델로 표현하되 API 없이 가짜 계정 정보/요청 실패를 보여주지 않음.
5. 모바일 탭과 테이블 가로 스크롤, 기존 차트·Long/Short 주문 데모·SIMULATION/CSP 유지.
