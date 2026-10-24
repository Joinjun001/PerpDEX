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

## 2026-10-24 C2-B2-A — 서명 양측 전량 후보 PREPARED 영속화

**상태: B2-A 로컬 구현·검증 완료, B2-B 최종 체결·원장 이중분개/영수증 미구현.**

- `backend/sql/016_perp_signed_pair_preparations.sql`: 신규 append-only 테이블(도메인·fillId PK, 양측 기존 signed order FK, 준비 시점 market OI·버전·정책·오라클·전량/양측 IM·계정). DB 지연 트리거가 주문 상태/시장/담보/수량/호가 범위와 기록의 일치를 COMMIT에서 확인. 이후 취소되면 기록은 과거 후보 증거에 불과하다.
- `backend/src/perp/signed-sim-pair-gate.ts`: 기존 C2-A 검증을 동일 TX 내에서 재사용 가능하게 분리. `preparePersistedSignedSimPerpPair`는 양쪽 EIP-712/OPEN/nonce, M3 RESERVE 이중분개, M4 FLAT position/market OI 및 공통 실행가격 M5 평가를 검증한 뒤 PREPARED 레코드만 추가한다.
- 원본 SQL 015 차단 트리거는 변경 없음. 포지션·OI, 증거금, signed order 소비, 실거래·실자금·온체인 이동은 **전혀 실행하지 않음**. 반환 `executionAuthorized:false`.
- 내부 관리 마이그레이션 목록에 016 등록 (운영 DB 적용 안 함). 새로운 테스트 8/8, 관련 회귀 62/62, TypeScript build, SQL 001~016 빈 DB 설치 검증 PASS.
- **다음 B2-B:** 지금의 PREPARED 레코드는 승인 근거가 될 수 없음. signed 전량 OPEN 주문 2개를 새로운 거래에서 재인증·락 → 양측 M4 paired journal/OI, M3 RESERVED→POSITION, 영속 주문 소진·nonce/영수증의 정확한 SQL 불변식을 동시에 보장하는 최종 체결 경로를 추가할 것. 위험/정산 불변식이 누락되면 계속 fail-closed.

## 2026-10-24 C2-B2-B — 서명 양측 영속 전량 모의 체결

**상태: 내부 SIMULATION_ONLY C2-B2-B 로컬 구현 완료. 운영/실자금/실체인 비활성.**

- `backend/src/perp/signed-sim-pair-execution.ts` 구현: PREPARED 영수증과 현재 서명 주문을 새 트랜잭션 안에서 재검증(EIP-712, nonce, OPEN, trusted market/oracle, M3 예약 원장, M4 position/OI, M5 양측 pre/post risk). FLAT·전량 opening·계정별 OPEN 주문 1건으로 엄격히 제한. M4 paired fill+OI, 두 계정 M3 RESERVED→POSITION 2개 작업, terminal 영수증·주문 FILLED 상태를 동일 TX에서 완료.
- `backend/sql/017_perp_signed_pair_executions.sql`: 기존 SQL 015 무단 실행 차단을 인증된 terminal 영수증 경로에 한해서만 허용. M3 이중분개, M4 양측 영속 신청과 현재 position, 시장 OI, nonce 상태 및 서명 주문을 deferred COMMIT 제약에서 재대조한다. 이후 독립 SQL 버킷/position/OI 변조도 차단한다. `backend/scripts/migrate.ts`에 017 추가 (실제 DB 적용 없음).
- 신규 집중 회귀 **13/13 PASS**, 기존 관련 8개 파일 선행 회귀 **84/84 PASS**, TypeScript build PASS. 초기 재시작 fixture 중복삽입 오류는 재시드 제거로 수정 후 성공. 전체 npm test는 이번 회차 미실행.
- 경계: `executionAuthorized:false`는 **실제 주문 체결/자금 이체/온체인 권한을 부여하지 않는다**는 뜻이며 이번 함수는 로컬 모의 원장만 변경. 데이터베이스 owner/DDL 권한자 또는 전체 영수증·체결·원장을 일관되게 위조할 수 있는 DB 쓰기 역할까지 신뢰하지 않으므로 M5-T4 최소 권한·독립 PostgreSQL QA가 필요하다.
- 다음 `M5-T3-C3`: 부분 체결/다중 OPEN 예약, 반대 방향 reduction, realized PnL 및 수수료·펀딩 등 미정 회계 요건은 승인된 정책을 먼저 확인하고 안전한 작은 TASK로 분할할 것.
