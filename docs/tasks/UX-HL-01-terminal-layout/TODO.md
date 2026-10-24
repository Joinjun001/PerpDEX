# UX-HL-01 TODO

- [x] A1 Git/PROJECT_STATE/ROADMAP/Hyperliquid UX 문서/프런트 코드 검토, clean 확인, 기존 UX TASK 폴더 부재 확인
- [x] A2 차트·호가·최근 체결·주문 티켓 독립 3열 및 태블릿·모바일 CSS
- [x] A3 시장 샘플 reference/change 전환과 Mark/Oracle/Funding/OI 미연결 상태 바
- [x] A4 DEMO 주문·차트 회귀 및 HTML/CSS/보안 정적 테스트
- [x] B1 Positions/Open Orders/Order History/Trade History/Funding History 하단 ARIA 탭, 방향키/Home/End/클릭, 안전한 빈 계정 패널
- [x] B2-A 계정 미연결·정상 빈 데이터·로딩·오류를 구분하는 순수 모델 및 단위 테스트
- [x] B2-B1 계정 chain/source/tab/request/revision·row 필드·중복·uint256/잔량 검사 및 로컬 순수 비동기 상태 coordinator
- [x] B2-B2-A 계정 테이블 분리 renderer, 기본 차단/disconnected·loading·empty·error 상태, 고정 컬럼과 textContent, stale/경합/테이블 정리 오프라인 QA
- [x] B2-B2-B1 백엔드 공개 주문 read 라우트/계정 권한 부재 조사, 오프라인 verifySession/query 콜백 주입 흐름·세션 버전/재인증/중복·stale 요청/취소 신호 QA
- [ ] B2-B2-B2 계정 인증/접근 제어가 확인된 전용 서버 read endpoint 준비 시 브라우저 UI/계정 연동 E2E; 미준비 시 C1 QA 우선
- [ ] C1 브라우저 wide/tablet/mobile 실제 렌더링·키보드 시각 인수(브라우저 가용 시)
