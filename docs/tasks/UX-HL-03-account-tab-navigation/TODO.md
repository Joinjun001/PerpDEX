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
