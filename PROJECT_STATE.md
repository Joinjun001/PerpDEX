# PROJECT_STATE

## 현재 상태

- 프로젝트: PerpDEX
- 브랜치: `main`
- 기준: 실제 소스 코드와 Git 상태를 최우선으로 판단
- 현재 마일스톤: **M5 — Perpetual Futures 초기·유지증거금/레버리지 위험 엔진 (로컬 모의 구현)**
- 현재 TASK: **M5-T3-C3-C2-B2-B2 — 승인된 전용 PostgreSQL 실제 다중 세션·role·트리거 실 인수 (Next; B2-B1 로컬 트리거 카탈로그 검사 완료, 실 PG 미실행)**
- **최종 제품 목표 (2026-10-25): M9 Sepolia 테스트넷 Perpetual Futures 거래 MVP.** 실가치 없는 테스트 전용 ERC-20, MetaMask 지갑, EIP-712 signed 주문, Long/Short 포지션, M8 선물 담보 잠금·검증 정산, 테스트 토큰 출금까지 E2E 구현한다. M5~M8은 선행 안전 게이트로 유지한다. GitHub Pages는 현재 Simulation Preview이며 테스트넷 거래 기능과 미연결. 세부 목표·인수 기준: docs/releases/SEPOLIA-TESTNET-TRADING-MVP.md. Sepolia 컨트랙트 배포·트랜잭션·테스트 ETH 사용·실제 API 공개는 별도 승인 전 실행하지 않는다. 현재 기존 TASK의 상태를 제품 방향 변경만으로 완료 처리하지 않는다.
- **병렬 UX TASK (2026-10-25): UX-HL-01-A/B1/B2-B1/B2-B2-A/B2-B2-B1 로컬 완료.** 정적 3열 거래 UI·ARIA 5탭·안전한 조회 계약/렌더러 + 외부 인증 콜백 전제의 오프라인 read flow. 기존 GET /api/orders는 계정별 소유권 인증 없음 → 실 UI에 미연결. frontend 55/55 및 기존 backend 주문 read HTTP 6/6 PASS. 다음 B2-B2-B2는 실제 계정 read API/지갑 인증 의존, 독립 작업 UX-HL-01-C는 브라우저 접근성 인수. M5 backend current task 및 배포/실거래 제한 유지.
- **병렬 주문 UX TASK (2026-10-25): UX-HL-02-A/B1/B2-A 로컬 완료.** Market/Limit·Long/Short DEMO 미리보기/9항목 리뷰, 실제 main.js 이벤트 DOM 통합 7건 및 잘못된 submit의 수량/Limit 입력 focus 보완. 프런트 79/79 PASS, JS/TS 검사 PASS. 브라우저 미가용으로 B2-B 실제 viewport/스크린리더 인수는 미완료. 계정 API/지갑·실거래 미연결, M5 current TASK 및 push/배포 제한 불변.
- **모바일 호가 UX TASK (2026-10-25): UX-HL-01-D1 로컬 완료.** 차트/주문 우선 배치 유지하면서 모바일(760px 이하)의 MOCK Order Book/Recent Trades 접기·펼치기, aria-expanded/controls, JS 부재 시 콘텐츠 표시를 구현. 신규 6건 포함 프런트 85/85 PASS, JS/TS/HTML 검사 PASS. 실제 브라우저·터치·스크린리더 시각 인수 UX-HL-01-C/UX-HL-02-B2-B 계속 미완료. M5 현재 TASK, 거래/배포 승인 변경 없음.
- **모바일 계정 탭 UX TASK (2026-10-25): UX-HL-03-A1 로컬 완료.** 5개 탭 클릭/방향키/Home/End 이동 시 수평 overflow에서 선택 탭이 보이도록 스크롤 위치 보정, ARIA/키보드 포커스·계정 미연결 유지. 프런트 전체 93/93 PASS, JS/TS/HTML/CSP 검사 통과. UX-HL-03-A2/UX-HL-01-C/UX-HL-02-B2-B 실제 브라우저 인수는 도구 부재로 계속 미완료. 계정 API/지갑·거래 미연결, M5 TASK 및 push/배포 제한 불변.
- **모바일 계정 테이블 UX TASK (2026-10-25): UX-HL-03-B1 로컬 완료.** 활성 패널의 실제 표시 테이블이 모바일에서 가로로 넘칠 때만 스크롤 안내/키보드 진입점·ARIA 설명을 제공. 현재 지갑/백엔드 미연결 표에서는 안내가 숨겨진 상태 유지. 신규 10건, 전체 103/103 PASS, JS/TS/HTML/CSP 검사 통과. 실제 브라우저/스크린리더/터치 QA(B2/A2) 미완료; M5 current TASK·실거래/원격 push·배포 제한 불변.
- **차트 투명성/접근성 UX TASK (2026-10-25): UX-HL-01-E1 로컬 완료.** 64개 합성 MOCK 데이터에 근거 없는 실시간 08:00~18:00 라벨 제거, 샘플 순번·시장별 MOCK 최고/최저 및 SVG 연결 스크린리더 설명 추가. 6건 신규 포함 프런트 전체 109/109 PASS, JS/TS/HTML/CSP 검사 성공. 실제 브라우저/스크린리더 E2·C 인수 보류, 실계정/실거래·M5 현재 TASK 및 push/배포 제한 불변.
- **모의 체결 시각 정정 (2026-10-25): UX-HL-01-F1 로컬 완료.** 실제 체결 시간이 없는 9개 MOCK Recent Trades에서 임의 시간 제거, Sample #01~#09와 비실제 기록 명시. 프런트 112/112, JS/TS/HTML/CSP PASS. 실제 브라우저 F2/C/E2 인수 미완료, M5 current TASK와 실거래·push·배포 게이트 불변.
- **주문 수량 검증 UX TASK (2026-10-25): UX-HL-02-C1 로컬 완료.** validPreviewQuantity의 true/array/0x 수량 허용 암묵적 형변환 결함 수정, string decimal/1e-4 또는 number primitive만 허용. Market/Limit·입력 오류/focus 통합 4건 추가, 프런트 116/116 PASS, JS/TS/HTML/CSP 검사. 브라우저·실지갑/API 인수 보류, M5 current TASK 및 실거래·push·배포 제한 유지.
- **레버리지 입력 검증 UX TASK (2026-10-25): UX-HL-02-D1 로컬 완료.** Number(leverage)의 암묵 형변환으로 true/[3]/0x3을 수락하던 결함 수정, 정상 1..10 primitive/slider 문자열만 허용·원본 검증, 오류 ARIA/미리보기 차단·포커스. 프런트 121/121 PASS, JS/TS/HTML/CSP 통과. 실 브라우저 C2/D2/B2-B 보류, M5 current TASK 및 지갑/API/실거래·push/배포 제한 불변.
- **모의 호가 누적 Total 수정 (2026-10-25): UX-HL-01-G1 로컬 완료.** 기존 SYNTHETIC LIQUIDITY Total의 Size × 행번호 계산을 최우선 Ask/Bid에서 바깥쪽으로 누적 Size로 정정. 프런트 122/122 PASS, JS/TypeScript/HTML/CSP 검사 통과. 실제 브라우저 G2·기존 UX-HL-02-D2 인수 보류, M5 현재 TASK 및 API/지갑·실거래·push·배포 제한 불변.
- **합성 시장 ID 검증 수정 (2026-10-25): UX-HL-01-H1 로컬 완료.** sampleChart의 constructor/__proto__ 등 prototype 키 NaN 생성과 객체 강제 변환 문제를 프런트 모델/접근성 요약 경계에서 차단. 프런트 125/125 PASS, JS/TS/HTML/CSP 검사 통과. G2/H2 실제 브라우저 QA 미실행, M5 현재 TASK 및 실거래/API/지갑·push·배포 제한 불변.
- **동일 시장 재선택 주문 초안 보존 (2026-10-25): UX-HL-02-E1 로컬 완료.** 현재 BTC 재클릭 때 직접 입력한 Limit Price·오류/읽기 전용 검토 결과가 초기화되던 문제 수정. 실제 BTC→ETH 변경은 기존 MOCK 기준가/미리보기 초기화 유지. 프런트 127/127 PASS, JS/TS/HTML/CSP 검사 통과. 실제 브라우저 H2·E2 인수는 미완료, M5 현재 TASK/실거래·push·배포 제한 불변.
- **소액 주문 금액 표시 수정 (2026-10-25): UX-HL-02-F1 로컬 완료.** 유효한 최소 수량/가격에서 양수 명목가치·참고 증거금이 $0.00으로 표시되던 문제를 표시 전용 <$0.01 포맷으로 개선. 원래 산술 계산 불변. 프런트 130/130 PASS, JS/TS/HTML/CSP 검사 완료. 실제 브라우저 F2/E2/H2 인수 미완료, M5 현재 TASK·실거래/API/지갑·push/배포 제한 불변.
- **모의 샘플 변화율 정합성 수정 (2026-10-25): UX-HL-01-I1 로컬 완료.** 설정상 BTC +2.41% 등 MOCK 변화율과 실제 64개 합성 차트 샘플 변화율이 다른 오류를 수정. 첫/마지막 샘플 기준 BTC +1.33%, ETH +1.34%, SOL −1.28%를 마켓 카드·차트·지표/대체 설명에 적용. 프런트 132/132 PASS, JS/TS/HTML/CSP 완료. 실제 브라우저 I2/H2·주문 F2 인수 보류, M5 현재 TASK 및 API/지갑·실거래·push·배포 제한 불변.
- **모의 주문 방향·유형 재선택 상태 보존 (2026-10-25): UX-HL-02-G1 로컬 완료.** 현재 BUY/SELL 또는 MARKET/LIMIT 버튼을 다시 눌러 기존 읽기 전용 검토 결과가 사라지던 상태 전환 결함 수정, 실제 방향·유형 변경 시에만 기존 검토 무효화. 프런트 134/134 PASS, JS/TS/HTML/CSP 검사 통과. 브라우저 G2/I2/F2 인수 미완료, M5 current TASK 및 지갑/API·실거래·push/배포 제한 불변.
- **모의 주문 빠른 수량 재선택 상태 보존 (2026-10-25): UX-HL-02-H1 로컬 완료.** data-qty 재클릭 시 수량이 동일한데도 9항목 검토가 닫히던 결함 수정, 실제 다른 수량 선택만 이전 검토 무효화. 프런트 136/136 PASS, JS/TS/HTML/CSP 검사 통과. 브라우저 H2/G2/I2 인수는 미완료, M5 현재 TASK·실거래/API/지갑·push/배포 제한 불변.
- **모의 빠른 수량 ARIA 선택 상태 (2026-10-25): UX-HL-02-I1 로컬 완료.** CSS active만 존재하던 0.01/0.05/0.1/0.25 수량 버튼에 aria-pressed 초기/동적 상태를 추가, 직접 수량 입력으로 프리셋 선택 해제까지 반영. 프런트 138/138 PASS, JS/TS/HTML/CSP 검사 통과. 실제 브라우저·스크린리더 I2/H2 미완료, M5 TASK·실거래/API/지갑·push/배포 제한 불변.
- **거래 편의 기능 Reduce Only 비활성 UX (2026-10-25): UX-HL-04-A1 로컬 완료.** 인증된 포지션/잔량·서버 위험 검증 미연결로 Reduce Only checkbox를 설명과 함께 항상 비활성 표시. 프런트 전체 140/140 PASS, JS/TS/HTML/CSP 검증. 실제 거래/서명/API 미연결, 브라우저 A2 미완료, M5~M9 및 push/배포 제한 불변.
- **계정 증거금 미연결 UX (2026-10-25): UX-HL-04-B1 로컬 완료.** 주문 티켓의 Available/Reserved/Position Margin 3개를 — 미연결로 별도 표시하고 MOCK Indicative margin과 실제 계정 잔액의 차이를 설명. 프런트 143/143, JS/TS/HTML/CSP 검증 통과. 실브라우저 B2 인수 보류, 서버 인증/지갑/실자금·M5~M9/원격 push/배포 제한 불변.
- **모의 호가 깊이 시각화 정합성 (2026-10-25): UX-HL-01-J1 로컬 완료.** 호가 행 배경 막대가 누적 Total과 무관한 임의 비율을 사용하던 결함을 해당 측 합성 전체 수량 대비 누적 Total 비율로 정정. 프런트 144/144 PASS, JS/TS/HTML/CSP 검증. 실제 브라우저 J2/G2는 샌드박스 제한으로 미완료, M5~M9와 API/지갑·실거래·push/배포 제한 불변.
- **합성 호가 목록 접근성 의미 (2026-10-25): UX-HL-01-K1 로컬 완료.** 일반 div/span 행으로만 표시되던 가상 Order Book을 매수·매도 ARIA 목록/행으로 구분하고 시장·가격·Size·Total·비실주문 출처를 화면 수치에서 생성. 프런트 146/146, JS/TS/HTML/CSP 검사 통과. 실제 스크린리더 K2/J2는 샌드박스 제한으로 미완료, M5~M9·실거래/API/지갑·push/배포 제한 불변.
- **모의 최근 체결 목록 접근성 (2026-10-25): UX-HL-01-L1 로컬 완료.** 합성 Recent Trades 예시 9행에 시장·매수/매도 방향·가격·수량·샘플 순번·실제 기록 아님을 가시 수치에 따라 ARIA 목록/행 설명으로 부여. 프런트 148/148, JS/TS/HTML/CSP 검사 통과. 실제 보조공학 L2 인수는 브라우저 샌드박스 제약으로 미완료, M5~M9/지갑·API·실거래·푸시/배포 제한 불변.
- **가상 체결의 색상 외 방향 구분 (2026-10-25): UX-HL-01-M1 로컬 완료.** MOCK Recent Trades의 기존 가격 색상만으로 매수/매도 방향을 나타내던 문제 해결: 가시적인 Buy/Sell Side 열 추가 및 기존 ARIA 레이블/9개 샘플과 동기화. 프런트 150/150, JS/TS/HTML/CSP 검사 통과. 실제 브라우저 M2는 샌드박스 제한으로 미완료; M5~M9/지갑·API·실거래·push/배포 제한 불변.
- **가상 호가·체결 수량 단위 표시 (2026-10-25): UX-HL-01-N1 로컬 완료.** Order Book의 Size/Total과 Recent Trades의 Size 헤더에 BTC/ETH/SOL 선택 시장의 기초 자산 단위를 명시하고 시장 전환 시 동기화. 기존 가격/수량·MOCK 출처/계정·주문 계산 불변. 프런트 152/152, JS/TS/HTML/CSP 검사 PASS. 실제 브라우저 N2/M2는 샌드박스 제한으로 미완료, M5~M9·지갑/API/실거래·push/배포 게이트 불변.
- **모의 빠른 수량의 숫자 동치 UX (2026-10-25): UX-HL-02-J1 로컬 완료.** 0.050/5e-2처럼 수치적으로 같은 프리셋 재선택 시 수량 문자열·완료 검토를 유지하고 CSS active/aria-pressed를 유효한 수치 기준으로 동기화. 기존 검증 경계를 통과하지 못한 값은 미선택 유지. 프런트 154/154, JS/TS/HTML/CSP PASS. 실제 브라우저 J2·UX-HL-01-N2 미완료, M5~M9/지갑·API·실거래·push/배포 제한 불변.
- **합성 호가 MOCK Spread (2026-10-25): UX-HL-01-O1 로컬 완료.** 가상 Order Book의 형식적인 SPREAD DEMO 대신 실제 화면의 최우선 합성 매도·매수 가격 차액을 USD 통화 MOCK으로 표시하고 시장별 ARIA 설명 갱신. 프런트 156/156, JS/TS/HTML/CSP 검사 통과. 실제 호가/유동성·주문/API/지갑 연결 없음. 브라우저 O2/J2 인수는 샌드박스 제약으로 미완료, M5~M9·Push/배포 게이트 불변.
- **모의 차트 추세 색상 정합성 (2026-10-25): UX-HL-01-P1 로컬 완료.** SOL 하락 MOCK 샘플에도 SVG 선/점/면적이 녹색 고정이던 결함을 기존 시계열의 상승/하락 신호와 일치하도록 수정. 전체 프런트 158/158, JS/TS/HTML/CSP PASS. 실브라우저 O2/P2는 샌드박스 제약으로 미완료, M5~M9/지갑/API/실거래·Push/배포 제한 불변.
- **직접 수량 입력의 DEMO 검토 보존 (2026-10-25): UX-HL-02-K1 로컬 완료.** 검토 후 0.05↔0.050↔5e-2 등 유효 수치 동치 입력에서 완성된 검토를 유지. 실제 수량 변경/부적합 입력은 계속 무효화하고 이미 닫힌 검토는 재표시하지 않음. 전체 프런트 160/160, JS/TS/HTML/CSP PASS. 실브라우저 P2/K2 보류, M5~M9/지갑·API/실거래·Push/배포 제한 유지.
- **Limit Price 수치 동치 검토 유지 (2026-10-25): UX-HL-02-L1 로컬 완료.** DEMO Limit 검토 후 유효한 60000.50↔60000.5의 표기 변경 시 리뷰 유지. 실제 가격 변경·부적합 입력은 기존처럼 무효화하며 이미 숨긴 리뷰 자동 복귀 없음. 전체 프런트 162/162, JS/TS/HTML/CSP PASS. 실브라우저 P2/K2/L2는 샌드박스 제약으로 미완료, M5~M9·지갑/API/실거래·push/배포 제한 유지.
- **DEMO 주문 방향 화살표 정합성 (2026-10-25): UX-HL-02-M1 로컬 완료.** Short/Sell에서도 상승 ↗ 화살표를 표시하던 오류를 Long ↗/Short ↘로 수정. 프런트 164/164, JS/TS/HTML/CSP PASS. 실브라우저 P2/L2/M2 인수는 샌드박스 제약으로 미완료, M5~M9·지갑/API/실거래·Push/배포 제한 유지.
- **브라우저 탭의 거래 대상 시장 식별 (2026-10-25): UX-HL-01-Q1 로컬 완료.** BTC/ETH/SOL 전환해도 고정된 거래 데모 탭 제목 문제를 초기 BTC 제목과 document.title 시장 ID 동기화로 수정. DEMO 고지 유지, 전체 프런트 166/166 및 JS/TS/HTML/CSP PASS. 실제 Chromium Q2 인수는 샌드박스 제한으로 미완료, M5~M9/지갑/API·실거래·push/배포 게이트 유지.
- **레버리지 동일값 input 이벤트와 DEMO 검토 (2026-10-25): UX-HL-02-N1 로컬 완료.** 레버리지 슬라이더의 값이 바뀌지 않아도 input 이벤트가 발생하면 검토가 닫히던 결함 수정. 검토가 보이고 값이 유효·동일한 경우에만 보존, 실제 변경·invalid·닫힌 리뷰는 무효화. 프런트 168/168, JS/TS/HTML/CSP PASS. 브라우저 Q2/N2는 샌드박스 제한으로 미완료, M5~M9·지갑/API·실거래·push/배포 제한 유지.
- **계정 ready 행 오류의 UI fail-closed (2026-10-25): UX-HL-03-C1 로컬 완료.** 검증된 조회 어댑터가 비정상 ready 행(null·primitive·예외 접근자)을 넘겨도 계정 탭 렌더가 예외 중단되지 않고 이전/부분 행을 지운 뒤 명시적 error 표시. 정상 스냅샷 복구 가능. 프런트 170/170, JS/TS/HTML/CSP PASS. 실브라우저 C2는 샌드박스 제약으로 미완료, 정적 미연결 UI와 M5~M9/지갑/API/실거래·push/배포 제한 유지.
- **계정 조회 스냅샷 오류의 전 탭 일관성 (2026-10-25): UX-HL-03-D1 로컬 완료.** coordinator.get(id) 중간 조회 예외로 기존 ready 행이 남지 않도록 다섯 탭 모두 사전 수집 후 렌더링하고, 실패 시 전체 행 삭제/인증된 경로 error·정적 미연결 경로 disconnected 전환. 프런트 172/172, JS/TS/HTML/CSP PASS. 실브라우저 C2/D2는 샌드박스 제한으로 미완료, M5~M9·지갑/API/실거래·push/배포 차단 유지.
- **계정 스냅샷 속성 접근 오류의 UI fail-closed (2026-10-25): UX-HL-03-E1 로컬 완료.** 인증된 조회의 snapshot.state/records 접근이 예외를 던져도 이전 계정 행을 삭제하고 error로 전환, 정상 스냅샷 복구 가능. 정적 계정 미연결 및 M5~M9·지갑/API/실거래·push/배포 금지 불변. 프런트 174/174·JS/TS/HTML/CSP PASS, 실브라우저 D2/E2 인수 보류.
- **계정 공급자 미검증 조회 차단 (2026-10-25): UX-HL-03-F1 로컬 완료.** allowValidatedRecords!=true 기본·허용 철회 경로에서도 coordinator.get을 호출하던 결함 수정. 미검증 계정 공급자 조회 없이 기존 행 제거/전체 disconnected 표시, 인증된 경로는 불변. 프런트 176/176·JS/TS/HTML/CSP PASS. 실브라우저 E2/F2 보류, M5~M9·지갑/API/실거래·push/배포 제한 유지.
- **주문 조회 상태·원자 수량 정합성 (2026-10-25): UX-HL-03-G1 로컬 완료.** 미래 검증된 계정 Order History의 FILLED는 전체 체결을, Open Orders의 OPEN은 양수 잔량을 요구해 수량·상태 모순 차단. CANCELED 부분 체결 허용. 프런트 178/178, JS/TS/HTML/CSP PASS. 실계정 UI·신뢰 API/Chromium G2 미완료, M5~M9·지갑/API·실거래·push/배포 제한 유지.
- **동일 revision 계정 조회 충돌 차단 (2026-10-25): UX-HL-03-H1 로컬 완료.** 동일 revision의 상충 주문/계정 행을 이전 성공 records와 비교하여 차단. 같은 내용은 재조회 허용, 충돌 시 error/빈 기록, 더 높은 revision 수락. 프런트 180/180·JS/TS/HTML/CSP PASS. 신뢰된 API/실브라우저 G2/H2 보류, M5~M9·실거래·push/배포 금지 유지.
- **계정 레코드 검증/저장 값 일치 (2026-10-25): UX-HL-03-I1 로컬 완료.** 외부 레코드 속성이 getter 호출마다 달라질 때 검사 값과 frozen 출력이 어긋나는 결함을 필드 1회 캡처 후 검증으로 수정. 프런트 182/182, JS/TS/HTML/CSP PASS. 신뢰된 계정 API/실브라우저 H2/I2 보류, M5~M9·지갑/API/실거래·push/배포 게이트 유지.
- **계정 응답 envelope 검증/저장 정합성 (2026-10-25): UX-HL-03-J1 로컬 완료.** raw.revision/raw.records 속성 재읽기에 따라 검증 안 된 revision이 저장되거나 100행 상한이 우회되는 결함을 7개 응답 필드 1회 캡처 후 검증으로 수정. 프런트 184/184, JS/TS/HTML/CSP PASS. 신뢰 계정 API/실브라우저 I2/J2 보류, M5~M9·지갑/API·실거래·push/배포 게이트 유지.
- **계정 조회 세션 출처 검증 일관성 (2026-10-25): UX-HL-03-K1 로컬 완료.** source getter를 검사 후 재읽어 VERIFIED_TESTNET 검사 뒤 MOCK_SAMPLE을 세션에 저장·수용하던 경로를 1회 캡처로 차단. 프런트 186/186, JS/TS/HTML/CSP PASS. 인증 API/실브라우저 J2/K2 보류, M5~M9·지갑/API/실거래·push/배포 제한 유지.
- **거래 레버리지 눈금 실제 위치 정렬 (2026-10-25): UX-HL-02-O1 로컬 완료.** 네이티브 1~10 범위 대비 1×·3×·5×·10× 균등 배치로 사용자가 잘못 읽을 수 있던 CSS 위치 수정. 3× 약 22.22%, 5× 약 44.44%로 정렬, 원래 거래 DEMO 로직 유지. 프런트 188/188, JS/TS/HTML/CSP PASS. 실제 Chromium O2/인증 API J2는 미완료, M5~M9·실거래·push/배포 금지 유지.
- **MOCK 스프레드 수치의 접근성 동기화 (2026-10-25): UX-HL-01-R1 로컬 완료.** 화면에 보이는 BTC/ETH/SOL 합성 스프레드 금액이 aria-label에 빠지던 결함을 수정하여 USD 금액과 비실제 호가 안내를 보조공학에도 전달, no-script 미계산 이름 제공. 프런트 190/190·JS/TS/HTML/CSP PASS. 실제 Chromium R2/레버리지 O2 미완료, M5~M9·지갑/API·실거래·push/배포 제한 유지.
- **거래 UX 핵심 레퍼런스: Hyperliquid** (2026-10-25). 서명 주문·위험/마진·차트·호가·포지션/주문 기록의 UX에 우선 참고. 메인/거래 화면 분리 유지, P0~P2 구현 TASK와 미연결·모의 정보 표시 기준은 `docs/architecture/HYPERLIQUID-UX-REFERENCE.md`에 정의. 개발 기준 지정은 신규 기능 구현 완료나 배포 승인을 의미하지 않는다.
- 상태: M2-T4 로컬 완료 (A 코어/B 영속 매칭/C API 자동 체결/D 검증된 정산 원장 후보 어댑터); M2-T5-A~E 로컬 검증 완료 (E HTTP→체결→Outbox→정산 후보→모의 영수증 종단간 인수). 실제 PostgreSQL 15 임시 개발 서버의 복수 연결 검증과 Foundry 로컬 회귀 완료; 경제/위험 정책·실체인 정산·운영/스테이징 DB는 미승인/미완료
- 최근 완료: M1 전체 및 M2-T1/T2/T3/T4 로컬 완료. M2-T5-A policy-gated 영속 Settlement Outbox, 동시 claim·lease fencing·retry·DB 재시작 복구 구현. M2-T5-C 영속 dry-run/ABI 인코딩·중복 의도 차단/UNKNOWN 격리 구현, M2-T5-E 신규 HTTP~정산 전 단계 E2E 통합 테스트 3개 포함 백엔드 전체 149/149 통과 및 TypeScript 검사 성공 (2026-10-24). 임시 실제 PostgreSQL 15 다중 연결 4/4×3 및 Foundry 35/35 검증 추가 완료; 스테이징/운영 PostgreSQL QA 별도 이관
- 다음 작업은 사람 확인/승인 필요: 실제 스테이징/운영 PostgreSQL의 정책·백업·멀티프로세스/001~007 인수 (임시 개발용 DB 서버는 검증 후 정지), 정책/리스크·승인자/자산/금액 결정, 실제 체인 정산 실행과 read-only 영수증/settledTrades·최종성 통합, 운영 배포·push. 로컬 PostgreSQL 복수 연결 및 Foundry 테스트는 현재 완료. 검증 가이드 `docs/releases/M2-LOCAL-ACCEPTANCE.md`. 미확정 신규 기능을 임의로 생성하지 않음. M2-T5-A는 policy-gated Outbox/임대·재시도 기반으로 로컬 완료. 운영 PostgreSQL 멀티프로세스 및 003/004/005/006/007 마이그레이션은 환경/승인 준비 시 별도 수행
- 사람 확인 필요: 개발용 PostgreSQL 15.19는 별도 임시 Unix socket 클러스터에서 다중 연결을 검증했지만, 운영/스테이징 DB의 멀티프로세스/권한/백업 및 마이그레이션은 여전히 미실행. 신규 `005_settlement_outbox.sql`/`006_settlement_intents.sql`/`007_settlement_reconciliations.sql` 운영 마이그레이션도 미실행. 실제 시장별 토큰·정밀도/마진·위험·수수료 정책과 신뢰된 정책 승인자/금액은 운영자 확인이 필요하며 자동 생성·승인하지 않음. M2-T5-B는 정책 입력과 체결별 EIP-712 서명 검증만 구현. Foundry 1.8.5 로컬 테스트 35/35 통과, Solidity invariant 128,000 calls 통과. 실제 배포/체인 RPC/영수증 검증은 미실행. 명시적으로 승인된 임시 PostgreSQL/Foundry 로컬 QA는 완료했으며, 실제 릴리스/온체인 연결은 추가 사람 승인 및 외부 환경 준비 대기. 운영/스테이징 DB 실제 마이그레이션·API 배포·Sepolia broadcast는 승인 없이 수행하지 않음. 원격 push는 AutoPilot 작업에서 제외한다.

