# UX-HL-01 — Hyperliquid 거래 터미널 정보 구조

- 주요 레퍼런스: docs/architecture/HYPERLIQUID-UX-REFERENCE.md
- 범위: frontend/trade.html, trade.css, 관련 데모 JavaScript와 테스트. 기존 서비스 소개, 백엔드 M5~M9, 컨트랙트는 변경하지 않는다.
- **UX-HL-01-A (이번 회차):** 데스크톱 차트 / 호가·체결 / 주문 티켓 3열 구현, 모바일·태블릿 반응형. 상단 선택 시장의 reference/sample change만 MOCK 값으로 갱신, 실제 Mark/Oracle/Funding/OI는 미연결로 표시.
- **UX-HL-01-B1 (이번 회차 로컬 완료):** Positions/Open Orders/Order History/Trade History/Funding History 독립 ARIA 탭. 표에 실제 계정 기록을 만들지 않고 빈 tbody와 미연결 안내 표시. 클릭, 방향키, Home/End 이동 및 roving tabIndex 지원.
- **UX-HL-01-B2 (다음):** 실제 조회 연결 전 계약, 지갑 미연결·정상 빈 응답·로딩·요청 오류 상태 결합. B1은 4종 상태 구분의 순수 모델만 구현, 실제 화면은 미연결만 사용.
- **UX-HL-01-B2-B1 (이번 회차 로컬 완료):** Sepolia 계정·출처·탭·requestId·revision·행 원자 수량/중복·stale 요청을 검증하는 순수 조회 계약. 상세 ACCOUNT_QUERY_CONTRACT.md.
- **UX-HL-01-B2-B2 (다음):** 인증된 데이터 adapter와 UI 상태/표 렌더링 결합. 아직 지갑·API 미연결.
- **UX-HL-01-B2-B2-A (이번 회차 로컬 완료):** 연결되지 않은 실제 화면은 disconnected만 보이도록 유지하며, 분리된 계정 테이블 renderer가 검증된 coordinator 상태와 명시적인 외부 신뢰 adapter 조건이 있을 때만 안전한 textContent/허용 컬럼 기반 테이블을 표시하도록 준비. loading/empty/error/disconnect 시 이전 tbody 제거. 실제 출처 인증 수행 없음.
- **UX-HL-01-B2-B2-B (다음):** backend read API/지갑 서명·신뢰 출처·원장 확인에 대한 계약을 먼저 마련한 뒤 renderer의 외부 adapter 접속, 실 API 에러/재시도·계정 경합 통합 검증. 해당 환경이 없으면 안전한 독립 UI QA로 진행.
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

## B2-B1 인수 기준

1. Sepolia 계정/chainId/source/tab/requestId/revision 및 다섯 탭 row schema strict validation.
2. canonical uint256 원자 문자열, 주문 잔량 합계, 중복 id·타 계정·임의 필드/출처 변조 거부.
3. 동시 조회, disconnect/reconnect, 지갑·출처 변경 시 stale 요청의 응답·오류 화면 모델 반영 거부.
4. 정상 0행 empty, 정상 기록 ready, 오류 error, 미연결 begin 거부. 실제 서버 인증은 별도 선행 게이트.
5. 공개 UI·API·실제 지갑/백엔드·DB 기능 미변경.

## B2-B2-A 독립 렌더러 인수 기준

1. 기본 allowValidatedRecords=false. 미검증/임의 snapshot의 ready/계정 기록은 표시하지 않으며 disconnected와 빈 tbody가 기본.
2. 별도 오프라인 테스트에서 유효한 coordinator accept 결과를 주입한 경우, 5개 탭의 고정 컬럼만 DOM createElement/textContent로 렌더링, innerHTML 미사용. 미연결 실제 프로덕션 경로에는 이 주입을 연결하지 않음.
3. 실패·로딩·빈 응답·연결 해제·계정/요청 교체 시 tbody 선행 제거; old token 수락 불가 시 새 레코드로 갱신되지 않음.
4. 기록 금액은 원자 단위를 임의 decimals/통화로 바꾸지 않고 atomic로 명시, 백엔드 미제공 Mark/Price/Fee/시각 등은 대시(-) 처리.
5. 기존 5개 ARIA 탭/모바일 CSS, 주문 데모, 소개 페이지, CSP 유지. 신규 HTML 렌더링/경합 회귀·빌드 검증. 실제 API/지갑/실 브라우저 시험은 별도 인수.
