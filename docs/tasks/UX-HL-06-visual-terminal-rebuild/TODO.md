# UX-HL-06 TODO

상태: **구현 진행 중 / A1·A2 로컬 완료, A3 시각 인수 보류 / B1·C1·C2a·D1 로컬 구현 완료 / C2b·A3·F 브라우저 인수 보류**. 정적 테스트는 브라우저 검증을 대체하지 않는다.

- [x] A1 현재 `trade.html`/CSS 레이아웃의 정적 구조를 분석하고 데스크톱/모바일 CSS Grid 설계 (실측은 A3)
- [x] A2 시장 선택·지표 출처·상단 내비게이션을 압축 배치하고 미연결 값 상태 유지
- [ ] A3 주문 패널과 차트·호가 아래 계정 패널의 높이·스크롤·반응형 **실제 Chromium 검증** (CSS/DOM 구현은 완료, 화면 인수 미완료)
- [x] B1 Chart 헤더·64개 가상 샘플 Line/Sample OHLC 모드·4/8샘플 묶음 전환·실시간 시간 간격과 지표 미연결/disabled 표시
- [ ] B2 실제 시각/거래량 출처 검증 시 정식 OHLCV/Volume 추가 (현재 시간 없는 64개 가상 샘플의 묶음 OHLC만 지원)
- [x] C1 Order Book/Trades 공통 패널 ARIA 탭·키보드 전환, 모바일 접기/무JS 노출, 시장 전환 및 호가 깊이·스프레드·MOCK 행 회귀 (실브라우저 인수 별도)
- [x] C2a 호가 숫자 정렬·밀도/대비 개선, ASK/BID 구분, REFERENCE와 SPREAD(MOCK) 구분, 1330/760/360px CSS·회귀
- [ ] C2b 실제 브라우저 호가 가독 폭·오버플로·모바일 접기·키보드·스크린리더 인수 (샌드박스 실패, A3/F와 함께 보류)
- [x] D1 Long/Short·Market/Limit·Quantity·Limit Price·Leverage → MOCK 비용 → Preview CTA → Review → 미연결 계정/위험으로 정보 계층 개편, 키보드/입력/검토 회귀 (실브라우저 인수 별도)
- [ ] D2 Available/Position/Margin/Risk의 미연결·출처 표시 및 미지원 옵션 비활성 회귀
- [ ] E1 기존 5개 계정 탭을 하단 작업공간에 정렬, 읽기 상태·모바일 표 탐색 회귀
- [ ] E2 Balances 등 추가 탭은 신뢰된 데이터 계약이 마련되기 전까지 보류
- [ ] F1 1536/1280/768/390 및 확대 상태 실제 브라우저 캡처/레이아웃 비교
- [ ] F2 키보드·스크린리더·반응형·동작·MOCK 고지 회귀 실행
- [ ] F3 테스트 결과·잔여 결함·배포 금지 상태를 QA/RESULT/PROJECT_STATE에 기록