## 2026-10-24 M5-T3-C3-C2-B2-B1 — SQL 015~020 트리거 31종 로컬 카탈로그 검사

- Git HEAD 036d9b7과 작업 트리 clean 상태, C3-C2 작업 문서 확인. 전용 PostgreSQL 서버 소켓과 서버 실행 바이너리가 여전히 없으므로 기존 운영·스테이징 DB에 연결하거나 서버 설치·권한 우회를 하지 않음.
- 신규 qa/postgres-signed-trigger-attestation.ts: signed SQL 015~020 트리거 31개에 대해 실제 카탈로그 metadata로 활성/함수/스키마/테이블/ROW·이벤트/BEFORE·AFTER/지연 COMMIT/SECURITY DEFINER 부재 검증.
- 신규 test/postgres-signed-trigger-attestation.test.ts: 변경·비활성/누락·지연 속성 위조 실패, versioned SQL manifest 대응 및 새 PGlite QA schema SQL 001/008~020 적용 뒤 실제 pg_catalog 합치성 테스트.
- 독립 전용 PostgreSQL QA 하네스에 트리거 검사 단계 연결. 부분 체결 및 실자금/실체인 기능·운영 SQL은 변경하지 않음. 실제 PostgreSQL 세션·제한 역할 인수는 미실행; 다음 C3-C2-B2-B2에서 안전한 전용 PG가 있을 때만 검증.
- 검증: 신규 트리거 감사 11/11 PASS, 관련 8개 테스트 파일 77/77 PASS, TypeScript build PASS, PGlite 실제 pg_catalog 통합 인수 PASS. 실 PostgreSQL 멀티세션/role 검증은 미실행.

