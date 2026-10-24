# PerpDEX 웹 UI — 시뮬레이션 미리보기

이 폴더는 GitHub Pages에 배포하는 **정적 사용자 인터페이스 데모**입니다.

Hyperliquid의 거래 정보 구조·사용자 흐름을 주요 UX 레퍼런스로 사용하며 독립 브랜딩을 유지합니다. 세부 컴포넌트·우선순위는 `docs/architecture/HYPERLIQUID-UX-REFERENCE.md`를 참고합니다. 미구현 정보와 기능은 반드시 미연결/DEMO 표시로 남깁니다.

계정 UI용 오프라인 응답 경계: account-query-contract.mjs의 Sepolia chain/계정/탭/요청 ID/revision/uint256 검증 및 stale 응답 폐기. 이 모듈은 실제 backend/지갑/DOM에 연결되지 않고 source 문자열이 서버 인증을 의미하지 않습니다. 문서: docs/tasks/UX-HL-01-terminal-layout/ACCOUNT_QUERY_CONTRACT.md.

계정 UI 출력 경계: account-tabs-renderer.mjs는 고정 컬럼과 안전한 textContent로만 표를 구성합니다. 정적 화면은 미연결 상태로 유지하며, 검증된 coordinator 데이터를 렌더링하는 경로는 오프라인 단위 테스트에서만 활성화했습니다. 테스트 플래그가 출처 인증을 대체하지 않으며 실제 API·지갑 연동은 미구현입니다.

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
