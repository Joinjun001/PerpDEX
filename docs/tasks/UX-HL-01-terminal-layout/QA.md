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
