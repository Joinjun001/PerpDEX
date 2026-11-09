# UX-HL-06 TODO

상태: **구현 진행 중 / A1·A2 로컬 완료, A3 시각 인수 보류 / B1·C1·C2a·D1·D2·E1·F2a 오프라인 통합 및 F3a 근거 감사 완료 / A3·C2b·F1·F2b·최종 F3 브라우저 인수 보류**. 정적 테스트는 브라우저 검증을 대체하지 않는다.

- [x] A1 현재 `trade.html`/CSS 레이아웃의 정적 구조를 분석하고 데스크톱/모바일 CSS Grid 설계 (실측은 A3)
- [x] A2 시장 선택·지표 출처·상단 내비게이션을 압축 배치하고 미연결 값 상태 유지
- [ ] A3 주문 패널과 차트·호가 아래 계정 패널의 높이·스크롤·반응형 **실제 Chromium 검증** (CSS/DOM 구현은 완료, 화면 인수 미완료)
- [x] B1 Chart 헤더·64개 가상 샘플 Line/Sample OHLC 모드·4/8샘플 묶음 전환·실시간 시간 간격과 지표 미연결/disabled 표시
- [ ] B2 실제 시각/거래량 출처 검증 시 정식 OHLCV/Volume 추가 (현재 시간 없는 64개 가상 샘플의 묶음 OHLC만 지원)
- [x] C1 Order Book/Trades 공통 패널 ARIA 탭·키보드 전환, 모바일 접기/무JS 노출, 시장 전환 및 호가 깊이·스프레드·MOCK 행 회귀 (실브라우저 인수 별도)
- [x] C2a 호가 숫자 정렬·밀도/대비 개선, ASK/BID 구분, REFERENCE와 SPREAD(MOCK) 구분, 1330/760/360px CSS·회귀
- [ ] C2b 실제 브라우저 호가 가독 폭·오버플로·모바일 접기·키보드·스크린리더 인수 (샌드박스 실패, A3/F와 함께 보류)
- [x] D1 Long/Short·Market/Limit·Quantity·Limit Price·Leverage → MOCK 비용 → Preview CTA → Review → 미연결 계정/위험으로 정보 계층 개편, 키보드/입력/검토 회귀 (실브라우저 인수 별도)
- [x] D2 계정 증거금(Available/Reserved/Position), Fees/Funding/Liquidation Price 미연결·출처 분리 및 Reduce Only 비활성 검증, MOCK_DEFAULT↔USER_INPUT Limit 입력 출처 추적, 모바일·실제 이벤트 회귀 (브라우저 시각 인수 별도)
- [x] E1 기존 5개 계정 탭 밀도·표 가독성, 계정 미연결/인증 후 empty/loading/error 상태 배지, 검증 전 테이블 숨김, 모바일 가로 스크롤 방향/ARIA 포커스 회귀 (실브라우저 인수 별도)
- [ ] E2 Balances 등 추가 탭은 신뢰된 데이터 계약이 마련되기 전까지 보류
- [ ] F1 1536/1280/768/390 및 확대 상태 실제 브라우저 캡처/레이아웃 비교
- [x] F2a 시장 선택/차트/Book·Trades/주문 Review/계정 5탭의 오프라인 모의 DOM·ARIA·출처 통합 회귀, 동일 Limit 금액 수정 시 출처 변경된 과거 Review 무효화 결함 수정
- [ ] F2b 실제 브라우저 키보드·스크린리더·반응형·MOCK 고지/스크롤 인수 (안전한 Chromium 샌드박스 실행 불가, A3·C2b·F1과 함께 보류)
- [x] F3a 기능별 구현 커밋/소스/테스트·MOCK/UNAVAILABLE 출처, 남은 브라우저 인수, 릴리스 차단 근거를 검증 매트릭스로 정리 (`ACCEPTANCE-MATRIX.md`)
- [ ] F3b A3·C2b·F1·F2b 실제 브라우저 인수 결과를 포함한 UX-HL-06 최종 F3 판정 (F3a 정적 감사만으로 완료 처리 금지)