## 2026-10-24 M5-T3-C3-C2-B2-A — 읽기 전용 DB 감사자 역할 인수 검증기

- 실제 Git HEAD ad61fcf/클린 상태에서 시작, 문서 및 QA 재확인. 프로젝트 전용 /tmp/perpdex-pg-*/socket의 실제 server socket과 postgresql server 실행 파일이 없는 상태 확인. 운영/스테이징 DB 접속·설치·권한/역할 조작 없음.
- 신규 qa/postgres-signed-role-permissions.ts: pg_catalog의 role·보호 테이블 12종 실효 권한을 오직 parameterized SELECT로 수집, superuser/DDL/OWNER/GRANT 경유 권한/SECURITY DEFINER/쓰기/트리거 권한을 가진 역할은 fail-closed하는 순수 읽기 전용 감사자 평가.
- 신규 test/postgres-signed-role-permissions.test.ts에서 실제 DB 없이 역할 플래그/권한/누락값·카탈로그 위조·SQL 파라미터 안전성 테스트, 기존 QA 하네스에는 현재 schema owner는 제한 감사 역할을 통과하지 못한다는 음성 판정 추가.
- 권한 인증은 읽기 전용 감사 역할 후보의 메타데이터 정합성만 평가한다. 실제 별도 PG 연결·권한 검사, 쓰기 권한이 필요한 체결 실행 역할, 데이터베이스 owner 권한 보호는 별도 인수 대상. 부분 체결 실행 경로 미변경.
- 다음 C3-C2-B2-B: 안전한 독립 PostgreSQL 서버가 실제 가용하고 승인되면 한정 역할과 독립 세션에서 검증. 현재 환경에서 설치/권한 우회 금지.
- 검증: TypeScript build PASS, 읽기 전용 권한 정책 신규 7/7, 기존 socket guard 4/4, 관련 signed M3/M4·취소·전량 체결·C3-A/C3-C1 순차 회귀 총 66/66 PASS. 실제 PostgreSQL 독립 접속·role 실효 권한 인수는 미실행.

