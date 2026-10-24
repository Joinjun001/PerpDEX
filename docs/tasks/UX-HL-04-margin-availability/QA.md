# UX-HL-04-B1 QA

- 시작 HEAD f09d628, main 작업 트리 clean, origin/main 대비 25커밋 ahead. PROJECT_STATE/ROADMAP/Hyperliquid UX 가이드, UX-HL-04-A1 SPEC/TODO/QA/RESULT 및 실제 HTML/CSS/테스트 확인.
- 프로젝트 내부 .local-browser-qa/ Chromium/Playwright는 존재하나 Linux unshare -Ur 권한 거부·Chromium sandbox 실패로 실제 브라우저 인수는 미실행. no-sandbox 우회 금지.
- 수정 전 신규 ux-hl-04-margin-status.test.mjs 3건 모두 FAIL. 세 계정 증거금 표시/UNAVAILABLE 출처/ARIA 설명/반응형 계약 부재 확인.
- 수정: trade.html 폼 안에 Account Margin section(data-source=UNAVAILABLE), dl의 Available/Reserved/Position Margin을 각각 — 미연결로 표시. 지갑·인증된 계정·증거금 API 미연결과 MOCK Indicative margin의 차이 설명. CSS 가변 폭/단일 열.
- 전체 실행에서 기존 hyperliquid-terminal.test.mjs 상단 미연결 문구 4개 검사 1건이 새로운 계정 지표 3개까지 페이지 전체로 세어 FAIL. market-metrics 섹션 검사로 좁혀 원래 계약을 유지.
- 수정 후 신규 3/3, 관련 9/9, 프런트 전체 node --test frontend/*.test.mjs 143/143 PASS (140+3); 모든 frontend JS node --check PASS, npm --prefix backend run build (tsc --noEmit) PASS.
- HTMLParser 두 HTML의 태그 중첩/중복 ID, CSP connect-src none/5개 계정 tbody 빈 상태, git diff --check PASS.
- 실계정·모의 포지션·자금/담보/위험 계산·API/지갑·실주문·Sepolia 트랜잭션·운영 DB·푸시/배포 미실행.
