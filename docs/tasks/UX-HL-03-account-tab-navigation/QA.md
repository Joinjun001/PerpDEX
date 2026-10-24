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
