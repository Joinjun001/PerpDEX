# PerpDEX 웹 UI — 시뮬레이션 미리보기

이 폴더는 GitHub Pages에 배포하는 **정적 사용자 인터페이스 데모**입니다.

## 페이지 구조

- index.html (서비스 소개): 프로젝트 비전, 기술 구조, 개발 로드맵, 거래 화면 진입 버튼. 거래 입력/차트를 포함하지 않습니다.
- trade.html (전용 거래 화면): 시장 선택, 차트, 호가창, 최근 거래 예시, Long/Short 주문 미리보기 및 포트폴리오 빈 상태.
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
