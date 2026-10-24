# M5-T3-C2-A 결과

상태: C2-A 로컬 기능 완료, C2-B 실제 원자적 실행 기록은 미완료.

- 신규 backend/src/perp/signed-sim-pair-gate.ts: 두 signed opening 주문을 한 시장 잠금/단일 TX, 계정 주소순으로 검증. 양측 공통 후보 체결가/수량, 기존 fillId, nonce, M3 RESERVE 장부, M4 version/OI 및 M5 리스크의 적합성 판정.
- 수정 backend/src/perp/signed-sim-risk-gate.ts: 기존 C1 공개 API 유지. 내부 트랜잭션 내 호출 함수 재사용 및 별도 candidate fillId/executionPrice 적용.
- 신규 backend/test/perp-signed-pair-gate.test.ts: 정상/위조/가격·수량/변조/취소/재사용/SQL 실패 테스트 6개.
- 자금 버킷 이동, 양측 M4 position/OI 기록, 주문 소진이나 거래 승인 없이 executionAuthorized:false 고정.
- 검증: 신규 C2-A PGlite 6/6, npm run build PASS. 전체 npm test 실행은 240초 제한으로 229번째 통과 후 중단; 앞선 194건 + 이어서 후반 파일 154/154건 재검증으로 **전체 348개 테스트 범위 PASS** (분할 실행, 단일 전체 npm test 완료는 아님).\n- C2-B에서 DB commit-time 불변식 및 M3/M4 원자적 영속 기록 구현 필요.

## 2026-10-24 C2-B1 — DB 커밋 제약 구현

**상태: C2-B1 로컬 구현 완료, C2-B2 실제 signed 영속 체결 미구현**

- `backend/sql/015_perp_signed_opening_fence.sql` 추가: signed v2 OPEN 주문 고정 신원·상태/nonce 정합성·M3 reserve operation/entries·OPEN 예약 총합과 RESERVED bucket 하한을 커밋 시점에 확인
- signed OPEN 증거금이 존재하는 계정의 미연계 M4 position 변동, M4 양측 paired receipt, M3 ALLOCATE 모두 commit-time 거부; 거래·계정의 실제 입출금과는 독립적으로 읽기 전용 기능만 유지
- signed shadow order UPDATE/DELETE 제약, M3 operation/entry 불변식 적용. 로컬 admin migrate 목록에 신규 SQL 등록만 했으며 운영 DB를 직접 변경하지 않음.
- 신규 PGlite 10/10, 관련 회귀 54/54, TypeScript build PASS, 임시 DB SQL 001~015 일괄 적용 PASS, diff check PASS
- 병렬 파일 테스트에서 리소스 SIGKILL이 발생하여 `--test-concurrency=1`로 성공 재실행. 전체 테스트 358건 단일 실행은 이번 회차 미실행.
- **남은 C2-B2**: 서명 검증과 원자적 양측 opening 체결, M3 RESERVED→POSITION, 양측 M4/OI 및 주문 상태와 영수증 간 DB FK/지연 검사 완성. B1 차단 제약을 해제하거나 우회하지 말고, 정확한 인증된 terminal receipt에 한해서만 SQL 커밋을 허용해야 한다.
