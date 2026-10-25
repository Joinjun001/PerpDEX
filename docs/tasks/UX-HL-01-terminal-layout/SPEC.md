# UX-HL-01 — Hyperliquid 거래 터미널 정보 구조

- 주요 레퍼런스: docs/architecture/HYPERLIQUID-UX-REFERENCE.md
- 범위: frontend/trade.html, trade.css, 관련 데모 JavaScript와 테스트. 기존 서비스 소개, 백엔드 M5~M9, 컨트랙트는 변경하지 않는다.
- **UX-HL-01-A (이번 회차):** 데스크톱 차트 / 호가·체결 / 주문 티켓 3열 구현, 모바일·태블릿 반응형. 상단 선택 시장의 reference/sample change만 MOCK 값으로 갱신, 실제 Mark/Oracle/Funding/OI는 미연결로 표시.
- **UX-HL-01-B1 (이번 회차 로컬 완료):** Positions/Open Orders/Order History/Trade History/Funding History 독립 ARIA 탭. 표에 실제 계정 기록을 만들지 않고 빈 tbody와 미연결 안내 표시. 클릭, 방향키, Home/End 이동 및 roving tabIndex 지원.
- **UX-HL-01-B2 (다음):** 실제 조회 연결 전 계약, 지갑 미연결·정상 빈 응답·로딩·요청 오류 상태 결합. B1은 4종 상태 구분의 순수 모델만 구현, 실제 화면은 미연결만 사용.
- **UX-HL-01-B2-B1 (이번 회차 로컬 완료):** Sepolia 계정·출처·탭·requestId·revision·행 원자 수량/중복·stale 요청을 검증하는 순수 조회 계약. 상세 ACCOUNT_QUERY_CONTRACT.md.
- **UX-HL-01-B2-B2 (다음):** 인증된 데이터 adapter와 UI 상태/표 렌더링 결합. 아직 지갑·API 미연결.
- **UX-HL-01-B2-B2-A (이번 회차 로컬 완료):** 연결되지 않은 실제 화면은 disconnected만 보이도록 유지하며, 분리된 계정 테이블 renderer가 검증된 coordinator 상태와 명시적인 외부 신뢰 adapter 조건이 있을 때만 안전한 textContent/허용 컬럼 기반 테이블을 표시하도록 준비. loading/empty/error/disconnect 시 이전 tbody 제거. 실제 출처 인증 수행 없음.
- **UX-HL-01-B2-B2-B (다음):** backend read API/지갑 서명·신뢰 출처·원장 확인에 대한 계약을 먼저 마련한 뒤 renderer의 외부 adapter 접속, 실 API 에러/재시도·계정 경합 통합 검증. 해당 환경이 없으면 안전한 독립 UI QA로 진행.
- **UX-HL-01-B2-B2-B1 (이번 회차 로컬 완료):** 기존 backend HTTP 라우트의 계정 권한 미구현을 조사하고 인증 공급자/조회 콜백을 주입하는 오프라인 비동기 read flow, 세션 버전/지갑/chain·요청 세대 확인과 AbortController·재인증·기존 레코드 폐기 QA. 실제 UI·API 연결하지 않음.
- **UX-HL-01-B2-B2-B2 (다음, 환경 의존):** 신뢰 가능한 서버 읽기 API 및 지갑 소유권 인증이 준비된 뒤 브라우저 UI 연동 및 E2E 검증. 미준비 시 C1 접근성·레이아웃 독립 QA 우선.
- **UX-HL-01-C (후속):** 브라우저가 준비되면 wide/tablet/mobile 시각·접근성 인수.

## A 인수 기준

1. 차트·호가/Recent Trades·Long/Short 폼 3개 독립 컬럼.
2. <=1070px 태블릿: 차트+주문, 하단 호가/체결; <=760px 모바일: 차트→주문→호가/체결.
3. 샘플 reference/change는 시장 선택마다 갱신, Mark/Oracle/Funding/OI는 미연결 값으로 고정.
4. 기존 주문 DEMO 미리보기, mock chart/orderbook, CSP connect-src none 유지.
5. UI·CSS 테스트, HTML 태그 계층/ID, TS 빌드 PASS; 픽셀 단위 브라우저 시각 인수는 미실행 별도 표기.

