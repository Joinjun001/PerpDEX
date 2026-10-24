# M5-T3-C2-A 결과

상태: C2-A 로컬 기능 완료, C2-B 실제 원자적 실행 기록은 미완료.

- 신규 backend/src/perp/signed-sim-pair-gate.ts: 두 signed opening 주문을 한 시장 잠금/단일 TX, 계정 주소순으로 검증. 양측 공통 후보 체결가/수량, 기존 fillId, nonce, M3 RESERVE 장부, M4 version/OI 및 M5 리스크의 적합성 판정.
- 수정 backend/src/perp/signed-sim-risk-gate.ts: 기존 C1 공개 API 유지. 내부 트랜잭션 내 호출 함수 재사용 및 별도 candidate fillId/executionPrice 적용.
- 신규 backend/test/perp-signed-pair-gate.test.ts: 정상/위조/가격·수량/변조/취소/재사용/SQL 실패 테스트 6개.
- 자금 버킷 이동, 양측 M4 position/OI 기록, 주문 소진이나 거래 승인 없이 executionAuthorized:false 고정.
- 검증: 신규 C2-A PGlite 6/6, npm run build PASS. 전체 npm test 실행은 240초 제한으로 229번째 통과 후 중단; 앞선 194건 + 이어서 후반 파일 154/154건 재검증으로 **전체 348개 테스트 범위 PASS** (분할 실행, 단일 전체 npm test 완료는 아님).\n- C2-B에서 DB commit-time 불변식 및 M3/M4 원자적 영속 기록 구현 필요.