## 2026-10-24 M5-T3-C3-C2-B1 — 실제 PostgreSQL 경합용 opt-in QA 하네스

- Git HEAD 4113b1a 및 클린 상태에서 시작. 프로젝트·기존 QA 검토 후 이전 private PostgreSQL 서버 소켓(/tmp/perpdex-pg-*/socket)과 서버 실행 파일(pg_ctl/initdb/postgres) 미존재 확인. 운영 DB 미접속, 설치·권한 우회 금지.
- 신규 qa/postgres-signed-margin-guard.ts: 테스트 전용 socket·신규 schema·명시적 seed phase만 허용; 미존재 socket/잘못된 경로 즉시 종료.
- 신규 qa/postgres-signed-margin-concurrency.test.ts: 전용 테스트 DB/user/TCP disabled 확인, 독립 PG backend 2개 확인 후 001/008~020을 신규 QA schema에만 적용하는 별도 실행 하네스. signed 동시 admission·nonce 중복·cancel/admit·full/cancel·직접 SQL tamper 시나리오 포함. 운영/스테이징 미사용.
- 이번 회차 **실제 PostgreSQL 다중 세션·최소권한 role QA는 미실행**. 오프라인 guard unit/TypeScript build 및 기존 PGlite 회귀만 실행. 다음 C3-C2-B2는 안전한 전용 PG 확보 조건부.
- 검증: TypeScript build PASS, guard 4/4 및 signed M3/취소/FULL 회귀 37/37, C3-A/C3-C1 회귀 18/18; 총 59/59 PASS. 미존재 private socket에서 PG QA fail-closed 확인. 실제 PG/운영 DB 연결 없음.

## 2026-10-24 M5-T3-C3-C2-A — signed account M3 집계 커밋 제약

- 신규 SQL 020 `assert_signed_account_margin_conservation` 및 4종 지연 COMMIT 트리거: 서명 주문이 존재하는 계정/시장/담보에 대해 OPEN signed IM 책임 ≤ RESERVED 잔고, 기존 FILLED signed IM 책임 ≤ POSITION 잔고, 양쪽 버킷 잔고 = M3 append-only posting 누적합, 서명/비서명 M3 분개의 총량 보존을 강제한다.
- M3 operation 당 계정·액션·from/to 경로·양쪽 분개(0/1) 금액/부호·소유자가 완전한지 검사한다. 동일 계정에 별도로 존재하는 비서명 M3 RESERVED는 signed 예약분으로 오인하지 않는다. 관리자 마이그레이션 실행 전에 기존 signed 계정의 장부 부정합을 오류로 보고한다.
- 기존 SQL 015~019 및 EIP-712·nonce·터미널 전량 체결·취소/증거금 할당 경로는 수정하지 않았다. 신규 부분 체결 활성화 또는 실입금/실자금 이동은 없음.
- 다음 C3-C2-B: 실제 로컬 개발 PostgreSQL 다중 연결·role 격리 QA로 외부 세션 간 예약/취소/체결 경합과 관리자 이전 데이터 검증을 별도 수행한다. 정책 없는 부분 체결 모델 C3-C3는 여전히 미구현이다.
- 검증: 신규 PGlite 집중 14/14 PASS, 관련 12개 파일 순차 회귀 129/129 PASS, TypeScript 빌드 PASS, SQL 001~020 로컬 전체 마이그레이션 20/20 PASS. 전체 npm test 및 실제 PostgreSQL 멀티세션은 미실행.

## 2026-10-24 M5-T3-C3-C1 — signed 주문 영속 수량 프로젝션 및 FULL-only 경계