## B1 인수 기준

1. 다섯 개 tab/tabpanel의 ARIA 관계와 단일 aria-selected=true, 활성 탭만 tabindex=0·나머지 패널 hidden.
2. 마우스 클릭·좌우 방향키 래핑·Home/End에서 활성화와 버튼 포커스 이동.
3. 포지션·주문·체결·펀딩 표의 column header만 정의하며 tbody는 실제 데이터 연동 전까지 비어 있음.
4. 화면 기본 상태는 계정 미연결. 정상 빈 응답과 오류/로딩은 독립 모델로 표현하되 API 없이 가짜 계정 정보/요청 실패를 보여주지 않음.
5. 모바일 탭과 테이블 가로 스크롤, 기존 차트·Long/Short 주문 데모·SIMULATION/CSP 유지.

## B2-B1 인수 기준

1. Sepolia 계정/chainId/source/tab/requestId/revision 및 다섯 탭 row schema strict validation.
2. canonical uint256 원자 문자열, 주문 잔량 합계, 중복 id·타 계정·임의 필드/출처 변조 거부.
3. 동시 조회, disconnect/reconnect, 지갑·출처 변경 시 stale 요청의 응답·오류 화면 모델 반영 거부.
4. 정상 0행 empty, 정상 기록 ready, 오류 error, 미연결 begin 거부. 실제 서버 인증은 별도 선행 게이트.
5. 공개 UI·API·실제 지갑/백엔드·DB 기능 미변경.

## B2-B2-A 독립 렌더러 인수 기준

1. 기본 allowValidatedRecords=false. 미검증/임의 snapshot의 ready/계정 기록은 표시하지 않으며 disconnected와 빈 tbody가 기본.
2. 별도 오프라인 테스트에서 유효한 coordinator accept 결과를 주입한 경우, 5개 탭의 고정 컬럼만 DOM createElement/textContent로 렌더링, innerHTML 미사용. 미연결 실제 프로덕션 경로에는 이 주입을 연결하지 않음.
3. 실패·로딩·빈 응답·연결 해제·계정/요청 교체 시 tbody 선행 제거; old token 수락 불가 시 새 레코드로 갱신되지 않음.
4. 기록 금액은 원자 단위를 임의 decimals/통화로 바꾸지 않고 atomic로 명시, 백엔드 미제공 Mark/Price/Fee/시각 등은 대시(-) 처리.
5. 기존 5개 ARIA 탭/모바일 CSS, 주문 데모, 소개 페이지, CSP 유지. 신규 HTML 렌더링/경합 회귀·빌드 검증. 실제 API/지갑/실 브라우저 시험은 별도 인수.

## B2-B2-B1 인수 기준

1. 기존 GET /api/orders 및 /api/orders/:orderId의 읽기 스코프를 실제 파일에서 확인. 서버가 강제하는 계정별 권한 없이 개인 계정 탭 연결 금지.
2. 오프라인 verifySession/query 콜백 없으면 flow 구성 거부. Sepolia chain/계정/source/sessionVersion 검증 실패 시 request 전송/결과 반영 금지.
3. 겹친 요청은 abort signal과 request token으로 폐기하고, 계정 전환/disconnect/reconnect/sessionVersion 역행·동일 version 다른 계정에서 이전 기록 제거.
4. 요청 이후 재검증에서 계정·세션이 바뀌거나 검증 실패하면 disconnected, 데이터 형식 실패는 error, 정상 빈 결과는 empty. 다른 탭 요청의 실패는 독립 처리.
5. 실제 네트워크·브라우저·wallet/계정 인증/백엔드 schema 변경 없이 순수 비동기 테스트만 구현, 기존 주문·ARIA/렌더링 회귀 유지.


## UX-HL-01-D1 (2026-10-25) — 모바일 호가·최근 체결 접기

