# PerpDEX 웹 UI — 시뮬레이션 미리보기

이 폴더는 GitHub Pages에 배포하는 **정적 사용자 인터페이스 데모**입니다.

Hyperliquid의 거래 정보 구조·사용자 흐름을 주요 UX 레퍼런스로 사용하며 독립 브랜딩을 유지합니다. 세부 컴포넌트·우선순위는 `docs/architecture/HYPERLIQUID-UX-REFERENCE.md`를 참고합니다. 미구현 정보와 기능은 반드시 미연결/DEMO 표시로 남깁니다.

계정 UI용 오프라인 응답 경계: account-query-contract.mjs의 Sepolia chain/계정/탭/요청 ID/revision/uint256 검증 및 stale 응답 폐기. 이 모듈은 실제 backend/지갑/DOM에 연결되지 않고 source 문자열이 서버 인증을 의미하지 않습니다. 문서: docs/tasks/UX-HL-01-terminal-layout/ACCOUNT_QUERY_CONTRACT.md.

계정 UI 출력 경계: account-tabs-renderer.mjs는 고정 컬럼과 안전한 textContent로만 표를 구성합니다. 정적 화면은 미연결 상태로 유지하며, 검증된 coordinator 데이터를 렌더링하는 경로는 오프라인 단위 테스트에서만 활성화했습니다. 테스트 플래그가 출처 인증을 대체하지 않으며 실제 API·지갑 연동은 미구현입니다.

오프라인 계정 read orchestration: account-read-flow.mjs은 외부 verifySession/query를 주입해야 하고, 요청 전후 지갑 세션 검증·Abort/stale/race 방지를 처리합니다. 프런트 코드에서 자동 호출하지 않으며 공개 주문 GET API에는 계정별 권한이 없어 개인 히스토리 API로 직접 연동하지 않습니다. 백엔드 조사: docs/tasks/UX-HL-01-terminal-layout/BACKEND_ACCOUNT_READ_GAP.md.

UX-HL-02-A: Market/Limit 주문 모드와 Limit Price를 입력해 MOCK 명목가치·참고 증거금을 계산하는 **순수 미리보기**를 제공합니다. 시장 변경 시 Limit Price는 해당 시장의 고정 샘플 가격으로 초기화되며 미지원 정책·실제 주문/체결/수수료/청산을 계산하지 않습니다. 세부 TASK: docs/tasks/UX-HL-02-order-ticket/.

UX-HL-02-B1: order-review.mjs의 구조화된 9항목 읽기 전용 주문 검토와 닫기/Escape/초점 복귀, 수량/Limit 오류 접근성 개선을 추가했습니다. 서버·지갑·체결 0건 및 수수료·펀딩·청산 미계산을 명시합니다. 실제 주문 실행/API 연결은 없습니다. TASK docs/tasks/UX-HL-02-order-ticket/.

UX-HL-02-B2-A: order-interactions.test.mjs는 실제 main.js를 테스트용 DOM에 import하여 Market/Limit·Long/Short·시장/수량/가격/레버리지 전환과 모의 submit·Escape·오류 포커스를 검증합니다. 실제 브라우저 렌더링·스크린리더 인수를 대체하지 않습니다.

모바일 호가 UI (UX-HL-01-D1): 화면 너비 760px 이하에서는 MOCK 호가/최근 체결을 필요할 때 펼칠 수 있는 버튼이 제공됩니다. 브라우저에서 JS가 실행되지 않으면 샘플 패널은 숨겨지지 않고 그대로 보입니다. 데스크톱 3열은 유지되며, 실제 모바일 렌더링/스크린리더 인수는 미실행입니다. 자세한 QA는 docs/tasks/UX-HL-01-terminal-layout/에 있습니다.

UX-HL-03-A1: 모바일에서 Positions/Open Orders/Order History/Trade History/Funding History 탭을 클릭하거나 방향키/Home/End로 선택하면 가로 스크롤 영역을 조정해 해당 탭이 보이도록 합니다. 데스크톱에 가로 오버플로가 없으면 움직이지 않습니다. 실 브라우저/스크린리더 QA 미완료. 문서 docs/tasks/UX-HL-03-account-tab-navigation/.