- 신규 SQL 019 `perp_signed_order_fill_progress`: 원래 서명 수량과 SQL 016/017 **완료된** BUY/SELL terminal 영수증만 이용해 order 단위 누적 체결/미체결/실행 가능 수량을 재구성. PREPARED는 체결량 0이며 취소된 수량은 미체결로 보존하되 실행 가능량은 0이다.
- SQL 019 deferrable COMMIT 트리거: OPEN(0 filled), CANCELED(0 filled), FILLED(1회 전량) 및 total=filled+unfilled, uint256 한도를 강제. 기존 SQL 015~018의 서명·nonce·M3 이중분개·M4/OI 영수증을 변경하지 않음. 마이그레이션 시 기존 signed 주문 전량 검증.
- 신규 `backend/src/perp/signed-sim-fill-progress.ts`는 체결 가능 인증이 아닌 읽기 전용 order 단위 영속 수량 감사 결과를 제공하며 partial/실제 실행 권한 모두 false. 복수 OPEN 주문은 주문별 개별 상태를 유지.
- 다음 C3-C2: 여러 OPEN/종료 주문이 공존하는 계정의 누적 M3 예약금 책임/취소 레이스를 DB 레벨에서 강화. C3-C3: 부분 fill과 잔여 IM 배분·부분 취소에 필요한 정책/영수증 설계 이후 실행 구현.
- 검증: 신규 focused 9/9 PASS, 관련 순차 회귀 115/115 PASS, TypeScript build PASS, SQL 001~019 로컬 migration 19/19 PASS. 전체 npm test 및 실제 PostgreSQL 다중 세션 미실행.

## 2026-10-24 M5-T3-C3-B — signed 취소 원자 영수증 및 DB 커밋 무결성

- 신규 `backend/sql/018_perp_signed_cancel_integrity.sql`: 서명 취소의 영속 불변 receipt와 주문/nonce CANCELED·M3 RESERVED→AVAILABLE RELEASE operation 및 이중분개를 deferred COMMIT에 결속. 취소 후 RESERVED 잔고와 M3 signed_delta 누적값도 검사. SQL 018 재적용 및 과거 무영수증 취소의 안전한 마이그레이션 거부.
- `backend/src/perp/sim-order.ts`: 사용자 EIP-712 v2 서명 확인 이후 기존 nonce·status·M3 RELEASE와 같은 TX에 cancel digest/signature 포함 영수증 INSERT. SQL 017 존재·018 미설치 상황은 fail-closed; 구형 단일 M3 테스트 스키마 호환은 유지.
- 기존 C3-A가 재현한 '상태+nonce만 위조 CANCELED로 커밋' 결함을 SQL 018 설치 DB에서 차단. C3-A 감사는 여전히 read-only이며 CANCELED RELEASE 검증에 재사용. 아직 운영 DB/실제 PG 다중 세션 적용·보안 역할별 DML 권한/배포는 수행하지 않음.
- 다음 C3-C: 복수 OPEN 예약 상태와 부분 fill 잔여 책임을 먼저 검증 가능한 TASK로 나누고, 기존 FLAT 전량 체결과 SQL 015~018 보호를 훼손하지 않는다.
- 검증: C3-B 신규 PGlite 10/10 PASS, 관련 회귀 106/106 PASS, TypeScript build PASS, PGlite 001~018 마이그레이션 18/18 PASS. 전체 npm test·실 PostgreSQL 다중 연결 검증은 미실행.

## 2026-10-24 M5-T3-C3-A — signed 주문·M3/M4 회계 책임 읽기 전용 감사

- 신규 `backend/src/perp/signed-sim-account-reconciliation.ts`: 신뢰된 시장/오라클과 DB 거래를 기준으로 각 계정의 OPEN 예약 부채, CANCELED 확정 RELEASE, FILLED terminal·M3 ALLOCATE 및 RESERVED/POSITION 잔고를 교차 점검하고 M4 원가/mark 기반 realized/unrealized PnL을 읽기 전용으로 표시. fees/funding 미정산, 재사용 가능한 실행 권한 없음.
- **발견된 보안 공백**: 직접 SQL이 `order_nonces`와 `perp_sim_orders` 상태를 동시에 CANCELED로 변경하면서 M3 RELEASE를 생략해도 기존 SQL 015~017에서 COMMIT되는 사례 확인. 새 감사기는 이 불일치를 거부함. **다음 C3-B에서는 SQL 커밋 시점 불변식 및 영속 취소 영수증 도입으로 원천 차단**. 실제 코인 이동/운영 적용 없음.
- TASK: `docs/tasks/M5-T3-C3-signed-account-reconciliation/`, M5-T3-C3 전체 완료 아님.
- 검증: C3-A 신규 9/9 PASS, 관련 9개 파일 회귀 96/96 PASS, TypeScript build PASS, Git diff check. 전체 npm test·실 PostgreSQL 다중 세션 미실행.

## 2026-10-24 M5-T3-C2-B2-B — 서명된 양측 전량 opening 모의 체결 원자 커밋

- 신규 SQL 017은 `perp_sim_orders` OPEN→FILLED 상태 전이와 `perp_signed_pair_executions` terminal 영수증을 연결하고 양측 M3 RESERVED→POSITION allocation 분개, M4 paired fill/포지션/OI 및 nonce USED를 DB COMMIT에서 대조한다. 기존 015 안전 장치는 유지하면서 검증된 terminal receipt가 있는 전체 전량 체결에만 통과 범위를 추가한다.
- 새 `backend/src/perp/signed-sim-pair-execution.ts`는 기존 PREPARED를 승인으로 사용하지 않고 새 TX에서 서명/정책/오라클/M3·M4·M5 위험을 다시 증명한다. 시장/계정 잠금과 주문 전량/FLAT·계정별 1건 OPEN 제한 후 양측 M4/OI, M3 할당, terminal 영수증, 주문 FILLED를 한 TX로 기록한다. 반환 `executionAuthorized:false`는 실제 자금/온체인 권한이 없음을 의미한다.
- SQL 017의 쌍/원장/position COMMIT 검증은 원장 버킷 합계와 사후 직접 변조를 차단한다. 본 경로는 API·실거래·실자금·운영 배포·원격 push와 연결되지 않는다. 부가 회계/부분·청산은 C3, 임시 실제 PG 다중 세션·role QA는 M5-T4.

- 검증: 신규 focused 13/13 PASS, TypeScript build PASS, 이전 관련 회귀 84/84 PASS. SQL 017은 영속 재시작·동시 중복·취소 경합·원장/시장 OI SQL 변조 차단까지 검증. 전체 npm test는 이번 회차 미실행.

## 2026-10-24 M5-T3-C2-B2-A — 양측 서명된 opening 후보 PREPARED 영속 기록

- 신규 `backend/sql/016_perp_signed_pair_preparations.sql`은 BUY/SELL signed v2 OPEN 주문의 공통 fillId·가격·전량·계정·config hash·oracle·현재 OI 버전·M3 RESERVED 책임을 FK/지연 트리거로 검증하는 append-only **PREPARED 후보 감사 기록**. 체결 영수증, 자금 이동, 주문 소진 또는 실행 권한이 아니다.
- `backend/src/perp/signed-sim-pair-gate.ts`의 C2-A 검증을 동일 트랜잭션 안에서 재사용하도록 분리하고 `preparePersistedSignedSimPerpPair`를 내부 SIMULATION_ONLY로 추가. 반드시 FLAT 양측, signed 전량과 서명·nonce·정책·M3/M4/M5 전부 재검증 후 record만 INSERT. `executionAuthorized:false` 강제.
- SQL 015 차단 트리거는 변경하지 않음. 사용자 서명으로 정상 취소 시 PREPARED는 과거 기록으로 남으며 현재 체결을 허가하지 않음. 다음 C2-B2-B에서 실시간 재검증 후 서명 주문 소비·M3 할당·M4/OI 양측 영수증을 엄격한 단일 TX/DB 제약으로만 구현.
- 새 테스트 `backend/test/perp-signed-pair-preparation.test.ts`. 운영 DB/체인/실자금/배포/원격 push 변경 없음.

## 2026-10-24 M5-T3-C2-B1 — signed opening 영속 SQL 안전 경계

- 신규 `backend/sql/015_perp_signed_opening_fence.sql`: 기존 C2-A 서명 OPEN 주문을 기준으로 COMMIT 단계에서 nonce 상태/주문 고정 속성·M3 RESERVE 이중분개·OPEN 예약금 합계의 RESERVED 버킷 하한을 검증한다. 직접 SQL 주문 삭제/서명 필드 변조·원장 이력 UPDATE/DELETE 금지.
- 기존 legacy M4 포지션 변경·PAIRED 체결/미연계 M3 ALLOCATE가 아직 OPEN 상태인 signed shadow 주문의 예약을 우회하려 할 경우 COMMIT 실패. 정상 서명 입장/취소, 무관 계정의 기존 M4 모의 체결은 유지된다. C2-B1은 **안전 차단만 수행**, 새 실행 권한/실제 signed pair fill/자금 이동은 여전히 없다.
- `backend/scripts/migrate.ts`에 015 등록(관리자 수동 실행 목록일 뿐, 운영 DB/실서버 미적용). 테스트 `backend/test/perp-signed-fence.test.ts`에서 로컬 PGlite만 사용. 기존 trigger 권한을 변경하거나 DDL/슈퍼유저 우회 방어를 주장하지 않는다.
- 다음 작업 `M5-T3-C2-B2`: 실용 안전 영수증/원자 쌍 체결 및 상태 전이 구현, 기존 차단 트리거를 명확한 커밋 검증 영수증에서만 통과하도록 수정. 기존 주문 CANCEL만으로 실행 권한이 발생하지 않는 것은 별도 보안·인증 경계로 확인해야 하며, 실제 PostgreSQL 권한/다중 트랜잭션 QA는 M5-T4로 남긴다.