- Hyperliquid UX 가이드에 있는 모바일 우선순위: 시장 헤더 → 차트 → 주문 → 접이식 호가/거래 기록 → 계정 탭.
- 대상: frontend/trade.html, trade.css, mobile-market-depth.js. 기존 데스크톱 3열, MOCK sample 표/주문/계정 탭과 백엔드·M5~M9는 변경하지 않는다.
- 760px 이하: 호가창/최근 체결의 단일 공개/접기 버튼, aria-expanded 및 aria-controls 두 패널 연결, 44px 이상 터치 타깃, 포커스 표시. 작은 화면에서는 처음에 둘 다 접힌다.
- 760px 초과: 공개 여부 상태와 관계없이 호가/최근 체결은 항상 데스크톱 컬럼에 표시하고 토글 버튼은 보이지 않는다.
- 스크립트가 실패하면 toggle hidden 및 두 샘플 패널 표시 상태를 유지해 콘텐츠가 사라지지 않는다. JavaScript 정상 실행에서만 토글 노출·모바일 접기 속성 초기화.
- 실제 접근성/뷰포트 픽셀 QA를 수행하지 않았으므로 대응 미디어쿼리 및 이벤트 로직 검증을 시각 렌더링 완료로 인정하지 않는다.

## UX-HL-01-E1 (2026-10-25) — 모의 차트 출처·텍스트 대체 정보

- 현재 sampleChart는 네트워크/RPC 시세나 실제 시각을 사용하지 않고 시장별 64개의 가상 가격을 생성한다. 기존 차트의 08:00~18:00 축은 실시간 시각으로 오해할 소지가 있으므로 실제 시간을 나타내는 숫자를 삭제하고 순번 #01~#64로 교체한다.
- generated sample에서만 최저/최고/마지막 값을 유도한다. UI는 MOCK LOW/HIGH로 표시하고 Chart SVG는 설명 ID를 aria-describedby로 참조한다.
- 대체 설명은 현재 마켓, 가상 샘플 개수, 최저/최고/마지막 USD 표시값, 실제 시각·실시세·오라클·체결이 아님을 포함한다. 정적 중복 텍스트를 단순 붙이지 않고 BTC/ETH/SOL 시장 선택 시 갱신한다.
- 가상 차트의 실제 타임스탬프·OHLC/거래량/실시간 가격은 존재하지 않으므로 생성하거나 실제 시장 가격으로 표시하지 않는다.
- 기존 차트 도형·호가·Market/Limit·Long/Short 주문 데모·5개 계정 ARIA 탭 및 모바일 기능·CSP 유지.
- 보조공학·모바일 브라우저의 실제 화면/스크린리더 인수는 환경이 마련될 때까지 UX-HL-01-C로 별도 미완료.

## UX-HL-01-F1 (2026-10-25) — 모의 체결의 시간 출처 정합성

- 기존 Recent Trades는 실제 체결 시간 데이터가 없는데도 main.js에서 18:50~18:18을 만들어 Time 열에 표시했다. 이는 실제 체결 시각으로 오인할 수 있는 구체적 결함이다.
- 이번 작은 TASK에서는 가격·수량·9행/시장 전환을 보존하며 제3열을 Sample #와 #01~#09로 교체한다.
- GENERATED EXAMPLES/MOCK를 유지하며 실제 체결 시각·블록체인 기록이 아님을 표시한다. 타임스탬프·네트워크/API/계정 기록을 임의 생성하지 않는다.
- 시장 선택, 주문 데모, ARIA 5개 탭, 모바일 호가 접기 등 기존 기능·CSP 유지. 실제 브라우저/스크린리더 인수는 별도 미완료.

## UX-HL-01-G1 (2026-10-25) — 모의 호가 Total 누적 계산 정합성