UX-HL-03-B1: account-table-scroll-hint.mjs는 모바일에서 계정 테이블이 실제 표시되어 가로로 넘칠 때에만 탐색 안내와 키보드 가로 스크롤 진입점을 제공합니다. 현재 지갑/계정 API 미연결 화면에는 안내가 나오지 않으며, 실제 브라우저·스크린리더 인수는 수행하지 않았습니다.

UX-HL-01-E1: 64개 고정 합성 가격의 차트 축을 실제 시간처럼 오해할 수 있는 08:00~18:00에서 샘플 순번 #01~#64로 수정했습니다. 차트에는 해당 생성 배열의 MOCK 최저/최고 및 스크린리더 설명이 제공되고 시장 변경 시 함께 갱신됩니다. 실시간 데이터·거래량·타임스탬프는 생성하지 않습니다. 브라우저·스크린리더 시각 인수 미실행.

UX-HL-01-F1: 생성 예시 Recent Trades에 실제 timestamp가 없어 임의 18:50 등의 시간값을 삭제하고 Sample #01~#09를 사용합니다. 실제 체결 시각·블록체인 거래 이력이 아니며, 원래 합성 가격·수량 및 시장 전환은 유지됩니다. 실제 브라우저 QA 미완료.

UX-HL-02-C1: 모의 주문 수량 검증은 Number() 자동 형변환을 통해 bool, 배열, hex 숫자 문자열을 허용하지 않습니다. 유효한 십진수/과학적 표기 입력과 범위 0.0001~100을 검증하고 Market/Limit 양쪽에서 같은 규칙을 적용합니다. 이는 실제 위험 엔진/거래 실행 검증이 아닙니다.

## 페이지 구조

- index.html (서비스 소개): 프로젝트 비전, 기술 구조, 개발 로드맵, 거래 화면 진입 버튼. 거래 입력/차트를 포함하지 않습니다.
- trade.html (전용 거래 화면): 모의 시장 정보 바, 차트·호가/최근 체결·주문 3열, Long/Short 데모 미리보기. 실제 Mark/Oracle/Funding/OI는 미연결 상태로 표시.
- 계정 하단 탭은 Positions/Open Orders/Order History/Trade History/Funding History로 구분하며 클릭 및 화살표/Home/End 키로 이동합니다. 지갑 미연결로 기록은 가공하지 않고 빈 표만 제공합니다.
- landing.css / trade.css: 각 페이지 전용 스타일. styles.css의 공통 UI 토큰·컴포넌트를 재사용합니다.
- main.js: 거래 페이지에서만 불러오며, 소개 페이지에는 실행되지 않습니다.

공개 경로: /PerpDEX/ → 소개, /PerpDEX/trade.html → 모의 거래.


- BTC·ETH·SOL 가격·차트·호가·거래 내역은 고정된 가상 예시 데이터입니다.
- 수량·레버리지 입력과 Long/Short 주문 미리보기만 동작합니다.
- 주문 전송, 거래소 매칭, 지갑 연결, 실제 시세·오라클, M3/M4 원장 연결, 사용자 로그인, 금융 거래, 온체인 담보 입출금은 구현하지 않았습니다.
- 표시되는 참고 증거금은 화면 예시용 단순 계산이며 실제 위험 정책, 수수료, 펀딩, 청산가를 뜻하지 않습니다.
- 정적 페이지에 API URL, 토큰, 비밀키나 실지갑 정보를 추가하지 마세요.

## 로컬 확인

의존성 설치 없이 브라우저를 사용할 수 있습니다.

```bash
cd frontend
python3 -m http.server 8081 --bind 127.0.0.1
# http://127.0.0.1:8081
```

테스트:

```bash
node --test frontend/*.test.mjs
node --check frontend/main.js
cd backend && npm run build
```

## 배포

저장소의 `.github/workflows/pages.yml`은 `main`의 `frontend/**` 변경이 있을 때 **GitHub Pages**로 이 폴더의 정적 파일을 배포합니다. Pages가 비활성화되어 있다면 저장소 관리자가 Actions 배포 소스를 활성화해야 합니다.

배포 사이트는 `https://joinjun001.github.io/PerpDEX/`입니다. 정적 프리뷰만 제공하므로 서버/API, PostgreSQL, 스마트컨트랙트 배포는 별도 작업입니다. 운영용 DEX라고 표시하거나 자금을 받는 기능을 연결해서는 안 됩니다.
