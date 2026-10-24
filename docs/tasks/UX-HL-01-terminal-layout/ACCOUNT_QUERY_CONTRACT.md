# UX-HL-01-B2-B1 계정 조회 응답 계약

상태: 오프라인 데이터 계약·stale 요청 차단 구현 완료. 실제 지갑/백엔드/계정 UI 테이블 연동은 미완료.

## 검증 범위

- 파일: frontend/account-query-contract.mjs / account-query-contract.test.mjs
- 5개 탭: positions, open-orders, order-history, trade-history, funding-history
- expected context: Sepolia chainId 11155111, EVM 계정 0x40 hex, source LOCAL_DB 또는 VERIFIED_TESTNET, tab, 단조 증가 requestId
- response 필드: chainId, account, source, tab, requestId, revision, records (정확히 7개 필드)
- 각 record의 공통 필드: id, chainId, account, market=BTC-USD-PERP. 계정·체인·시장 필드가 요청과 정확히 같아야 함. 중복 id/알 수 없는 필드 거부, 100개 이하 기록만 허용.
- positions: side LONG/SHORT, sizeAtomic, marginAtomic
- open-orders: side BUY/SELL, status OPEN, quantityAtomic, filledQuantityAtomic, remainingQuantityAtomic. 수량=체결+잔량.
- order-history: side BUY/SELL, status CANCELED 또는 FILLED, quantityAtomic, filledQuantityAtomic.
- trade-history: side BUY/SELL, fillPriceAtomic, fillQuantityAtomic.
- funding-history: paymentSignedAtomic.
- 모든 atomic 필드는 실수/JS Number가 아닌 canonical 10진수 문자열. unsigned uint256 범위 초과, 음수·비정상 소수·지수/선행 0 거부. 금액 부호는 funding 항목에만 허용.
- coordinator: connect(context) 이후 begin(tab)으로 token 발급, accept(token,response)/fail(token)/disconnect()가 per-tab 상태 관리.
- 동일 탭에 새 요청이 발생하면 이전 요청의 응답 및 오류 폐기. account/source 교체·disconnect/reconnect 시 이전 세대 token 폐기. 더 낮은 server revision 거부.
- 상태: disconnected, loading, ready, empty, error. 잘못된 현재 응답은 error와 빈 기록 처리. 정상 0개는 empty.

## 인증 경계 (중요)

- VERIFIED_TESTNET은 응답이 스스로 선언한 출처 문자열일 뿐 실제 서버·체인의 인증 증명이 아니다. 지갑 소유권·TLS/endpoint/인증/백엔드 권한, 실제 chain 정산과의 일치성은 별도 검증.
- 모듈은 네트워크, DOM, 지갑, 컨트랙트를 호출하지 않는다. 현재 계정 탭 화면은 미연결 상태이며 record 표에는 행이 없다.
- 미래 backend 계약과 필드명·금액 스케일 매핑은 별도 검증한다. 이 문서는 실제 서버가 이 형식을 반환한다고 주장하지 않는다.
- 실제 DOM 렌더링은 인증된 query adapter가 준비되고 UI에서 textContent와 필드 화이트리스트를 적용한 이후 별도 TASK.

## 후속

- UX-HL-01-B2-B2: 신뢰된 adapter 경계, stale·query 실패·데이터 계약/DOM 상태 결합 검증. 백엔드·지갑 미연결이면 독립 UI 테스트만 진행.
- UX-HL-01-C: 브라우저 너비별 시각/키보드·터치 접근성 검증.