- 확인된 결함: 기존 frontend/main.js의 Order Book Total은 실제 누적 수량이 아닌 각 행의 Size × (index+1)로 계산되어 데이터 의미를 잘못 표현했다.
- 기존 7개 호가 가격, Size, 정렬, SYNTHETIC LIQUIDITY/MOCK 출처, BTC/ETH/SOL 시장 전환은 변경하지 않는다.
- Ask: 화면에서는 먼(높은) 매도가격이 위, 최우선 매도가격(낮은 값)이 아래이므로 각 행의 Total은 해당 행부터 최우선 매도까지의 Size 합.
- Bid: 최우선 매수가격(높은 값)이 위이므로 각 행의 Total은 첫 행부터 해당 행까지의 Size 합.
- 각 표시 Total은 오직 기존 합성 Size에서 도출하며 실제 주문장·유동성·체결 정보가 아니다.
- 실제 브라우저·터치·스크린리더 QA는 F2/C 등 기존 브라우저 의존 TASK로 별도 미완료 유지.

## UX-HL-01-H1 (2026-10-25) — 시장 ID 허용 목록 검증

- 기존 sampleChart가 MARKETS[market]의 truthy 여부만 확인하여 constructor, __proto__, toString 등 Object.prototype의 상속 속성을 실제 시장으로 간주하고 NaN 샘플을 반환하는 결함 확인.
- previewEstimate도 상속 속성을 정상 시장으로 간주하여 늦은 금액 오류를 반환하고, describeSampleChart의 Object.hasOwn은 사용자 객체를 문자열로 강제 변환할 수 있어 임의 toString 객체를 BTC로 수락.
- BTC/ETH/SOL primitive 문자열 중 MARKETS own key에 해당하는 것만 유효한 시장 ID로 허용. sampleChart, previewEstimate, describeSampleChart에서 동일 검증 함수를 사용.
- 기존 합성 가격·수량·차트·주문 미리보기·계정 미연결·CSP/모바일 UX는 변경하지 않는다. 실계정/실거래 정보는 생성하지 않는다.
- 수정 전 실패 테스트로 prototype key/객체 시장의 NaN 생성과 데이터 출처 검증 결함 재현 후 JS/TypeScript/HTML/CSP/Git 검증.

## UX-HL-01-I1 (2026-10-25) — 가상 샘플 변화율과 UI 정합성

- 발견: MARKETS.change는 합성 시계열 생성의 상승/하락 방향 구성값인데, 이전 시장 선택/차트/시장 지표는 이를 그대로 Sample change로 표시했다. 실제 64개 sampleChart 첫 값과 마지막 값의 변화율은 BTC +1.327...% / ETH +1.343...% / SOL -1.277...%여서 화면의 +2.41% / +1.18% / -0.82%와 불일치했다.
- 실제 차트 64개 샘플의 첫 값과 마지막 값으로 계산한 changePercent를 describeSampleChart에서 반환하고 대체 설명에 동일 값/샘플 기준을 명시한다.
- BTC/ETH/SOL 마켓 선택 버튼, 차트 change, Sample change 지표는 모두 같은 생성 샘플의 변화율을 소수 둘째 자리까지 표시한다. JS가 실행되지 않은 초기 정적 화면에도 같은 값과 출처를 반영한다.
- 기존 MARKET 변경시 초안/검토 무효화·현재 선택 재클릭 보존, Market/Limit 금액, MOCK 차트의 수량/가격, 미연결 계정 및 CSP 유지. 실제 24시간 수익률·실시간 시세·가격 피드라고 주장하지 않는다.
- 실제 브라우저/스크린리더 픽셀 QA는 별도 미완료. 수정 전 실패 테스트와 전체 오프라인 검증으로 구현 범위를 제한한다.

## UX-HL-01-J1 (2026-10-25) — 합성 호가 누적 Total과 시각적 깊이 막대 정합성

- 결함: frontend/main.js의 Total 표시값은 최우선가 기준 누적합인데, 각 호가 행의 배경 깊이 막대 CSS --depth는 12+(i*19)%76 임의 패턴으로 생성됐다. BTC Ask 화면 첫 행 Total은 최대 누적합이므로 깊이 막대 100%가 예상되지만 기존에는 12%였다.
- 각 행의 깊이 막대를 그 호가 측 전체 7개 합성 수량 대비 해당 행의 누적 Total 비율(0~100%)로 표시한다. Ask는 최우선 매도가 화면 아래에 있으므로 위에서 아래로 작아지고, Bid는 최우선 매수가 화면 위에 있으므로 위에서 아래로 커진다.
- 기존 합성 가격·Size·누적 Total·거래 샘플·주문 미리보기 및 SYNTHETIC LIQUIDITY 출처 표시는 변경하지 않는다.
- CSS에서 기존 --depth를 사용하므로 DOM 배경 스타일만 변경하고 브라우저/스크린리더 실제 렌더링은 별도 인수로 남긴다.

