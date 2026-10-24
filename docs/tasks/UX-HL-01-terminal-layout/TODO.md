# UX-HL-01 TODO

- [x] A1 Git/PROJECT_STATE/ROADMAP/Hyperliquid UX 문서/프런트 코드 검토, clean 확인, 기존 UX TASK 폴더 부재 확인
- [x] A2 차트·호가·최근 체결·주문 티켓 독립 3열 및 태블릿·모바일 CSS
- [x] A3 시장 샘플 reference/change 전환과 Mark/Oracle/Funding/OI 미연결 상태 바
- [x] A4 DEMO 주문·차트 회귀 및 HTML/CSS/보안 정적 테스트
- [x] B1 Positions/Open Orders/Order History/Trade History/Funding History 하단 ARIA 탭, 방향키/Home/End/클릭, 안전한 빈 계정 패널
- [x] B2-A 계정 미연결·정상 빈 데이터·로딩·오류를 구분하는 순수 모델 및 단위 테스트
- [x] B2-B1 계정 chain/source/tab/request/revision·row 필드·중복·uint256/잔량 검사 및 로컬 순수 비동기 상태 coordinator
- [x] B2-B2-A 계정 테이블 분리 renderer, 기본 차단/disconnected·loading·empty·error 상태, 고정 컬럼과 textContent, stale/경합/테이블 정리 오프라인 QA
- [x] B2-B2-B1 백엔드 공개 주문 read 라우트/계정 권한 부재 조사, 오프라인 verifySession/query 콜백 주입 흐름·세션 버전/재인증/중복·stale 요청/취소 신호 QA
- [ ] B2-B2-B2 계정 인증/접근 제어가 확인된 전용 서버 read endpoint 준비 시 브라우저 UI/계정 연동 E2E; 미준비 시 C1 QA 우선
- [ ] C1 브라우저 wide/tablet/mobile 실제 렌더링·키보드 시각 인수(브라우저 가용 시)

- [x] D1 모바일 MOCK Order Book / Recent Trades 묶음 접기·펼치기 UI 및 aria-expanded/aria-controls·접근성 포커스
- [x] D1 JS 미실행 시 샘플 패널을 숨기지 않는 progressive enhancement와 데스크톱 3열 무변경
- [x] D1 신규 토글 6개 단위/정적 회귀, 기존 전체 85/85, JavaScript·TypeScript·HTML/CSP 검사
- [ ] D2 실제 브라우저/모바일 viewport/터치/보조공학 렌더링 인수 (현재 도구 미가용; C와 병행 보류)

- [x] E1 가상 시세 차트의 근거 없는 08:00~18:00 시간을 고정 샘플 순번 #01~#64로 변경
- [x] E1 BTC/ETH/SOL 생성 sampleChart 배열로부터 min/max/last·가상 샘플 출처 대체 텍스트 생성, SVG aria-describedby 결속 및 화면 MOCK HIGH/LOW 표시
- [x] E1 별도 5건 단위/정적 QA와 실제 main.js 시장 변경 통합 1건, 프런트 전체 109/109 PASS, JS/TS/HTML/CSP/git 검사
- [ ] E2 실 브라우저/실스크린리더·레이아웃에서 샘플 요약 접근성 인수 (현재 환경 미가용)

- [x] F1 실제 거래 시간 출처가 없는 Recent Trades의 18:50~18:18 시각 문자열 제거
- [x] F1 Time 헤더를 Sample #로 변경, #01~#09와 실제 체결 시간·블록체인 기록 아님 안내
- [x] F1 기존 main.js 이벤트 실행 기반 회귀 3건 추가, 전체 112/112 PASS, JS/TS/HTML/CSP/diff 검사
- [ ] F2 브라우저/스크린리더에서 모의 체결 순번/레이아웃 실제 인수 (현재 미가용)

- [x] G1 합성 Order Book Total의 Size × 행 번호 오류를 실제 main.js 실행형 테스트로 수정 전 실패 재현
- [x] G1 최우선 Ask/Bid 가격 기준 누적 Size 계산으로 수정; 기존 샘플 가격·수량 생성 변경 없음
- [x] G1 BTC/ETH/SOL 각 7개 Ask/Bid 행의 가격 순서와 가시 수량·Total 일치 회귀 테스트 통과
- [x] G1 프런트엔드 전체 122/122, JS 문법/TypeScript 빌드/HTML ID·태그/CSP/git diff 검사 통과
- [ ] G2 실 브라우저에서 표 가독성/모바일·스크린리더 인수 (현재 도구 미가용)

