# UX-HL-03 QA

## 2026-10-25 UX-HL-03-A1

- 시작 main HEAD 4aa5d6f, clean, origin/main보다 로컬 10커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid 참조, UX-HL-01/02 SPEC·TODO·QA·RESULT, 실제 계정 탭 코드 확인.
- chromium, chromium-browser, google-chrome, firefox 및 playwright/puppeteer 미가용. 설치·권한 우회 없음. UX-HL-02-B2-B 실 브라우저 인수는 미완료로 유지.
- 신규 account-tab-visibility.test.mjs **8/8 PASS**: 초기 탭/스크롤, 화면 밖 오른쪽 클릭, Home/End/좌우 방향키 wrap·포커스/ARIA·가시성, 부분 가림 앞뒤 이동, 가로 넘침 없는 데스크톱, 무관한 키/잘못된 index, 누락 마크업 실패, 활성 panel 보존.
- 기존 account-tabs.test.mjs fake DOM의 scroller/bounding test fixture 보완. 이벤트/좌표는 결정론적 테스트 모델.
- node --test frontend/*.test.mjs **93/93 PASS** (기존 85 + 신규 8).
- node --check account-tabs.js/account-tab-visibility.test.mjs/main.js/mobile-market-depth.js PASS. npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser: frontend/index.html 고유 ID 4개, frontend/trade.html 고유 ID 59개, 중첩 태그/중복 ID 없음. CSP connect-src none 확인. git diff --check PASS.
- 실제 브라우저 스크롤·터치/반응형 실배치·스크린리더 및 접근성 트리 QA **미실행**. fake geometry 테스트만 수행.
- 실제 계정/지갑/거래·메인넷·Sepolia 트랜잭션, 운영 DB, 원격 push·배포 없음.

## 2026-10-25 UX-HL-03-B1 — 모바일 계정 테이블 가로 안내 QA

- 시작 main HEAD 6c0a269, 작업 트리 clean, origin/main보다 11커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 참고, UX-HL-03 SPEC/TODO/QA/RESULT 및 계정 탭/테이블/렌더러 실제 코드 확인.
- Chromium/google-chrome/firefox 실행 파일 및 Node playwright/playwright-core/puppeteer/puppeteer-core 없음. 설치·권한 우회하지 않고 UX-HL-03-A2와 UX-HL-02-B2-B 실제 브라우저 인수 계속 미완료.
- frontend/account-table-scroll-hint.mjs: 모바일 너비(matchMedia), 선택 패널·실제 테이블 표시, scrollWidth>clientWidth+1인 조건에 한하여 안내·tabindex·aria-describedby를 활성화. ResizeObserver/MutationObserver/resize/media query 변경을 관찰하고 해제 가능.
- 신규 frontend/account-table-scroll-hint.test.mjs **10/10 PASS**: 정상·경계/NaN/desktop/hidden/overflow 조건, 미연결 static 은폐, 실제 overflow에서 안내/키보드 설명, resize·media query/hidden 변경 시 제거 및 다른 탭 갱신, 관찰자 부재 fallback/해제, 5개 HTML 마크업과 mock 기록 없는 상태.
- 기존 계정 탭 테스트 2곳 fake DOM에 힌트 요소/테이블 스크롤 래퍼 추가. 실제 account-tabs.js 및 계정 모델/계정 미연결 상태 유지.
- Node 프런트엔드 전체 **103/103 PASS** (기존 93 + 신규 10). JavaScript syntax PASS, npm --prefix backend run build TypeScript PASS.
- HTMLParser index.html 고유 ID 4개, trade.html 고유 ID 64개, 태그/중복 ID 검사 PASS. 신규 hidden 안내 5개, CSP connect-src none, git diff --check PASS.
- 미실행: 실제 브라우저 viewport/터치/스크린리더·포커스/스크롤 시각 인수. 실제 지갑/backend API/데이터를 사용하지 않음. 원격 push/배포·실자금/온체인 거래 없음.

## 2026-10-25 UX-HL-03-C1 — 비정상 ready 계정 행의 안전한 오류 상태

- 시작 main HEAD 8c90040, Git clean, origin/main보다 39개 로컬 커밋 ahead. PROJECT_STATE/ROADMAP/UX reference, UX-HL-02-N1 TASK 문서, 실제 frontend/account-tabs.js/account-tabs-renderer.mjs/contract/read-flow 및 기존 렌더러 통합 테스트, UX-HL-03 SPEC/TODO/QA/RESULT 점검.
- 프로젝트 로컬 Playwright/Chromium 설치 약 643MB. 비특권 사용자 runuser -u node -- unshare -Ur true는 Operation not permitted. 브라우저 N2/Q2/C2 인수는 보류하고 샌드박스·권한 우회 없음.
- 사전 실패 재현: 신규 테스트 2건 모두 수정 전 FAIL. ready records:[null/42/'broken']은 TypeError, 정상 행 다음 throwing getter를 포함한 행은 예외로 렌더 중단. 정상 오류 상태/행 제거 보장되지 않음.
- 수정: frontend/account-tabs-renderer.mjs의 failReadySnapshot 공통 함수와 off-DOM 구성 try/catch. null·primitive·array 레코드 및 읽기 예외를 명시적으로 error로 전환, 모든 이전 행 제거/테이블 숨김·기존 오류 문구 표시. 정상 snapshot 후속 렌더링 동작 보존.
- 수정 후 대상 node --test frontend/account-tabs-renderer.test.mjs 11/11 PASS, 전체 node --test frontend/*.test.mjs 170/170 PASS(기존 168+2). 전체 frontend JS node --check 및 npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser index.html/trade.html 태그 및 고유 ID, CSP connect-src none, trade.html 내 account tbody 5개 빈 상태 및 MOCK-only 고지, git diff --check PASS.
- DOM 단위/모의 테스트만 수행. 실제 인증, 지갑·계정 API 조회, 운영 DB·Sepolia 트랜잭션·push/배포/권한 우회 미실행. 실브라우저·스크린리더 시각 인수 미완료.

## 2026-10-25 UX-HL-03-D1 — 계정 조회 공급자 오류 시 모든 탭 비노출

- 시작 로컬 main HEAD d1c87a8, Git clean, origin/main보다 40개 커밋 앞섬. PROJECT_STATE/ROADMAP/Hyperliquid UX reference, UX-HL-03 SPEC/TODO/QA/RESULT, 계정 UI/renderer/contract/read-flow와 기존 프런트 테스트 확인.
- .local-browser-qa Playwright/Chromium 643MB 존재. 비특권 사용자 runuser -u node -- unshare -Ur true는 Operation not permitted. 안전 제한을 우회하지 않고 UX-HL-03-C2/D2 실브라우저 인수 미완료 유지.
- 수정 전 frontend/account-tabs-renderer.test.mjs 신규 2건 FAIL: 이전 5개 ready 행 표시 뒤 coordinator.get('trade-history')가 예외를 던지면 렌더러가 그대로 예외 종료하여 남은 기록 삭제 및 명시적 오류 전환 실패. 정적 미연결 진입에서도 공급자 오류를 처리하지 못함.
- 수정: renderer에서 먼저 전체 스냅샷을 수집하고 그 다음 UI를 순서대로 갱신. get 예외 시 부분 스냅샷 무시, 5개 탭 모두 renderAccountTabSnapshot의 기존 clearRows/상태 처리를 사용하여 검증된 조회는 error, 미검증 기본 경로는 disconnected로 전환.
- 수정 후 대상 node --test frontend/account-tabs-renderer.test.mjs 13/13 PASS, 전체 node --test frontend/*.test.mjs 172/172 PASS(기존 170+2). 모든 frontend JS node --check, npm --prefix backend run build(tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html 및 trade.html 태그/중복 ID, CSP connect-src none, 정적 5개 빈 tbody 및 LOCAL PREVIEW · NO EXECUTION, git diff --check PASS.
- 실제 Chromium/모바일/스크린리더 렌더링 인수 미수행. 인증/지갑 연결·운영 DB 변경·원격 push·배포·Sepolia 트랜잭션·실거래 및 보안 제한 우회 미실행.

## 2026-10-25 UX-HL-03-E1 — 계정 스냅샷 속성 접근 오류

- 시작 HEAD 53ed014, 작업 트리 clean, origin/main 대비 로컬 41커밋 ahead. PROJECT_STATE/ROADMAP/UX reference, UX-HL-03 SPEC/TODO/QA/RESULT 및 실제 계정 renderer/model/contract와 주문/시장 코드 확인.
- .local-browser-qa Playwright/Chromium 약 643MB 존재. 비특권 runuser -u node -- unshare -Ur true는 Operation not permitted. Chromium 샌드박스 우회 없이 UX-HL-03-D2/E2 브라우저 인수 미완료.
- 수정 전 신규 frontend/account-tabs-renderer.test.mjs 2건 FAIL. 이전 ready 행 표시 이후 state getter 또는 records getter가 예외를 던지면 렌더러 함수가 throw하며 UI 오류 피드백/이전 계정 행 제거 불가.
- 수정: 렌더 시작 시 검증 경로에 한하여 snapshot.state를 try/catch로 정확히 한 번 읽고 예외 시 error 설정 후 이전 행 삭제, 테이블 숨김, 오류 상태 설명 적용. ready records 접근을 이미 존재한 try/catch 내부로 이동. 정상 ready 기록은 변경 없음.
- 수정 후 대상 node --test frontend/account-tabs-renderer.test.mjs 15/15 PASS, 전체 node --test frontend/*.test.mjs 174/174 PASS (기존 172+신규 2). 전체 JS node --check 및 npm --prefix backend run build (tsc --noEmit) PASS.
- Python HTMLParser frontend/index.html/trade.html 태그·고유 ID 검사, 정적 CSP connect-src none 및 빈 계정 tbody 5개/DEMO-only 고지, git diff --check PASS.
- 실브라우저 렌더/스크린리더 인수 미실행. 인증·계정 API·지갑, Sepolia 트랜잭션·운영 DB·원격 push/배포·권한 우회 없음.
