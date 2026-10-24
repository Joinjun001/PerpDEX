# M5-T3-C3 QA

## C3-A 검증 대상
`backend/test/perp-signed-account-reconciliation.test.ts`

- 정상: signed OPEN 예약과 3개 버킷, M4 FLAT, realized/unrealized PnL 미반영
- 전량 FILLED: terminal 영수증-M3 ALLOCATE-POSITION 버킷, LONG/SHORT 및 시장 버전
- 서명 취소: 주문별 실제 RELEASE 분개 확인, 상대방은 OPEN 유지
- 복수 OPEN 합계, 과거 FILLED + 신규 OPEN 책임 분리, 여러 번 호출 및 동일 테스트 DB 내 동시 read-only 검증
- 실패/안전: 계정/정책/오라클 부정합, 중간 SQL 예외와 rollback, M3 RESERVED 직접 변조에 대한 SQL 015 커밋 차단
- **발견된 DB 안전성 공백**: 기존 SQL 015~017은 order_nonces와 perp_sim_orders를 동시에 CANCELED로 만들고 RELEASE를 생략한 직접 SQL 위조를 COMMIT 단계에서 차단하지 못함. C3-A read-only audit에서는 반드시 거부. SQL 신규 커밋 제약 추가는 후속 C3-B로 등록.
- `cd backend && npm run build`
- `node --experimental-strip-types --test --test-concurrency=1 test/perp-signed-account-reconciliation.test.ts`
- 관련 signed/M3/M4 테스트들은 `--test-concurrency=1` 로 회귀.

운영 DB, 실자금, 실제 PG 다중 세션은 이번 회차 범위 외.

## 실제 실행 결과 (2026-10-24)

- `cd backend && npm run build`: **PASS**
- 신규 `test/perp-signed-account-reconciliation.test.ts`: **9/9 PASS**
- 순차 회귀(9개 테스트 파일, `--test-concurrency=1`): **96/96 PASS**
  - account reconciliation, signed pair execution/preparation/fence/gate/risk, signed order, paired clearing, margin ledger
- 직전 SQL 001~017 영속 보호 로직은 이번 회차 변경하지 않음.
- 전체 `npm test` 단일 실행 및 실제 PostgreSQL 다중 연결은 이번 회차 미실행.
- 직접 SQL 위조 취소 검증에서 기존 DB 트리거가 ACCEPT한 상태를 재현하고 C3-A 검사에서 거부. 이것은 기존 SQL 015~017의 **잔존 DB 차단 결함**이며 아직 DB 자체에서 방지한 것이 아님.
