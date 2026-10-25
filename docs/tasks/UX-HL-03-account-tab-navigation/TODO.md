# UX-HL-03 TODO

- [x] A1 시작 Git·UX 문서·브라우저 가용성 확인: Chromium/Playwright/Puppeteer 미설치
- [x] A1 account-tabs.js 활성 탭 좌우 경계 비교·스크롤 컨테이너 scrollLeft 보정
- [x] A1 키보드 focus({preventScroll:true}), ARIA·tabpanel hidden 보존 및 가로 넘침 없는 데스크톱 무동작
- [x] A1 기존 테스트의 스크롤 fixture 보완 및 신규 8개 가로 위치·키보드·클릭 통합 검증
- [x] A1 전체 93/93, JS/TS/HTML/CSP·Git diff 검사
- [ ] A2 실제 모바일 브라우저/키보드·스크린리더 탭 가시성 검증 (환경 미가용)
- [ ] B 신뢰된 계정별 API·지갑 인증 후에만 실계정 데이터 탭 연결 (M9 게이트)

- [x] B1 모바일 계정 테이블 넘침 안내를 5개 tabpanel에 hidden 기본값으로 추가
- [x] B1 실제 표시된 테이블과 모바일 viewport/overflow 조건 결합, keyboard tab stop 및 aria-describedby 동적 제어
- [x] B1 리사이즈·breakpoint 변경·테이블/tabpanel hidden 변경 및 기존 탭 activation 시 안내 갱신
- [x] B1 신규 10건 단위·DOM 상태 회귀, 전체 103/103, JS/TS/HTML/CSP·Git diff 검사
- [ ] B2 실제 모바일 브라우저 및 키보드/스크린리더·가로 스크롤 인수 (브라우저 도구 미가용)

- [x] C1 null/primitive/throwing accessor가 포함된 ready records가 계정 렌더링을 중단시키는 문제를 실제 renderer 회귀 2건 수정 전 FAIL로 재현
- [x] C1 임시 DocumentFragment 단계에서 행의 기본 형태와 속성 접근을 확인하고 오류가 발생하면 fail-closed error 상태 표시
- [x] C1 이전 ready 행 제거, 부분 행 비노출, 다른 정상 ready snapshot의 재렌더링 확인
- [x] C1 기존 allowValidatedRecords=false·validator/coordinator·정적 미연결 상태 및 5개 계정 탭 보존
- [x] C1 프런트 전체 170/170·JS syntax·TypeScript build·HTML/CSP/git diff 검증
- [ ] C2 안전한 실제 Chromium/스크린리더/모바일 환경에서 오류 및 회복의 시각적·보조공학 인수

- [x] D1 중간 계정 탭의 coordinator.get 조회 예외로 기존 ready 행과 화면 갱신이 불일치하는 문제를 실제 renderer 통합 테스트 2건 수정 전 FAIL로 재현
- [x] D1 5개 탭 모두 스냅샷 수집 성공 시에만 DOM 렌더 시작하도록 두 단계 처리
- [x] D1 조회 예외 시 전체 행 제거·검증된 조회 경로 error/기본 정적 경로 disconnected 상태로 안전 전환
- [x] D1 기존 단일 탭 ready/empty/loading/error 표시 및 실제 계정 API/지갑 미연결 경계 보존
- [x] D1 전체 프런트 172/172, JS syntax·TypeScript build·HTML/CSP/git diff 검사
- [ ] D2 실제 브라우저/모바일·키보드·스크린리더에서 계정 제공자 오류와 정상 복구의 상태 피드백 인수 (Chromium 샌드박스 환경 필요)

- [x] E1 snapshot.state getter와 snapshot.records getter가 예외를 던져 이전 ready 계정 행이 남는 독립 결함을 수정 전 실패 테스트 신규 2건으로 재현
- [x] E1 상태 읽기 실패는 error로 안전 전환·기존 행 제거 및 가시 테이블 숨김; records 읽기 실패도 off-DOM ready 처리에서 포착
- [x] E1 기존 계정 상태/행 검증, get 예외 전 탭 처리, 정적 disconnected 기본 상태 및 정상 후속 스냅샷 회복 유지
- [x] E1 프런트 전체 174/174·JS syntax·TypeScript build·HTML/CSP/git diff 검사
- [ ] E2 정상적인 Chromium 샌드박스/모바일/키보드·스크린리더에서 오류·복구의 실제 UI 인수

- [x] F1 기본 미검증 경로에서 coordinator.get이 실제 호출되는 문제를 새로운 통합 회귀 2건으로 수정 전 FAIL 확인
- [x] F1 allowValidatedRecords!==true인 경우 공급자 데이터 조회 없이 5개 미연결 상태 렌더·이전 ready 행 삭제
- [x] F1 기존 인증된 스냅샷 전 탭 수집, 오류/복구, C1~E1 안전 검증 및 정적 미연결 화면 보존
- [x] F1 프런트 176/176·JS syntax·TypeScript 빌드·HTML 구조/CSP/git diff 검사
- [ ] F2 실제 Chromium 모바일·키보드·스크린리더에서 계정 데이터 미연결/상태 전환 인수 (정상 샌드박스 환경 필요)

- [x] G1 주문 이력 FILLED의 부분 체결 및 미체결 주문 OPEN의 잔량 0 수용 문제를 각각 수정 전 실패 테스트 2건으로 재현
- [x] G1 FILLED는 전체 수량과 체결 수량의 원자 단위 동치만 허용
- [x] G1 OPEN은 잔량 양수 및 기존 합계 불변식 필수, 정상 부분 OPEN·취소된 부분 체결 유지
- [x] G1 기존 Sepolia/계정·탭·request ID·revision·stale 데이터 검증 유지
- [x] G1 프런트 전체 178/178·모든 JS 문법·TypeScript 빌드·HTML 구조/CSP/Git diff 검사
- [ ] G2 신뢰된 테스트넷 읽기 어댑터와 실제 브라우저가 허용된 환경에서 주문 상태/수량·모바일·보조공학 UI 인수
