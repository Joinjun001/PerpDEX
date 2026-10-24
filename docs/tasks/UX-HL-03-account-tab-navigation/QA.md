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
