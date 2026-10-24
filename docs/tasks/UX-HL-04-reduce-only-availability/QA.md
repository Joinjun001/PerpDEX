# UX-HL-04-A1 QA

- 시작 HEAD 192785c, main clean, origin/main보다 24개 로컬 커밋 앞섬. PROJECT_STATE, ROADMAP, Hyperliquid UX 가이드, UX-HL-01~03 TASK 문서 및 실제 프런트 소스 확인.
- Chromium/Playwright는 프로젝트의 .local-browser-qa 안에 설치됐으나 unshare -Ur 권한 거부 및 sandbox 초기화 실패. 보안 제한을 우회하지 않고 실제 브라우저 인수 보류.
- 수정 전: 신규 ux-hl-04-reduce-only.test.mjs 2건 FAIL. 지원 여부·가시적 비활성 상태/접근성 설명이 구현되지 않은 상태 확인.
- 수정: trade.html에 unchecked/disabled Reduce Only checkbox + label + aria-describedby 도움말. trade.css에 비활성 레이아웃·가독성 추가.
- 실제 API, 메타마스크, 서명, 포지션/잔량, 미리보기 수치·주문 모델은 변경하지 않았다.
- 수정 후 지정 테스트 2/2 PASS, 전체 node --test frontend/*.test.mjs 140/140 PASS (138+2).
- 프런트 JS node --check, backend TypeScript tsc --noEmit, Python HTML 구조/고유 ID·CSP connect-src none/5개 계정 빈 tbody 및 git diff --check 검증.
- 실제 브라우저/보조공학 인수 미실행. 원격 push, 배포, Sepolia 트랜잭션, 운영 DB 변경, 비밀키 사용 없음.