## UX-HL-01-K1 (2026-10-25) — 합성 호가 목록의 행별 접근성 설명

- 결함: SYNTHETIC LIQUIDITY Order Book은 Price·Size·Total을 시각적 div/span 열로 보여 줬으나 가격/수량/누적값의 의미 및 Ask/Bid 방향이 행의 접근성 이름으로 연결되지 않았다. 숫자들이 텍스트로는 존재해도 각 숫자에 해당하는 열 이름과 모의 출처를 분명히 전달하기 어려웠다.
- BTC/ETH/SOL 시장의 asks/bids 각각을 명시적인 ARIA list로 구분하고, 생성된 각 호가 행에 role=listitem을 제공한다.
- 각 행의 aria-label은 현재 시장, 매수/매도 방향, 행 번호, 실제 표시 가격(USD), Size 및 누적 Total(해당 시장 단위), 실제 주문장이 아닌 합성 샘플이라는 출처를 포함한다. 수치는 새로 생성하지 않고 기존 표시 결과와 일치시킨다.
- 각 행의 가시적인 세 span은 aria-hidden=true로 중복 발표를 방지하며 시각·텍스트/계산 값은 보존한다.
- 정적 초기 HTML에서 합성 매도/매수 목록의 이름과 출처를 제시하며 시장 선택 시 동적으로 목록·행 설명을 갱신한다. 실스크린리더 인수는 별도로 미완료.
- 기존 호가 가격·Size·Total/깊이 막대, 차트, 주문/계정 탭, CSP·미연결 API 경계를 변경하지 않는다.

## UX-HL-01-L1 (2026-10-25) — 가상 최근 체결 예시 접근성 목록·행 의미

- 확인한 결함: Recent Trades 9개 MOCK 행은 가격, 수량, Sample #를 span으로 나란히 보여 주지만 행의 접근성 이름에 열 의미·매수/매도 방향·샘플 출처가 결합되지 않았다.
- 컨테이너는 모의 BTC/ETH/SOL의 독립 ARIA list로 표시하고, 각 행에 listitem·aria-label을 추가한다. 이름은 화면에 실제 표시하는 가격(USD), 수량(해당 시장 단위), #01~#09 순번, 가상의 매수/매도 방향, 실거래 기록이 아니라는 사실에서만 구성한다.
- 화면 숫자·색상·시장 생성 시드 및 기존 차트/호가·주문 기능은 불변. 각 행의 세 가시 숫자 span은 aria-hidden=true로 보조공학 중복 낭독을 제한한다.
- JS 비실행 시에도 정적 컨테이너는 합성 목록 출처를 제공하며, 시장 변경 시 목록과 각 행의 설명을 갱신한다.
- 실제 브라우저·스크린리더 인수는 환경 미가용으로 별도 미완료. 서버/지갑/거래/실제 체결 시각을 연결하지 않는다.

## UX-HL-01-M1 (2026-10-25) — 최근 체결 예시의 가시적인 매수·매도 방향