## 2026-10-24 M5-T3-C2-A — 서명 양측 후보 체결의 공통 가격·원장·리스크 검증

- 신규 backend/src/perp/signed-sim-pair-gate.ts: 서로 다른 BUY/SELL EIP-712 v2 서명 주문을 공통 후보 fillId/가격/수량으로 검증하고 M4 PAIRED OI row를 선점 잠금. 양측 M3 영속 예약·nonce·분개, M4 position/version/OI, M5 후보 가격 기준 risk를 한 트랜잭션에서 계정 주소순으로 재평가하는 **읽기 전용** 서비스. 기존 fillId 재사용, self-match, 가격·수량·서명·취소·원장 변조를 거부.
- 기존 C1 evaluator는 내부 트랜잭션 내 재사용 가능하도록 분리하며 C1 외부 API 호환성을 유지. 신규 PGlite 양측 검증 6/6 통과, TypeScript build PASS. 전체 348개 테스트는 단일 npm test 240초 제한으로 229개까지 실행 후, 첫 부분 194개와 후반 154개로 분할하여 전 범위 PASS 확인. 실행 권한은 executionAuthorized:false 고정, 실제 M4 fill/M3 RESERVED→POSITION 이동/주문 소진 미구현.
- 후속 **M5-T3-C2-B**에서 commit-time SQL 보호를 포함한 제한된 양측 원자 기록 구현; C3에서 부분체결·PnL/fee/funding/취소 경합, M5-T4 실 PG QA. 승인되지 않은 운영 환경/실 자금/체인/원격 push 불가.
- TASK 문서: docs/tasks/M5-T3-C2-signed-paired-clearing/

## 2026-10-24 M5-T3-C1 — 서명 M3 주문 증거금 및 M4/M5 위험 단일 TX 인수

- 새 `backend/src/perp/signed-sim-risk-gate.ts`: EIP-712 v2 **non-reduce-only** signed shadow order, M3 nonce/OPEN order/RESERVE 이중분개 및 margin AVAILABLE/RESERVED/POSITION 버킷, M4 position snapshot·market paired OI, M5 pre/post BigInt IM/MM/Equity/Leverage를 **한 DB transaction에서 검증**하고 `executionAuthorized:false` 위험 리포트만 반환한다. Reduce-only guard 계정 및 market/position/nonce/policy/oracle 불일치·예약금 이중사용은 fail-closed. 기존 HTTP/M2/M4 양측 체결/M3 돈 이동과 **연결하지 않음**.
- `backend/src/perp/sim-order.ts`의 원래 signed v2 admission 인증·정책/IM 수식을 재사용 함수로 분리, 기존 admission 테스트 보존. 신규 PGlite **13/13 PASS**, 전체 백엔드 **342/342 PASS**, TypeScript build 성공. 테스트를 `backend/test/perp-signed-risk-gate.test.ts`에 추가. 문서 `docs/tasks/M5-T3-C1-signed-collateral-risk-gate/`.
- 다음 **M5-T3-C2**는 양측 signed opening order와 실제 M4/OI 체결·M3 예약금 책임을 *체결 시점* 하나의 TX에 결속. C1 사전평가를 실행 권한으로 사용 금지. C3에서 margin bucket allocation·부분 예약/실현 PnL/fee/funding·인출 위험 종합검증. 실 PostgreSQL 역할/다중 연결 QA는 M5-T4. 운영 DB·실자금/체인·배포·Push 불가.

## 2026-10-24 M5-T3-B3-B — 예약/guard/event 직접 SQL 변조 방어

- `backend/sql/014_perp_reduce_ledger_integrity.sql`: 예약 주문 신원/오라클·정책 해시 불변성, 주문/guard DELETE 금지, guard·주문·이벤트 세 테이블의 커밋 시점 합계·정책/버전·포지션 용량 검증. B3-A의 013 포지션 방어에서 누락된 **guard/order/event만 직접 SQL로 수정하는 우회**를 실제 실패-우선 테스트 4개로 재현하고 차단. M4 양측 영수증이 있는 소진과 순수 shadow 소비를 구분하여 B1/B2 원자 체결 흐름 유지.
- `paired-clearing.ts`는 보호된 체결 시 013 및 014 active trigger를 필수 확인. DB 최소권한 역할·기존 데이터 인수 점검은 `docs/tasks/M5-T3-B3-B-reduce-ledger-integrity/ROLE_POLICY.md`에 설계로만 기록, **실계정·운영/외부 PostgreSQL 접근·권한 변경 없음**. 신규 PGlite 보안 회귀 **7/7**, 전체 백엔드 **329/329 통과**·빌드 성공. 실 PostgreSQL role/멀티 연결 시험은 현재 환경의 PG 실행 파일 부재로 후속 M5-T4. 다음 M5-T3-C는 SIMULATION_ONLY 서명 주문+M3 증거금/실현 손익 원자 화해.

## 2026-10-24 M5-T3-B3-A — 저수준 영속 포지션 무단 쓰기 차단

- 신규 `backend/sql/013_perp_guarded_position_commit.sql`에서 guard가 존재하는 SIMULATION_ONLY 포지션의 DB COMMIT 단계에 snapshot/guard 동등성·M4 paired fill·M5 reservation CONSUME 동일 ID·수량·시장/계정/담보 결속, 시장 LONG=SHORT=OI 정합성 검사. 직접 SQL 수정/저수준 writer 우회가 이전에는 커밋되던 문제 3건을 먼저 실패 테스트로 재현한 뒤 차단. `paired-clearing.ts`의 caller supplied `guarded:boolean` 삭제, 예약 주문 ID·정책/마진/가격 재검증 + 013 활성 상태 필수. B1/B2 모의 체결 경로 계속 지원.
- 신규 보안 회귀 **8/8 PASS**, 전체 백엔드 **322/322 PASS**, 빌드 성공. 후속 **B3-B**: DB 실 역할 최소 권한, guard/orders/event 직접 변조 보호, 013 이관 시 기존 데이터 사전 정합성 점검. 운영 DB 직접 SQL·슈퍼유저 권한/실자금·체인·배포·push는 미허용.

## 2026-10-24 M5-T3-B2 다중 예약·부분 체결 원자 화해

- 신규 `backend/src/perp/partial-reserved-paired-clearing.ts`는 기존 PAIRED 시장의 양측 SIMULATION_ONLY reduce-only 주문에 대해 **다중 OPEN 예약을 유지하면서 일부 수량만 체결**하고 M4 양측 포지션/공통 fillId·OI, M5 주문별 reserved→consumed 이벤트, 다른 미체결 주문의 새 position version/risk 검사를 한 TX에 묶음. 시장 OI → 주소순 guard → 포지션 → 마진 버킷 잠금 순서 유지. 이후 `SUM(OPEN remaining)<=abs(new position.size)` 필수. 과거 체결 없는 A-stage shadow consume를 실제 M4 fill로 인정하지 않음. 불일치·경합·SQL 장애 시 전체 rollback.
- 신규 B2 PGlite **13/13**, 백엔드 전체 **314/314 통과** 및 TypeScript 빌드 성공, 문서 `docs/tasks/M5-T3-B2-partial-reservations/` 추가. **SIMULATION_ONLY / M3 돈 이동·M2 주문·온체인 미연결**. 다음 M5-T3-B3는 공개 writer뿐 아니라 저수준 SqlRunner 경로/DB 직접 SQL 우회까지 보안 경계 강화, 이후 M5-T3-C margin+order 원자 통합/M5-T4 실제 PostgreSQL QA.

## 2026-10-24 M5-T3-B1 제한된 양측 Reduce-only 체결·OI 원자 연계

- 기존 PAIRED 시장에서 양측이 **독립적으로 pristine reduce-only FULL 예약**을 가진 모의 축소 체결만 지원. `backend/src/perp/reserved-paired-clearing.ts`는 OI 시장 row→주소순 두 reduce guard→양측 포지션 row→마진 bucket lock 순서로 위험 상태 재평가하고 1DB 트랜잭션에 두 M4 저널/snapshot+tracked OI+공통 paired receipt·M5 소진/이벤트 ID/guard 새 position 버전을 원자 기록한다.
- 기존 M4 양측 직접 체결 및 단일 계정 공개 writer는 reduce guard가 있는 계정에 한해 fail-closed, M5-T3-A shadow 소비 이력을 이미 가진 예약은 B1 경로 재사용 불가. 진짜 부분 체결·다수 예약·한쪽 신규 포지션 개설·기존 모든 worker 우회 폐쇄/실 PG 경합·마진 이동은 **미구현**, B2/B3/C/M5-T4 다음 작업. 실제 자산·체인·실주문·배포·Push 전부 제외.
- PGlite B1 **9/9**, A 확장 **1/1**, 전체 백엔드 **301/301**, 타입 빌드 통과. 테스트 `backend/test/perp-reserved-paired.test.ts`, 문서 `docs/tasks/M5-T3-B-reserved-paired/{SPEC,TODO,QA,RESULT}.md`.

## 2026-10-24 M5-T3-A Reduce-only 영속 모의 예약·가상 소진·취소

