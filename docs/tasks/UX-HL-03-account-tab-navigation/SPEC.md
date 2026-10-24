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