- 발견 결함: Recent Trades MOCK 목록의 매수·매도 방향을 첫 번째 가격의 녹색/빨간색으로만 구별했다. 보조공학용 L1 행 설명에는 방향 정보가 있으나, 화면에는 방향을 나타내는 별도 텍스트가 없어 색각 이상/흑백 화면에서 구별하기 어려웠다.
- 가시적인 Side 열을 추가하고 각 합성 행에 Buy/Sell 텍스트를 표시한다. 기존 seed에 따라 정해진 매수/매도 불리언 값을 그대로 재사용하며 새로운 체결 데이터·시각·정책을 계산하지 않는다.
- Price (USD), Size, Sample # 및 보조공학 목록/행 레이블은 보존한다. 행 설명의 방향과 가시적인 Side가 반드시 일치해야 한다.
- 좁은 호가/체결 중간 컬럼에 맞게 Recent Trades에 한정한 4열 CSS를 추가한다. Order Book 3열과 터미널의 3열 외곽 레이아웃·모바일 접기 기능은 바꾸지 않는다.
- 브라우저 렌더링/스크린리더 인수는 별도 미완료. 지갑/계정 API·서명·실거래·운영 DB 연결은 불허.

## UX-HL-01-N1 (2026-10-25) — 합성 호가/체결 가시 수량 단위 동기화

- 확인된 표시 결함: Order Book의 가시적 Size/Total 열과 Recent Trades의 Size 열은 BTC·ETH·SOL 자산 수량을 보여 주지만 헤더에 수량 단위가 없었다. 시장 전환 후에도 Price (USD) 외 수량 단위를 시각적으로 식별할 수 없었다.
- 초기 정적 BTC 화면의 Book Size/Total 및 Trades Size 헤더에 각각 Size (BTC), Total (BTC), Size (BTC)를 지정한다.
- 실제 시장 전환 시 선택한 자산 단위에 따라 동일 헤더 세 개의 텍스트를 BTC/ETH/SOL로 동기화한다.
- 기존 합성 가격/호가 Size·누적 Total/깊이·최근 체결 수량·Buy/Sell 방향과 ARIA 목록/행 설명을 변경하지 않는다. 실제 잔액·위험 정책·체인 가격/거래로 오인될 수 있는 새로운 수치는 제공하지 않는다.
- JS 미실행 초기 화면과 실제 main.js 시장 전환을 대상으로 회귀 검증한다. 좁은 브라우저/스크린리더 레이아웃 인수는 별도 미완료다.

## UX-HL-01-O1 (2026-10-25) — 최우선 합성 호가 기반 MOCK Spread

- 확인된 UX 누락: Order Book 가운데에는 기준 MOCK 가격과 SPREAD DEMO 문구만 있었다. 합성 호가의 최우선 매도/매수 가격 차액 자체는 계산·표시되지 않아 데모 사용자는 스프레드의 의미를 정량적으로 확인할 수 없었다.
- 기존 생성 로직에서 최우선 합성 매도가는 기준가+depthStep, 최우선 매수가는 기준가-depthStep이다. 그 차액인 2×depthStep을 USD 통화로 포맷하여 가격 아래 SPREAD 옆에 표시한다. 실제 검증은 렌더링된 최우선 매도/매수 가시 가격과 비교한다.
- HTML 초기 상태의 스프레드는 —로 두며, JavaScript 렌더 이후에만 MOCK USD 금액을 표시한다. 항상 MOCK 및 실제 호가가 아니라는 안내를 유지한다.
- 시장 변경 시 BTC/ETH/SOL 합성 스프레드와 접근성 이름의 시장 ID를 함께 갱신한다.
- 스프레드는 실제 유동성·슬리피지·거래 가능 가격·마진/위험/체결 정책이 아니다. 기존 Order Book 가격/Size/Total/깊이, Recent Trades/모의 주문·계정 관련 기능은 변경하지 않는다.
- 실제 브라우저·스크린리더 UI 인수는 UX-HL-01-O2에서 별도로 확인하며 샌드박스 제한을 우회하지 않는다.

## UX-HL-01-P1 (2026-10-25) — 합성 차트 시각 방향과 샘플 추세 정합성