- `backend/sql/012_perp_reduce_reservations.sql`의 시장/체인/담보/계정 `FOR UPDATE` guard로 여러 주문의 미체결 예약량 **+ 같은 포지션 버전에서의 누적 가상 소진량**이 `abs(position.size)`를 넘지 않게 함. 수량 3버킷 requested=remaining+consumed+cancelled DB CHECK, immutable eventId별 CONSUME/CANCEL, 재시작·중복 처리 안정성. 기존 M4 position snapshot row와 M3 3개 margin bucket row를 읽고 잠근 뒤 trusted policy/오라클·M5-T2 사전 위험 평가 시행. 오라클/계정 margin/version 변화 시 과거 위험판정 재사용 거부.
- `backend/src/perp/reduce-reservations.ts`는 **SIMULATION_ONLY 예약·소진 리허설** 서비스. CONSUME가 M4 position을 실제로 바꾸거나 M3 금전 버킷을 이동시키지 않음. B/C 단계에서 M4 양측 포지션·OI와 M3 실제 예약을 같은 transaction으로 엮기 전에는 실주문/실체결 연결 금지. 신규 PGlite **15/15**, 전체 backend **291/291** 통과, TypeScript build 성공. 테스트 `backend/test/perp-reduce-reservations.test.ts`, 문서 `docs/tasks/M5-T3-reduce-capacity-ledger/`.
- 다음 **M5-T3-B**: 기존 paired clearing 등 모든 M4 포지션 writer와 capacity guard가 통합되지 않았으므로 실제 거래 활성화는 안전하지 않음. 모의 양측 매칭·고유 fillId·증거금 위험/예약 소진의 1개 DB TX/락 질서·중복 경합 검증을 분할 구현. M5-T4 임시 PG QA 후속. 운영 DB/키/배포/실자금/push 금지.

## 2026-10-24 M5-T2 reduce-only·사전 체결 위험 검증

- `backend/src/perp/pre-trade-risk.ts`: M4 순수 가상 체결 + M5-T1 모의 위험평가 통합. 전체 주문량과 단일 부분 체결량을 분리해 reduce-only FLAT/증가·수량 초과·비-reduce-only 무단 방향 반전 차단. 위험 증가 시 기존·체결 후 IM/MM/Equity·레버리지·reserved margin 판정, 감소 시 기존 위험이 악화되지 않는지 별도 검사. 예상 전이/위험 리포트는 전부 **SIMULATION_ONLY / executionAuthorized:false**, 실행 승인/자산 이동/DB 기록 아님.
- `backend/test/perp-pre-trade-risk.test.ts` 신규 **22/22개**, 전체 백엔드 **276/276 통과**, TypeScript 빌드 성공. TASK: `docs/tasks/M5-T2-pre-trade-risk/{SPEC,TODO,QA,RESULT}.md`. 다음 **M5-T3** 안전한 시뮬레이션 전용 영속 위험·양측 원자 체결/증거금 예약 검사; M5-T4 개발용 실제 PostgreSQL QA. 운영 정책/실 체인/계정 입금 증빙·배포·push는 미승인.

## 2026-10-24 M5-T1-A 초기/유지증거금·Equity/레버리지 모의 위험 엔진

- `backend/src/perp/risk-engine.ts`: M3 신뢰 MarketConfig/모의 가격 스냅샷·M4 포지션·M3 격리 available/reserved/position margin 장부 수치로 **읽기 전용** BigInt 기반 mark notional·IM/MM·Equity·유효 leverage·위험 상태를 계산. 명목가치·증거금은 보수적 올림, 미세 손실은 0에서 멀어지는 올림/이익은 버림, 정확한 범위/스코프 정책 검증. 현재 포지션 realized PnL이 M3 금전 원장에 정산되지 않았으므로 `realizedPnlBookedAtomic:'0'`만 허용. 평가 출력 `executionAuthorized:false` 고정; 자금 이동/청산/실주문·공개 API 미연결.
- 신규 `backend/test/perp-risk-engine.test.ts` 로컬 단위 테스트 **21/21**, 백엔드 전체 **254/254** 통과 및 TypeScript build 성공; 결과 `docs/tasks/M5-T1-isolated-risk-engine/{SPEC,TODO,QA,RESULT}.md`. 현재 운영 시장별 IM/MM/leverage·실토큰 정책/오라클 출처는 별도 사용자 승인 전 미확정. 다음 **M5-T2** pure SIMULATION_ONLY reduce-only·post-fill 위험 사전평가 기능.

## 2026-10-24 M4-T4 실제 PostgreSQL 동시성·재시작 QA

- 기존 승인 범위의 임시 PostgreSQL 15.19 Unix socket 전용 서버, test DB `perpdex_autopilot_test`에 신규 전용 `perp_qa_<12hex>` 스키마로 010/011을 로컬 적용. **seed 9/9, 실제 `pg_ctl restart` 후 별도 Node 프로세스 verify 2/2 통과**, 백엔드 전체 **233/233**, TypeScript 빌드 통과. 16-connection pool 동시 동일/서로 다른 fill ID, 단일 vs 양측 market mode 초기화 경쟁, 상대 version 거부, SELL journal/최종 receipt SQL 실패 rollback, 영속 OI/체결 ID 복구 확인.
- `backend/qa/postgres-paired-clearing.test.ts`, `backend/package.json`에 사용자 옵트인 `test:postgres-paired` 추가. 검증에서 제품 코드 버그는 재현되지 않았으며 실제 주문/증거금 이동/운영 DB/배포/온체인/push는 여전히 미실행. QA: `docs/tasks/M4-T4-postgres-paired-concurrency/{SPEC,TODO,QA,RESULT}.md`.
- **M5-T1 Next:** 검증된 trusted MarketConfig/PriceSnapshot 및 M4 position signed amount/PNL을 읽는 순수 위험 엔진(초기·유지 증거금/실제 총순가치 평가/레버리지/무효 가격/반올림), 모의 입력용 로컬 테스트. 공식 market risk parameters 및 신뢰된 collateral deposit/withdraw/fee/funding 정책은 운영자 승인까지 미확정, 실거래 경로 결합 금지.

## 2026-10-24 M4-T3 양측 모의 체결·시장 OI

- `backend/sql/011_perp_pair_clearing.sql`: 시장별 OI `PAIRED/UNPAIRED` 스코프 및 append-only 공통 거래 ID·양측 포지션 FK 영수증. `backend/src/perp/paired-clearing.ts`: **SIMULATION_ONLY** 한 fillId에서 BUY/SELL 둘을 내부 생성하여 **한 DB 트랜잭션**으로 원자 기록. LONG=SHORT 수량 합계와 시장 tracked OI/version을 검사하며 SQL 장애 시 모두 rollback.
- `backend/src/perp/position-ledger.ts`: 같은 SqlRunner 사용 가능한 내부 원장 처리 함수 분리·M4-T2 기존 public API 유지, PAIRED 시장에 단일 계정 writer 진입 금지, UNPAIRED legacy 시장 고유 row lock으로 초기화 경쟁 차단.
- 신규 `backend/test/perp-paired-clearing.test.ts` PGlite 신규 **15/15**, 백엔드 전체 **233/233** 통과, TypeScript 빌드 성공 (정상/복구·OI/중복·동시성·원자 장애). 문서 `docs/tasks/M4-T3-paired-position-clearing/`. M4-T4 실 PostgreSQL 멀티 연결/복구가 다음 독립 QA. 여전히 M2 공개 주문·담보/실자산·RPC·배포·push 연결 없음.

## 2026-10-24 M4-T2 영속 포지션 원장

- `backend/sql/010_perp_position_ledger.sql`: 시장/담보/체인/계정 스냅샷 + `(chain_id,verifying_contract,account,fill_id)` unique append-only 모의 체결 적용 이력, 동일 매수·매도 체결 ID는 **서로 다른 계정**에서 공유할 수 있으나 같은 계정은 비연속 과거 ID 재적용 불가. 계정/시장별 version unique/DB FK·이력 UPDATE/DELETE 차단 트리거.
- `backend/src/perp/position-ledger.ts`: M4-T1 순수 함수·신뢰된 정책/price 검증 재사용, 초깃값 0 스냅샷→row lock→latest journal 일치·중복 ID 방어→모의 순수 체결 계산→저장 이력·snapshot CAS의 원자적 commit. 입력은 내부 **SIMULATION_ONLY**뿐이며 실제 M2 Matching, M3 영속 담보·Vault·실 주문과 연결하지 않음.
- 새 PGlite 통합 테스트 **15/15**, 백엔드 전체 **218/218** 및 TypeScript build 통과 (양측 동일 ID·계정 비연속 재전송, 동시 요청/버전, 시장/도메인 격리, DB 실패 롤백, 재시작, 이력 변조 감지). TASK: `docs/tasks/M4-T2-position-ledger/{SPEC,TODO,QA,RESULT}.md`.
- **M4-T3 Next**: 양측 모의 체결을 같은 DB transaction에서 적용하고 long/short market OI 및 두 계정 PnL·수량 보존을 검증. M4-T4 임시 PostgreSQL 멀티 연결/복구 QA. 운영·실자산·RPC·배포/push 승인 없음.

## 2026-10-24 M4-T1-A 순수 포지션 엔진

