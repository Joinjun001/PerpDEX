# Hyperliquid 레퍼런스 기반 PerpDEX 제품·UX 가이드

기준일: 2026-10-25
상태: **제품 레퍼런스 확정 / UX-HL-01-A 로컬 완료, 5개 계정 탭 B1 구현, 실계정/테스트넷 연동 미구현**
최종 목표: Ethereum Sepolia 테스트넷 BTC-USD-PERP 무기한 선물 거래 MVP.

> **2026-11-10 화면 구체화:** 사용자 제공 거래 화면의 영역·비율·반응형·상태·검증 조건을 `docs/architecture/HYPERLIQUID-TRADE-SCREEN-SPEC.md`에 상세화했습니다. `docs/tasks/UX-HL-06-visual-terminal-rebuild/`의 A1/A2, B1(Line/Sample OHLC 전환), C1(Order Book/Trades 탭·모바일 접기 연계)은 로컬 구현·회귀 검증 중이며 실제 브라우저 인수(A3/F)는 미완료입니다. 실제 시간봉·거래량·지표는 데이터 출처 미검증으로 disabled입니다. UX-HL-01~05 및 M5~M9 선행 게이트를 유지합니다.

## 기본 원칙

- Hyperliquid를 **가장 중요한 거래 UX 레퍼런스**로 삼는다. 핵심은 거래 화면의 정보 밀도, 사용자 흐름, 포지션·잔고·위험 정보 표시다.
- 현재 분리된 **서비스 소개 페이지(/)와 거래 터미널(/trade.html)**은 계속 독립적으로 유지한다. 거래 터미널에서 큰 소개 히어로를 다시 만들지 않는다.
- Hyperliquid의 로고, 원본 화면, 코드, 문구, 가상자산 시세, 브랜드 요소를 복사하지 않는다. PerpDEX의 시각적 정체성과 디자인 시스템을 유지한다.
- Hyperliquid는 HyperCore에서 주문장·거래가 체인에 직접 반영되는 자체 L1이고, PerpDEX는 Sepolia 스마트컨트랙트 담보/정산과 오프체인 주문·매칭·DB를 결합하는 별도 모델이다. 기술 동등성·성능 동등성은 주장하지 않는다.
- 실제 연결되지 않은 시세·오라클·펀딩·OI·사용 가능 잔고·수익률은 임의 생성하지 않는다. **MOCK_SAMPLE / UNAVAILABLE / VERIFIED_TESTNET** 출처를 UI에 표시한다.

## Hyperliquid에서 참고할 화면 영역

| 참고 대상 | PerpDEX 목표 | 현재 상태 | 우선순위 |
|---|---|---|---|
| 시장 정보 헤더: Mark·Oracle·24h 변화·Funding·OI | BTC-USD-PERP 상단의 압축된 지표 바 | 모의 가격만 제공 | P0 |
| 차트·호가창·주문 티켓 | 데스크톱 3열, 모바일에서 차트→주문→접이식 호가 | 로컬 3열 + 모바일 접이식 호가, 가상 차트/체결 시각 제거·샘플 순번 및 MOCK 가격 범위 대체 텍스트 (실 브라우저 QA 전) | P0 |
| 하단 포지션·주문 관리 탭 | Positions / Open Orders / Order History / Trade History / Funding History | 계정 ARIA 5탭 + 모바일 선택 위치/조건부 가로 표 탐색 안내, 실계정 미연결 | P0 |
| Market / Limit, Long / Short, Size, Leverage | 주문 패널의 유효성·주문 확인·상태 표시 | Market/Limit·Long/Short 모의 주문/9항목 검토 | P0 |
| 주문 상태와 재시도·취소 피드백 | OPEN / PARTIALLY_FILLED / FILLED / CANCELED 및 정산 상태 | 백엔드 로컬 기반, UI 미연결 | P0 |
| Available / Reserved / Position Margin, PnL | 출처 검증된 위험·담보 데이터만 노출 | 단순 예상 증거금 미리보기 | P0/백엔드 연계 |
| GTC / IOC / Post Only, Reduce Only | Market/Limit 이후 지원; 서버/DB 검증 선행 | 일부 로컬 엔진 기반만 존재 | P1 |
| Cross / Isolated | 최초 Isolated 전용; Cross는 이후 | 격리 마진 기반 | P1/P2 |
| TP/SL, Funding, Liquidation | M6/M7·가격 트리거/청산 조건 검증 후 지원 | 미구현 | P2 |
| TWAP / Chase / Scale / Portfolio Margin | 초기 Sepolia MVP 필수 범위 제외 | 미구현 | 향후 |

