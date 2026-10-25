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

## UX-HL-03-D1 (2026-10-25) — 계정 스냅샷 조회 예외 시 모든 탭 일관된 비노출

- 확인된 독립 결함: renderAccountTabsFromCoordinator가 5개 계정 탭의 coordinator.get(id)와 DOM 렌더링을 한 루프에서 실행한다. 중간 탭 조회가 예외를 던지면 갱신이 즉시 중단되므로 이전 ready 계정 행이 일부 탭에 남고 통일된 오류/미연결 피드백을 제공하지 못한다.
- 실제 DOM 변경 전에 5개 탭의 스냅샷을 먼저 수집한다. 조회 중 예외가 발생하면 조회 결과를 일부라도 사용하지 않고 모든 탭의 기존 행을 삭제한 다음 인증된 조회 표시 허용(allowValidatedRecords=true)에서는 error를, 정적 미연결 기본값에서는 disconnected를 보여 준다.
- 상위 인증/계정/체인/요청 토큰 검증·M5~M9 선행 게이트는 별개로 유지한다. 인증 확인 없는 현재 정적 페이지의 실제 계정 표시·지갑/네트워크/거래 기능을 활성화하지 않는다.
- 모든 조회가 성공한 경우 각 탭의 기존 독립 상태(loading/empty/error/ready)와 행 렌더링은 변경하지 않는다. 브라우저/스크린리더 실제 오류 피드백 인수는 D2로 보류한다.

## UX-HL-03-E1 (2026-10-25) — 계정 스냅샷 속성 조회 예외의 안전한 상태 처리

- 확인된 실제 결함: 기존 C1은 ready 행의 내부 값 읽기, D1은 coordinator.get 조회 예외를 안전하게 처리했지만, renderAccountTabSnapshot 초기의 snapshot.state 또는 ready 진입 직후 snapshot.records 접근이 예외를 던지면 기존 계정 행을 삭제하기 전에 UI 갱신이 중단될 수 있었다.
- allowValidatedRecords=true인 미래 인증 조회 경로에서 속성 접근이 실패하면 즉시 이전 행을 지우고 account error 피드백/숨긴 테이블을 제공한다. 기본 allowValidatedRecords=false 정적 UI는 snapshot 접근 없이 disconnected를 유지한다.
- 성공한 snapshot.state는 한 번 읽어 고정하고 허용된 상태 중 하나인 경우에만 사용한다. ready records 확인도 try/catch에 포함하여 일부 행 표시·오래된 기록 잔존을 막는다.
- 오류 이후 새로 검증된 정상 ready 스냅샷은 기존대로 다시 렌더링 가능. 지갑, 인증, 검증되지 않은 API, 실제 거래·체인/운영 DB는 연결하지 않는다.
- 실제 Chromium/모바일/스크린리더 인수는 UX-HL-03-E2에서 수행하며 샌드박스 제한을 우회하지 않는다.

## UX-HL-03-F1 (2026-10-25) — 미검증 계정 조회 게이트에서 공급자 호출 금지

- 확인된 UX 및 연결 안전 결함: renderAccountTabsFromCoordinator는 allowValidatedRecords=false 기본 경로에서도 coordinator.get(id)를 다섯 번 호출했다. 결과가 화면에 표시되지는 않더라도 연결되지 않은 정적 UI에서 불필요한 공급자 읽기·부수효과·오류 경로가 실행될 수 있었다.
- 검증된 레코드 허용이 정확히 true가 아니면 coordinator.get을 호출하지 않는다. 대신 모든 탭을 기존 renderAccountTabSnapshot의 disconnected 경로로만 갱신하고 과거 ready 행을 제거한다.
- 향후 실제 인증/계정 조회 어댑터에서는 별도의 지갑·체인·세션 검증을 완료하고 호출자가 명시적으로 허용해야 스냅샷을 읽는다. 본 모듈 자체가 인증을 보장하는 것은 아니다.
- 검증된 경로는 D1 전체 스냅샷 선조회 및 실패 시 전체 오류 전환, E1/C1 부정확한 스냅샷·행 검증 등 기존 처리와 동일하다.
- 실제 브라우저·스크린리더/모바일은 F2 별도 인수이며 Chromium 샌드박스 제한을 우회하지 않는다.

## UX-HL-03-G1 (2026-10-25) — 주문 상태와 잔여 수량의 계정 조회 정합성

- 실제 검증 결함: account-query-contract.mjs는 Order History 레코드가 FILLED인데 filledQuantityAtomic<quantityAtomic인 경우, Open Orders가 OPEN인데 remainingQuantityAtomic=0인 경우도 수용했다. 정적 데모에서 직접 거래되지는 않지만 향후 인증된 계정 조회가 연결되면 상태 텍스트가 실제 수량과 모순될 수 있다.
- Order History의 FILLED 상태는 체결 원자 수량이 전체 주문 원자 수량과 정확히 같은 때만 유효하다. CANCELED 상태는 유효한 부분 체결/0 체결을 허용하며 기존 상한 검증(체결량<=전체량)을 유지한다.
- Open Orders의 OPEN 상태는 remainingQuantityAtomic>0이면서 기존 원장 보존식 quantityAtomic=filledQuantityAtomic+remainingQuantityAtomic 및 정수형/소유 계정/체인 검증을 충족해야 한다.
- 상태/원자 단위 문자열 검증만 개선한다. 실서버·검증되지 않은 API·지갑·오더북·스마트컨트랙트/운영 DB·실거래를 연결하지 않는다. 로컬 인증 경계나 모델의 status 값을 실제 서버 사실로 해석하지 않는다.
- UX-HL-03-G2 실제 인증된 계정 UI/브라우저 인수는 신뢰 가능한 서버 및 Chromium 샌드박스 환경이 마련된 후 별도 진행한다.

## UX-HL-03-H1 (2026-10-25) — 동일 revision의 상충 계정 기록 차단

- 재현된 조회 상태 결함: 계정별 탭 coordinator가 더 낮은 서버 revision만 거부해 동일 revision으로 다시 조회할 때 기록 ID나 값/행 유무가 달라져도 이미 승인된 스냅샷을 덮어썼다. 같은 데이터 버전이 서로 다른 내역을 표시하는 위험이다.
- 동일 탭의 직전 성공 revision과 새 승인 revision이 동일하면 정규화된 records의 JSON 표현(레코드 값 및 순서 포함)도 같아야 한다. 같으면 멱등 재조회를 허용하고, 다르면 기존 fail-closed error/빈 기록 처리.
- 더 큰 revision의 데이터 변경 허용, 더 낮은 revision 거부, 계정/출처 변경·disconnect/reconnect 시 비교 기록 초기화 유지.
- 오프라인 계약 정합성 검증일 뿐 서버 진위·계정 소유권·DB 진실성을 증명하지 않는다. 실제 지갑/계정 API는 연결하지 않는다. 신뢰 가능한 서버·브라우저 H2 인수는 미완료.