- [x] H1 sampleChart에 Object.prototype 상속 key를 주면 NaN 배열을 반환하는 오류를 수정 전 실패 테스트로 재현
- [x] H1 previewEstimate/describeSampleChart도 primitive 문자열+own key 시장 ID로 정렬
- [x] H1 차트·주문 모델·접근성 요약에서 상속 시장/문자열 강제 변환 객체를 거부하는 신규 3건 회귀
- [x] H1 프런트 전체 125/125, JS syntax/TypeScript build/HTML 구조·CSP/git diff 검사
- [ ] H2 실제 브라우저·스크린리더에서 시장 전환 화면 인수 (환경 미가용)

- [x] I1 SAMPLE 변화율이 합성 차트 첫 값/마지막 값과 다른 결함을 세 시장 숫자로 재현하고 수정 전 회귀 2건 실패 확인
- [x] I1 describeSampleChart에 처음/마지막 샘플의 변화율과 출처 문구 추가
- [x] I1 시장 선택 3개 버튼, 차트/지표 change 및 정적 초기 HTML의 변화율을 같은 64개 MOCK 샘플로 정합
- [x] I1 기존 고정 fixture change를 강제한 구조 회귀를 실제 샘플 change 검증으로 교체
- [x] I1 전체 프런트 132/132, JS 문법/TypeScript build/HTML 구조·고유 ID/CSP/git diff 검증
- [ ] I2 실제 브라우저·모바일·스크린리더에서 샘플 변화율과 부호/색상 동작 시각 인수 (브라우저 미가용)

- [x] J1 임의 CSS --depth 패턴이 실제 누적 Total과 일치하지 않는 오류를 실제 main.js 이벤트 테스트 수정 전 FAIL로 재현
- [x] J1 ASK/BID의 누적 Total을 기준으로 행 깊이를 해당 호가 측 전체 합성 수량 대비 백분율로 변경
- [x] J1 BTC/ETH/SOL × ASK/BID 각 7행의 깊이/Total 비례, 최상위 100%/단조 방향, 범위·유효 숫자 검증
- [x] J1 프런트 144/144, JS syntax/TypeScript build/HTML 구조·ID/CSP/git diff 검사
- [ ] J2 실제 브라우저/모바일·키보드/스크린리더에서 깊이 막대/누적 수량 시각 인수 (샌드박스 환경 미가용)

- [x] K1 합성 호가의 시각적 Price/Size/Total 헤더가 행의 보조공학 이름과 연결되지 않은 상태를 정적/실제 DOM 신규 테스트 2건 수정 전 FAIL로 확인
- [x] K1 매수/매도 각각 ARIA list와 합성 출처 명시, row role=listitem + 시장/방향/순번/가격/수량/누적/비실거래 설명
- [x] K1 시장 전환 시 목록과 모든 행의 접근성 설명이 가시 수치와 동기화되는 BTC/ETH/SOL 통합 테스트
- [x] K1 가시 숫자 span에는 aria-hidden=true를 적용하여 행 단위 레이블 중복 발표 방지
- [x] K1 전체 프런트 146/146, JS 문법·TypeScript 빌드·HTML 태그/고유 ID/CSP/Git diff 검사
- [ ] K2 실제 샌드박스 브라우저·스크린리더에서 합성 호가 목록·행/언어 안내 확인 (현재 실행 제한)

- [x] L1 Recent Trades의 합성 Price/Size/Sample # 행에 보조공학 목록·열 설명이 없는 문제를 DOM/정적 회귀 2건 수정 전 FAIL로 재현
- [x] L1 최근 체결 컨테이너를 시장별 가상 목록으로 표시하고, 각 행에 시장·방향·순번·가시 가격/수량·실거래 아님 설명 추가
- [x] L1 화면에 이미 보이는 숫자 span은 중복 낭독을 방지하도록 aria-hidden=true 사용
- [x] L1 BTC/ETH/SOL × 각 9개 행의 실 데이터 출처/접근성 설명 일치, JS 비실행 초기 HTML 확인
- [x] L1 프런트 전체 148/148, JS syntax/TS build/HTML 구조·고유 ID/CSP/git diff 검사
- [ ] L2 실제 브라우저·스크린리더/모바일에서 최근 체결 목록/샘플 순번 낭독 인수 (샌드박스 환경 제한)