Hyperliquid 공식 문서에 Market/Limit·Reduce Only·GTC·Post Only·IOC·TP/SL 등 다양한 주문 옵션이 명시되어 있다. 이 기능 목록은 PerpDEX의 구현 완료 목록이 아니다.

## 거래 터미널 권장 레이아웃

**상단 네비게이션:** PerpDEX / Trade / Portfolio / Docs / Sepolia 상태 / Wallet.

**시장 정보 바:** BTC-USD-PERP / Mark / Index·Oracle / 24h 변화 / 거래량 / Funding / OI. 미연결 값은 숫자 대신 대시(—)와 원인을 표시.

**데스크톱 주 작업 영역 (3열):**
- 큰 왼쪽 영역: 차트(시간봉, 향후 캔들·볼륨, 명확한 시세 출처)
- 중간: Bid/Ask 호가·Spread·Recent Trades
- 오른쪽: Long/Short, Market/Limit, 수량/가격/레버리지, 가용 잔액·증거금·위험, 확인/서명

**하단 전체 너비 탭:**
- Positions — Symbol, Side, Size, Entry, Mark, Unrealized PnL, Margin, Liquidation, Close
- Open Orders — Side, Type, Price, Original/Executed/Remaining, Status, Cancel
- Order History / Trade History / Funding History — 각각 독립 데이터 출처와 오류/빈 상태 표시

**모바일:** 시장 헤더→차트→주문 티켓→접이식 호가·거래 기록→계정 탭. 계정/출금/주문 변경은 오류·취소·중복 클릭을 고려.

## 다음 구현 TASK

- **UX-HL-01 (P0):** 현재 trade.html을 3열 터미널 + 정보 헤더 + 하단 탭으로 개편. 가짜 계정 정보와 실시간 지표를 생성하지 않고 '미연결' 상태를 정확히 표시. 모바일/키보드/빈 상태 테스트 포함.
- **UX-HL-02 (P0):** 주문 티켓에 Market/Limit UI, 입력 검증, 예상 비용·주문 확인. 서버·지갑 미연결 동안은 Preview만 허용.
- **UX-HL-03 (P0):** 포지션/현재 주문/체결 이력의 독립 탭 및 조회 계약. 실제 데이터가 없다면 빈 상태와 기능 제약을 유지.
- **UX-HL-04 (P1):** M3/M4/M5·실 PG 검증 후 주문·마진·PnL·Reduce Only·취소 상태 연결.
- **UX-HL-05 (M9):** Sepolia 지갑→테스트 전용 ERC20→입금→EIP-712 주문→포지션/정산→출금 전체 흐름.

## 구현·출시 제한

- 부분 체결은 signed 잔량/증거금 커밋 제약이 안전하게 검증되기 전까지 실제 활성화하지 않는다.
- 주문 preview 값은 위험 엔진 승인값과 혼동하지 않고 수수료/펀딩/청산 추정치를 임의 표시하지 않는다.
- Hyperliquid의 운영 레버리지·마진/펀딩 수치를 PerpDEX 정책으로 자동 적용하지 않는다.
- 외부 문서를 작업 허가로 사용하지 않는다. 자동 배포·실체인 트랜잭션·자격증명 이용에는 별도 승인.

## 주요 참고 자료

- 공식 앱: https://app.hyperliquid.xyz/trade
- 공식 거래 문서: https://hyperliquid.gitbook.io/hyperliquid-docs/trading
- 주문 타입: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types
- 증거금: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
- Funding: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding
- PnL/Entry: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/entry-price-and-pnl
- HyperCore 주문장: https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book
- 화면 보조 설명 (비공식): https://perpdexguide.com/hyperliquid/trading-interface/