- 확인된 결함: Sample change는 BTC·ETH 상승/SOL 하락을 표시하지만 SVG chart-line·chart-point 및 chartFill의 stop-color는 상승용 초록색으로 고정됐다.
- 기존 describeSampleChart(view.market,points).changePercent 부호로 선·끝점·면적 그라데이션 색을 기존 디자인 초록(#43e1b4)/빨강(#ff6c7b)에 맞춘다. 새 가격이나 추세값은 생성하지 않는다.
- 초기 BTC 모의 차트의 초록색은 유지하고 두 gradient stop에 고유 ID를 추가한다. 마켓 변경/재선택 시 모든 SVG 색상은 기존 샘플의 상승·하락 방향과 일치해야 한다.
- 차트의 +/−, ↗/↘, 샘플 범위·스크린리더 설명·MOCK 출처와 가격/주문 계산은 불변이다.
- 실제 브라우저·보조공학 인수는 P2 별도 작업이며 현재 샌드박스 제한을 우회하지 않는다.

## UX-HL-01-Q1 (2026-10-25) — 브라우저 제목과 선택 모의 시장 일치

- 확인한 UX 누락: BTC/ETH/SOL 시장을 변경해도 브라우저 탭 제목은 단순히 거래 데모 · PerpDEX로 고정됐다. 여러 브라우저 탭을 열면 선택한 계약을 제목으로 식별할 수 없었다.
- 거래 페이지의 정적 초기 HTML 제목을 BTC-USD-PERP · 거래 데모 · PerpDEX로 지정한다. JavaScript 최초 실행·시장 변경 때 동일한 패턴에 선택 자산 BTC/ETH/SOL을 적용한다.
- 시장 코드/가격·차트/주문/계정 기능을 변경하지 않고, 제목에서도 반드시 거래 데모라고 표시해 실거래 서비스나 최신 시장 데이터를 암시하지 않는다.
- 실제 브라우저·보조공학/모바일 탭 인수는 Q2에 보류. 승인 없는 권한 상승·원격 push/배포·실자금/테스트넷 거래 금지 유지.

## UX-HL-01-R1 (2026-10-25) — 모의 호가 스프레드 접근성 이름에 실제 표시 금액 포함

- 재현한 접근성 결함: 가시 MOCK 스프레드 output에는 BTC/ETH/SOL별 USD 금액이 표시되지만 명시적 aria-label에는 시장과 '합성 호가 스프레드'만 있었다. 명시적 접근성 이름이 내용을 덮으면 보조공학에서 핵심 수치를 알기 어렵다.
- 렌더 시 합성 최우선 ask/bid 차액의 FORMAT_USD 표시값을 한 번 계산해 visible textContent와 aria-label 양쪽에 같은 시장·금액·USD 단위·실제 호가 아님 출처를 반영한다.
- JavaScript 미실행 초기 마크업에는 생성 전인 output 값 —를 보존하고 aria-label을 '스프레드 미계산 · 실제 호가 아님'으로 명확히 구분한다.
- MOCK 호가·차액 계산·주문 처리·거래 금지·CSP는 유지한다. 실제 Chromium/모바일·키보드·스크린리더 출력 인수는 R2에서 수행한다.

## UX-HL-01-S1 (2026-10-25) — 모바일 거래 화면의 계정 현황 바로가기 복원

- 확인한 모바일 탐색 결함: 데스크톱 상단 main-nav에는 href=#portfolio 링크가 있지만, 650px 이하의 기본/거래 CSS에서 main-nav 전체를 숨긴다. 별도 모바일 포트폴리오 진입 링크가 없으므로 차트·주문·호가 아래의 계정 탭 영역에 도달하려면 긴 화면을 직접 스크롤해야 했다.
- 모바일 거래 화면의 기존 제목 영역에만 보이는 '계정 현황 ↓' 앵커를 제공하고 현재 존재하는 #portfolio 영역을 연결한다. JavaScript·지갑·인증/계정 API에 의존하지 않으며, 데스크톱에서는 기존 메인 내비게이션 링크만 유지한다.
- 터치 영역은 최소 높이 44px, 키보드 focus-visible 표시, 화면 좁을 때 기존 제목 묶음의 flex-wrap으로 줄바꿈을 허용한다. 기존 랜딩 페이지 링크·헤더·MOCK 주문/표시·계정 미연결 상태를 변경하지 않는다.
- UX-HL-01-S2 실제 모바일/키보드/스크린리더·Chromium 화면 위치 인수는 정상 브라우저 샌드박스 환경에서 수행한다.
