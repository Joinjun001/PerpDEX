# UX-HL-01 QA

## 2026-10-25 A

- 시작 상태 main HEAD 4676116, Git clean, origin/main보다 1개 앞섬. UX TASK 파일은 기존에 없어 생성.
- Node frontend 전체 테스트 15/15 PASS: 신규 hyperliquid-terminal.test.mjs 6/6, 기존 preview-model/site-routes 9/9.
- node --check frontend/main.js PASS.
- npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser 거래 페이지 태그 중첩과 중복 ID 검사 PASS.
- git diff --check PASS.
- 브라우저 실제 렌더링/화면 캡처 **미실행**. CSS 반응형 분기 테스트만 했으므로 픽셀 레벨 시각 인수는 미완료.
- 실제 oracle/mark/funding/open interest/API/지갑/실체인 연결 **미구현**. demo 값은 MOCK SAMPLE로만 표기.

## 2026-10-25 B1 계정 탭·키보드 탐색 QA

- 시작: main HEAD ebe7587, 작업 트리 clean, origin/main보다 2개 커밋 앞섬. PROJECT_STATE·ROADMAP·Hyperliquid 문서와 UX-HL-01 SPEC/TODO/QA/RESULT·프런트 실제 코드 확인.
- 신규 account-tabs.test.mjs 6/6 PASS: 5개 tab/tabpanel ARIA 연결, 표 헤더와 빈 tbody, ArrowLeft/Right wrap·Home·End, 미연결/로딩/성공 빈 응답/오류 분리 및 입력 거부, 실제 DOM 대응 모의 이벤트에서 aria-selected/roving tabindex/hidden/focus 갱신, 모바일 스크롤.
- 기존 3개 파일 15/15 PASS, 프런트엔드 전체 21/21 PASS.
- node --check frontend/account-tabs.js, node --check frontend/main.js, npm --prefix backend run build PASS.
- 소개/거래 HTMLParser 태그 계층 및 중복 ID 없음. 거래 HTML ID 46개.
- CSP connect-src none 및 정적 데모/계정 파일의 주문·네트워크 호출 없음 확인. git diff --check PASS.
- 브라우저 실행파일/Playwright/Puppeteer 부재: 화면 캡처·픽셀 레벨 모바일·실보조공학 테스트 미실행.
- 실제 wallet, 계정 API, PostgreSQL 기록, 테스트넷 거래 및 네트워크 요청 오류 전환은 미연결. 오프라인 상태 모델 검증을 실제 오류 발생 인수로 표시하지 않음.

## 2026-10-25 B2-B1 오프라인 응답 계약 QA

- 시작: main HEAD f3fbf8e, clean, origin/main 대비 앞선 로컬 커밋 3개. PROJECT_STATE, ROADMAP, Hyperliquid reference, UX SPEC/TODO/QA/RESULT 및 frontend 실제 코드 확인.
- account-query-contract.test.mjs 신규 13/13 PASS: 탭 5종 contract, account/chain/source/request/revision 위조, 레코드 필드·중복/주문 잔량·funding 부호 및 uint256 숫자 문자열 오염, 연결 전 begin 거부, loading/empty/ready/error, concurrent stale/계정 변경/disconnect/reconnect/revision 역행 차단.
- 프런트엔드 전체 node --test frontend/*.test.mjs: 34/34 PASS.
- JavaScript 문법(계약/기존 account-tabs/main) PASS; npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser로 index/trade 페이지 중첩·고유 id PASS, git diff --check PASS.
- 실제 네트워크·로그인·백엔드/테스트넷/브라우저 시각 인수는 미실행. 선언된 source 문자열만으로 신뢰된 API임을 인증하지 않는다.
- 공개 페이지·계정 탭/DOM/실제 체결 기능 변경 없음, push/배포/실체인 미실행.
