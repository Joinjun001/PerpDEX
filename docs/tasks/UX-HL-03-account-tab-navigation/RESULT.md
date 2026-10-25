# UX-HL-03 결과

## 2026-10-25 UX-HL-03-A1 — 로컬 완료

- frontend/account-tabs.js: activate 시 활성 tab과 가로 스크롤 영역의 좌우 bounding 비교, 필요한 scrollLeft만 변경. 키보드 focus({preventScroll:true}) 후 가로 이동. 기존 tab/tabpanel ARIA·미연결 상태 유지.
- frontend/trade.css: 계정 탭 스크롤 영역 padding 보강.
- frontend/account-tabs.test.mjs: scroll 영역 마크업과 bounding fake DOM 지원.
- frontend/account-tab-visibility.test.mjs: 신규 8개 실행형 스크롤·ARIA/키보드 회귀 시험.
- 신규 8/8, 프런트 전체 93/93 PASS. JS 문법·백엔드 TS build·HTML 구조/ID/CSP/Git 검사 PASS.
- 실제 화면 렌더링/터치/스크린리더 미실행; API·지갑/실거래 미연결, push·배포 없음.
- 다음 UX-HL-03-A2: 브라우저/모바일 준비 시 실제 스크롤·포커스 인수. UX-HL-01-C/UX-HL-02-B2-B 역시 브라우저 가용 시 진행. 별도 인증 API가 준비되기 전까지 실계정 기록 표시 금지.

## 2026-10-25 UX-HL-03-B1 — 로컬 완료

- frontend/account-table-scroll-hint.mjs: 선택된 탭의 실제 테이블이 보이는 모바일 오버플로 상황에만 안내·키보드 스크롤 진입점/aria-describedby 표시. 관찰자 및 탭 전환 갱신, 리소스 정리 함수 제공.
- frontend/trade.html: 기존 다섯 account panel 각각에 hidden 기본 상태의 명확한 가로 스크롤 안내 추가. 기존 테이블 tbody는 모두 빈 상태.
- frontend/account-tabs.js: 기존 자동 탭 가로 위치 이동 로직과 중복하지 않고 상태 활성화 후 힌트만 재평가.
- frontend/trade.css: 안내/포커스 스타일과 hidden 우선 처리. account-tabs.test.mjs, account-tab-visibility.test.mjs 기존 가짜 DOM 확장.
- frontend/account-table-scroll-hint.test.mjs 신규 10건 포함 전체 프런트 103/103 PASS. JS/TS/HTML/CSP/git 검증 PASS.
- 실제 공개 웹사이트는 미배포, 실제 데이터/지갑/API 연동 없음. 미연결 상태에서는 힌트 표시되지 않음. 브라우저 시각/스크린리더 시험 미실행.
- 다음: UX-HL-03-B2 및 A2의 실제 브라우저/키보드/터치 인수(실행 환경 확보 시); 환경 미가용이면 ROADMAP의 독립 미완료 UX 중 안전하게 검증 가능한 작업을 새 TASK로 선정.

## 2026-10-25 UX-HL-03-C1 — 로컬 완료

- frontend/account-tabs-renderer.mjs: 잘못된 ready 계정 행이나 읽기 예외를 UI 중단 대신 명시적인 error 상태로 fail-closed 전환. 기존 또는 부분 행 노출 방지, 정상 스냅샷 렌더링 회복 가능.
- frontend/account-tabs-renderer.test.mjs: null/primitive 및 예외를 던지는 계정 행의 오류 상태/행 삭제·복구 회귀 2건 추가, 수정 전 실패 확인.
- 전체 프런트 170/170 PASS 및 JS 문법·TypeScript 빌드·HTML/CSP·git diff PASS. 실제 Chromium C2 시각/접근성 인수 미완료.
- 정적 미연결 계정 탭과 검증된 조회 계약/인증 선행 요구, 실거래·지갑·실체인·운영 DB·원격 push/배포 차단은 변경 없음.
