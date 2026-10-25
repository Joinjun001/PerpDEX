# UX-HL-03 — 계정 탭 모바일 탐색 개선

## UX-HL-03-A1 (2026-10-25)

목적: Positions / Open Orders / Order History / Trade History / Funding History ARIA 탭의 모바일 가로 스크롤에서 선택된 탭이 화면 밖에 남지 않도록 개선한다.

- 클릭 또는 ArrowLeft/ArrowRight/Home/End 선택 시 탭과 스크롤 컨테이너의 좌우 경계를 비교한다.
- 화면 밖인 경우 탭 스크롤 컨테이너의 scrollLeft만 필요한 만큼 조정한다. scrollIntoView 호출로 페이지 전체를 움직이지 않는다.
- 이미 표시되어 있거나 가로 넘침이 없는 데스크톱에서는 이동하지 않는다.
- 키보드 전환은 focus({preventScroll:true})로 활성 버튼에 포커스를 주고 이후 가로 위치를 계산한다.
- 기존 roving tabIndex/aria-selected/tabpanel hidden 및 Account API 미연결 상태를 유지한다.
- 기존 모의 주문/모바일 호가/홈·거래 분리, CSP, M5~M9는 변경하지 않는다.

## 인수 기준

1. 첫 탭 초기 가시성, 오른쪽 Funding History 클릭, Home/End 및 방향키 wrap 시 선택·ARIA·포커스·가시성 일치.
2. 왼쪽/오른쪽 일부가 가려진 탭에서 최소 스크롤; 오버플로 없는 데스크톱에서 scrollLeft 불변.
3. 무관한 키·잘못된 인덱스는 선택 상태를 변경하지 않고, 누락된 스크롤 컨테이너는 초기화 오류.
4. 실제 브라우저/스크린리더·터치 인수는 별도 미완료. 오프라인 geometry DOM 테스트를 실 브라우저 완료로 취급하지 않는다.

## UX-HL-03-B1 (2026-10-25) — 계정 테이블 가로 탐색 안내

- 이미 구현된 계정 탭 이동/ARIA 자동 가로 스크롤을 재구현하지 않는다. 계정 패널의 실제 테이블 오버플로에 한정한다.
- 760px 이하 모바일, 현재 선택된 tabpanel, 실제 표시되는 테이블, scrollWidth가 clientWidth보다 1px 초과라는 **네 조건이 동시에 충족될 때** 안내를 표시한다.
- 안내 문구는 사용자에게 좌우 스크롤과 키보드 좌우 방향키 사용법을 설명한다. 안내가 표시되는 동안 해당 scroll container만 tabindex=0 및 aria-describedby를 제공한다.
- 테이블 미표시/지갑 미연결, 데스크톱 breakpoint, 오버플로 없는 테이블 및 비활성 패널은 안내 hidden, tabIndex=-1, aria-describedby 제거로 제어한다.
- ResizeObserver/MutationObserver/viewport resize/media query change가 제공되면 상태 변경 시 재계산한다. 미가용 환경에서는 초기화와 탭 activation에서 재계산.
- 새로운 계정 데이터, wallet 연결, 서버/API fetch, testnet/real 거래는 추가하지 않는다. 현재 static demo의 5개 tbody는 비어 있다.
- 브라우저/모바일 실제 뷰포트/터치/스크린리더가 없으므로 이벤트·크기 모의 DOM 테스트만으로 시각 인수 완료라고 주장하지 않는다.

## UX-HL-03-C1 (2026-10-25) — 비정상 계정 ready 행의 오류 상태 전환

- 확인된 렌더링 결함: 인증된 조회 어댑터가 향후 부정확한 ready snapshot을 전달했을 때, records 안에 null·숫자·문자열·예외를 던지는 접근자가 들어가면 account-tabs-renderer.mjs의 rowValue 접근 중 TypeError가 발생해 정상적인 계정 오류 상태로 전환되지 못했다.
- renderer는 계정 신원 검증기가 아니다. 상위 validateAccountQueryResponse 및 coordinator 승인 절차는 계속 필요하며, 해당 모듈의 기본 allowValidatedRecords=false 차단을 유지한다.
- allowValidatedRecords=true인 주입 경로에서만 ready snapshot의 각 행이 객체인지 확인하고, off-DOM DocumentFragment에만 안전하게 모든 셀을 구성한다. 하나라도 잘못된 행이 있거나 예외가 발생하면 기존 본문 행을 제거하고 테이블을 숨기며 error 상태와 오류 문구를 표기한다.
- 부분적인 테이블/이전 계정 행을 남기지 않으며 이후 정상적으로 검증된 ready snapshot은 다시 표시할 수 있어야 한다.
- static trade.html에서 실제 계정/지갑 API나 fetch를 활성화하지 않으며, 토큰 금액 단위 변환/정산·거래 기능을 추가하지 않는다. 실브라우저 인수는 C2 미완료 상태로 기록한다.
