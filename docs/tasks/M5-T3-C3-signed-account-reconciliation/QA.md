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

## 2026-10-24 C3-C1 실제 검증

- 신규 `backend/test/perp-signed-fill-progress.test.ts`: **9/9 PASS**. OPEN/CANCELED/FILLED, PREPARED 제외, 다중 OPEN 주문별 수량, 취소와 동시 read, 불변 order.quantity 직접 SQL 변조, 미허가 FILLED 직접 SQL, 중간 SQL 조회 장애/rollback, SQL 019 재적용 후 FULL+취소 기록 보존.
- related 11개 테스트 파일 `--test-concurrency=1` 순차 회귀: **115/115 PASS**. 이전 C3-B 취소 receipt·C2 signed full execute, account reconciliation, signed fence/gate/risk, M3 margin, M4 paired regression 포함.
- `cd backend && npm run build`: **PASS**
- 임시 별도 PGlite 신규 DB에 SQL 001~019 전체 적용: **19/19 PASS**; SQL 019 commit trigger 2개 설치 확인.
- `git diff --check`: PASS.
- 단일 전체 `npm test`, 실제 PostgreSQL 복수 세션·role 권한 검증 미실행. SQL 019의 검증 결과는 **현재 FULL-only** 범위에서만 의미 있으며, 부분체결/예약금 비례 배분/부분 취소/실현손익의 DB 실행 경로는 존재하지 않는다.

## 2026-10-24 C3-C2-A 집계 M3 보존 검증

- 신규 `backend/test/perp-signed-account-margin-conservation.test.ts`: **14/14 PASS** (signed 복수 OPEN, FILLED+신규 OPEN, CANCELED+다른 OPEN, 비서명 M3 RESERVE 잔여분 분리, 예약/포지션 잔고 직접 UPDATE 차단, M3 operation 무분개·반쪽 분개 COMMIT 거부, 서로 다른 nonce 동시 admission, signed 취소와 별도 admission 경합, 강제 두 번째 M3 posting 실패 전체 rollback, 중복 nonce 차단, 020 재적용, 과대 RESERVED 레거시 장부 migration preflight 거부).
- 순차 관련 회귀 **12개 파일 129/129 PASS**: C3-C2-A, C3-C1 수량, C3-B 취소, C3-A 감사, C2-B2 A/B, C2-A, C1·M3·M4 연관 테스트. 실행 `node --experimental-strip-types --test --test-concurrency=1 ...` (이하 테스트 파일 전체는 코드/QA 참고).
- `cd backend && npm run build`: PASS.
- 별도 빈 PGlite 테스트 DB SQL 001~020: **20/20 PASS**, 신규 account aggregation 지연 트리거 4개.
- `git diff --check`: PASS.
- 전체 `npm test` 단일 실행 및 독립 연결의 실제 PostgreSQL 15/16 복수 트랜잭션 경쟁 검증은 미실행. PGlite Promise.allSettled 및 동일 WASM DB의 경쟁 시험을 PG 세션 교착/직렬성 증명으로 과장하지 않는다.
- 초기 AVAILABLE 잔고는 fixture seed이며 custody/입금/실자금 존재 증빙이 아니다. SQL DB owner·DDL 권한으로 트리거를 비활성화할 수 있는 공격자 방어는 M5-T4 최소 권한/실 PG QA 이관.

## 2026-10-24 C3-C2-B1 — 독립 PostgreSQL QA 하네스 검증과 실제 실행 보류

- Git 기준: 4113b1a, 작업 트리 clean 확인 후 시작.
- 서버/소켓 환경 확인: pg_config는 15/bin 경로를 표시하지만 서버 postgres/initdb/pg_ctl 실행 파일이 실제 없고, 기존 전용 /tmp/perpdex-pg-*/socket/.s.PGSQL.5432 소켓도 없음. 실 PostgreSQL 연결은 생성하지 않음.
- 신규 qa/postgres-signed-margin-guard.ts와 test/postgres-signed-margin-guard.test.ts: **4/4 PASS**. 지정 Unix socket·신규 QA schema·명시적 seed 단계 검증, 임의 TCP/운영/기존 schema/미존재 socket 입력 거부.
- 신규 qa/postgres-signed-margin-concurrency.test.ts: 별도 전용 PG에서만 동작하도록 하네스 작성. 서버 identity/current_user/TCP listener 및 독립 backend PID 검증 후에만 신규 QA schema를 생성하고 SQL 001/008~020 적용. 실제 독립 세션에서 signed 여러 nonce 동시 admission, 동일 nonce 중복, cancel+admit 경합, full+cancel 경합, 직접 SQL 변조 및 M3 보존을 검증하도록 구성.
- 비설치 상태에서 하네스를 단독 실행했을 때 **예상된 fail-closed 종료 확인**: 서버 없는 환경을 실제 PG 테스트 PASS라고 보고하지 않음.
- TypeScript npm run build **PASS**; 기존 M3·취소·전량 체결 + guard 관련 4개 테스트 파일 **41/41 PASS**.
- 추가 C3-A 계정 감사·C3-C1 영속 수량 프로젝션 **18/18 PASS**. 이번 회차 실제 실행한 관련 테스트 총 **59/59 PASS** (4개+2개 테스트 파일).
- 실제 PostgreSQL의 트랜잭션 경합과 제한된 별도 role에서 DDL/임의 journal/receipt 쓰기 차단은 **미실행·미검증**. 운영·스테이징 DB/실자금/원격 push 접근 없음.
- 후속 B2에 필요한 전제: 실제 실행 중인 전용 테스트 PG 15+ private socket, SQL migration 수행 가능한 QA role, 고유 신규 schema. 자동 설치/승인 우회/비밀번호 조회 금지.

## 2026-10-24 C3-C2-B2-A — 제한 감사자 역할 검증 오프라인 QA

- 시작 시 Git HEAD ad61fcf / clean 확인, C3-C2 SPEC/TODO/QA/RESULT·PROJECT_STATE·ROADMAP 재확인. 독립 PG 소켓/서버 바이너리 가용성 점검 결과 **없음**; 운영·스테이징/기존 네트워크 DB에 연결하지 않음.
- 신규 backend/test/postgres-signed-role-permissions.test.ts **7/7 PASS**: 읽기 전용 12개 보호 테이블 카탈로그 정상 평가, SUPERUSER·CREATEROLE·CREATEDB·BYPASSRLS·REPLICATION·소유권·owner 멤버십·DDL/SECURITY DEFINER 실행권·INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER 권한 거부, 누락/NULL/중복 메타데이터 fail-closed, 파라미터 바인딩 SELECT만 수행.
- 기존 private socket guard **4/4 PASS**, TypeScript build **PASS**.
- 관련 signed M3 증거금 집계·취소·전량 체결·C3-A 계정감사·C3-C1 체결 잔량 회귀 포함, **7개 파일 순차 테스트 66/66 PASS**.
- 실제 pg_catalog 쿼리는 전용 PostgreSQL 인스턴스 없어서 **미실행**. 별도 제한 역할 실제 로그인, 독립 PG backend PID, 역할별 CREATE/ALTER/DROP 및 DML 권한 거부 동작은 모두 **미검증**.
- QA 모의 fixture의 제한 감사자 통과는 실제 PG role 보안 증명이 아니다. B2-A는 읽기 전용 감사 역할만 평가하며 서명 검증이 필요한 모의 체결 writer role의 승인 또는 영수증 인증을 대체하지 않음.
