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

## 2026-10-24 C3-B 실제 검증

- 새 PGlite `backend/test/perp-signed-cancel-integrity.test.ts`: **10/10 PASS**.
- 정상 EIP-712 서명 취소: M3 RELEASE 두 분개 + nonce/주문 CANCELED + 영속 서명/digest 포함 receipt, 전부 하나의 TX
- 무단 직접 SQL order+nonce 위조: COMMIT 거부, 주문/nonce/잔고 rollback
- 원장 없는 SQL receipt INSERT, 잘못된 EIP 서명, 중복·동시 취소, 영수증 INSERT 장애, 영수증 불변성, 취소 후 RESERVED 잔고 변조 모두 검증
- SQL 017은 있지만 018이 빠진 DB에서 서명 취소 서비스 fail-closed. 과거 취소에 취소 영수증이 없는 DB의 018 관리자 마이그레이션도 중단 (무검증 signature 자동 채움 없음)
- C3-A 감사 검증: 기존 위조 취소 관련 기대값을 018 적용 시점 COMMIT 거부로 갱신
- TypeScript `npm run build`: PASS
- 관련 10개 테스트 파일 순차 회귀(`--test-concurrency=1`): **106/106 PASS**
- 빈 별도 PGlite SQL 001~018 순서 적용: **18/18 PASS**, 신규 서명 취소 트리거 6개 확인
- `git diff --check`: PASS
- 단일 `npm test`와 실제 다중 연결 PostgreSQL/권한별 격리 QA는 미실행. 실자금·온체인·운영 DB 적용 없음.
- 서명 digest/signature 열은 앱에서 cryptographic 검증을 마친 입력을 보존하는 감사 기록이며, **DB가 별도로 secp256k1 서명을 복구하여 검증하는 기능은 아니다**. 임의 DDL/DB owner 또는 검증 없이 모든 테이블을 조작하는 역할로부터의 보안 보장을 주장하지 않으며 M5-T4 최소권한 검증 필요.