- `backend/src/perp/position-engine.ts`에 **SIMULATION_ONLY** One-way LONG/SHORT, 가중 원가의 정확한 `quantityAtomic × entryPriceAtomic` numerator, 같은 방향 추가/부분·전량 종료/반전/누적 realized/mark 기반 unrealized PnL 및 strict int256/uint256 검사 구현. `backend/test/perp-position-engine.test.ts` 신규 19개 및 백엔드 전체 **203/203 통과**, TypeScript 빌드 성공. 기본 MarketConfig·mock PriceSnapshot과 scope binding, stale/mismatch/mark price deviation 차단. 실 증거금·공개 주문/매칭/체인·운영 DB/실자산 미연결.
- **M4-T2 Next:** 순수 함수에는 영속 ID 집합이 없어 비연속 같은 fillId가 재실행될 수 있다는 회귀 사례가 존재. 다음 작업에서 fillId `UNIQUE` DB constraint + snapshot/journal 원자적 커밋 + 실제 DB 재시작 복구/성공·실패·재시도 테스트를 반드시 구현. 입출금/포지션 마진 손익 회계는 M5 승인된 위험 엔진 전까지 실제 잔액에 반영 금지.
- TASK 문서: `docs/tasks/M4-T1-position-state-transitions/{SPEC,TODO,QA,RESULT}.md`.

## 2026-10-24 M3-T4 실 PostgreSQL 로컬 검증

- 임시 PostgreSQL 15.19 전용 Unix socket·`nobody`·테스트 DB에서 실제 16-slot `pg.Pool` 다중 연결의 M3-T3 shadow 주문 nonce/증거금 경합, 동시 취소·중복 해제, 강제 SQL 실패·원자 롤백, 서버 재시작 후 별도 Node 프로세스의 원장·Nonce·멱등 재생 검증. 새 `backend/qa/postgres-perp-sim.test.ts`, 관리자 수동 `npm run test:postgres-perp`만 사용. **seed 8/8 + restart verify 1/1, 기존 M2 PG 4/4, 전체 백엔드 184/184 및 빌드 통과**. 실 서비스 코드의 재현된 결함은 없어 기능 재설계/임의 수정하지 않음.
- 다음 독립 개발 항목 **M4-T1 포지션 엔진 순수 수학·상태전이 구현**. M3-T2-B의 실제 입출금 증빙/자금 정책, M3-T3-B의 부분 체결·증거금 할당은 여전히 사람 승인과 M4/M5 위험 엔진 선행 필요. 공개 주문 API·실거래/실자산·실체인·배포/remote push 사용하지 않음.
- QA 파일: `docs/tasks/M3-T4-postgres-margin-concurrency/{SPEC,TODO,QA,RESULT}.md`.

## 2026-10-24 M3-T3-A 실구현

- `009_perp_sim_orders.sql` 및 `backend/src/perp/sim-order.ts`: M2 v1과 분리된 signed v2 **SIMULATION_ONLY** 격리 마진 shadow order 저장, trusted MarketConfig 전체 해시·mock Oracle·시장/도메인·token binding, nonce+shadow row+RESERVE 원자적 commit, 서명 cancel+nonce tombstone+RELEASE 원자적 commit. 정상·실패·중복·장애 복구 신규 10개, 백엔드 전체 184/184 통과. 실 자산·실체인·공개 주문 API/체결·포지션 조정은 없음.
- M3-T3 부분 체결 예약 재조정은 M4/M5의 포지션/리스크 회계가 선행되지 않아 안전하게 구현할 수 없으므로 **미완료 B**로 분리. M3-T4 실제 PostgreSQL 복수 연결 QA는 독립 진행 가능.
- 사람 확인 필요: 공식 collateral/market 위험 수치·오라클 공급, 실 입금 증빙·Vault locked margin 출금 게이트, 실 운영/스테이징 변경·송신/배포/push 승인.

## 2026-10-24 무기한 선물 제품 결정 및 자동 개발 범위

- 사용자 확정 방향: **Perpetual Futures DEX**. 기존 M2 EIP-712 지정가·FIFO·원장/Outbox는 재사용하지만, 현물 유사 `BUYER_TO_SELLER` 토큰 이전을 선물 회계의 실제 Settlement로 자동 적용하지 않음.
- 새 마일스톤: M3 시장·오라클/격리 증거금 → M4 포지션 → M5 레버리지/주문 위험 → M6 펀딩 → M7 청산·보험 → M8 전용 온체인 ClearingHouse/보안.
- 초기 로컬 설계 가정: 단일 모의 BTC-USD-PERP 시장, USDC 격리 증거금, one-way 포지션. 실제 collateralToken/IM/MM/leverage/funding/fee/OI 한도 및 oracle 출처는 운영 승인 전 **미정**.
- **M3-T2-A 내부 증거금 원장 구현 및 백엔드 전체 174/174 테스트 통과**: `008_perp_margin_ledger.sql`, `backend/src/perp/margin-ledger.ts`에 가용/예약/포지션 3버킷과 고유 operation 이중 분개·로컬 롤백/재시작 검증. 공개 주문/체인 미연결. 실제 입금 없이 계정을 credit하는 production API를 만들지 않았고, 테스트 전용 opening SQL fixture만 존재.
- **M3-T1 시장/오라클/BigInt 검증 기반은 로컬 구현 및 신규 13개·전체 백엔드 162/162 테스트 통과**. 다음 M3-T2 이중 분개 영속 원장은 사람의 추가 승인 없이 로컬 구현·검증 가능. 실제 체인/키/실자산/운영·스테이징 DB·배포·원격 push는 기존 승인 제한을 계속 유지.
- 핵심 위험: 기존 `CollateralVault.withdraw()`는 DB `reservedMargin`을 보호하지 못하고, `settle()`은 사용자간 직접 잔액 이전뿐. 실제 선물 출금/정산은 M8 신규 MarginVault/ClearingHouse와 엄격한 위험/회계 불변식 없이는 사용 금지.
- 상세 설계: `docs/architecture/PERPETUAL-MVP-DESIGN.md`. 이번 회차 M3-T1 세 검증 모듈과 새 순수 테스트 13개를 구현. 실제 정책 승인/정산·운영 배포는 미실행.

## 현재 TASK 문서

- M2-T1 결과: `docs/tasks/M2-T1-order-domain/RESULT.md`, `QA.md` (완료)
- M2-T2 로컬 완료: `docs/tasks/M2-T2-eip712-auth/{SPEC,TODO,RESULT,QA}.md` (운영 실서버 QA 이관)
- M2-T3 로컬 완료: `docs/tasks/M2-T3-order-api/{SPEC,TODO,RESULT,QA}.md` (운영 DB QA 이관)
- M2-T4 완료 문서: `docs/tasks/M2-T4-price-time-matching/{SPEC,TODO,RESULT,QA}.md` (A~D 로컬 구현/검증 완료, 운영 E2E 이관)

- 현재 M2-T5: `docs/tasks/M2-T5-settlement/{SPEC,TODO,QA,RESULT}.md` (A~E 로컬 및 승인된 실제 PostgreSQL/Foundry QA 완료, 실체인/운영 QA 별도 승인 대기)
- 개발용 DB·Foundry 실검증: `docs/releases/M2-LOCAL-PG-FOUNDRY-QA.md`
- M3-T1 로컬 완료: `docs/tasks/M3-T1-market-risk-foundation/{SPEC,TODO,RESULT,QA}.md`
- M3-T2-A 로컬 결과: `docs/tasks/M3-T2-isolated-margin-ledger/{SPEC,TODO,QA,RESULT}.md`
- M3-T3-A 로컬 결과: `docs/tasks/M3-T3-sim-margin-admission/{SPEC,TODO,QA,RESULT}.md`
- M3-T4 PostgreSQL QA 결과: `docs/tasks/M3-T4-postgres-margin-concurrency/{SPEC,TODO,QA,RESULT}.md`
- M4-T1 순수 포지션 엔진: `docs/tasks/M4-T1-position-state-transitions/{SPEC,TODO,QA,RESULT}.md`
- M4-T2 영속 체결/스냅샷: `docs/tasks/M4-T2-position-ledger/{SPEC,TODO,QA,RESULT}.md`
- M4-T3 양측 모의 체결/OI: `docs/tasks/M4-T3-paired-position-clearing/{SPEC,TODO,QA,RESULT}.md`

## 저장소 복원 결과

2026-10-10 기준 저장소는 Foundry 기본 `Counter` 예제와 프로젝트 README만 존재하는 초기 상태였다. README에 명시된 1차 제품 흐름은 다음과 같다.

`Deposit → Limit Order → Matching → Settlement → Withdraw`

따라서 M1에서는 백엔드 매칭 엔진이 안전하게 사용할 수 있는 온체인 custody/settlement 기반을 먼저 구축한다.

## 진행 규칙

1. TASK 구현
2. 테스트 추가/수정
3. 테스트 실행 및 버그 수정
4. 필요한 빌드/배포 검증
5. TASK 문서 및 상태 업데이트
6. `git diff`, `git status` 검토
7. local commit (원격 push는 AutoPilot 작업에서 제외)
8. 가능한 경우 GitHub Actions CI 확인
9. TASK 완료 후 다음 TASK로 즉시 전환
