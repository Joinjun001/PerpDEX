# M2-T3 QA

상태: Passed (로컬 HTTP/PGlite 67 tests; 운영 PostgreSQL 검증 별도)

- 구현 예정: HTTP 입력 유효성·서명·Nonce 중복·DB 실패 응답.
- 운영 PostgreSQL 서버 및 다중 프로세스는 현재 환경에서 실행 불가. PGlite의 embedded PostgreSQL 엔진으로 검증한 결과와 구분한다.

## 2026-10-24 — 주문 생성 HTTP 회귀 결과

- 백엔드 `npm run build` (`tsc --noEmit`): **성공**.
- `npm test`: **44개 통과 / 0개 실패**.
- 신규 API 테스트 7개: 주문+Nonce 원자적 저장 후 201, 동일 Nonce 재사용 409, 잘못된 입력·만료 400 및 DB 비소비, 위조 서명 401 및 DB 비소비, 잘못된 서명 도메인·요청 도메인 삽입 거부, 잘못된 JSON 400, 크기 초과 413, Content-Type 415, 경로 404, 메서드 405, 내부 DB 예외 500 및 내부 문자열 비노출.
- 인메모리 PGlite(실제 PostgreSQL SQL 엔진) + localhost 임시 포트. 운영 PostgreSQL 다중 연결/멀티프로세스 및 실제 배포 환경은 미실행.
- 보안 경계: 공개 인터넷 전용 API gateway 인증/요청 rate-limit·CORS 정책·고가용성은 현재 범위에 없음. 현재 서버 시작 시 loopback 전용.
- 미완료: 주문 조회·목록, 인증된 취소 HTTP, 네트워크 실패 뒤 idempotency/재요청 정책, 운영 PG E2E.

## 2026-10-24 — GET 주문 조회 API 검증 (6회차)

- 신규 localhost HTTP + PGlite 테스트 6개 통과: 단건 200/404, 문자열 정밀도 보존 및 서명 원문 비노출, 시장/상태 필터, 페이지네이션(limit/offset/hasMore), ID/파라미터 유효성 및 SQL injection 거부, 체인·검증 컨트랙트 도메인 범위 분리, DB 오류 500 응답 상세 비노출.
- 처음 목록 SQL 자리표시자 생성에서 누락을 확인하고 수정함. 수정 이후 신규 조회 테스트 6/6 통과.
- PostgreSQL 서버를 구동한 실제 네트워크 및 멀티프로세스 검증은 **미실행**; 운영 배포 및 실사용 인증 검증으로 간주하지 않음.

### 6회차 최종 판정

- GET 단건/목록 HTTP + PGlite 신규 6개, 전체 회귀 **50 passed / 0 failed**.
- TypeScript 검사 `tsc --noEmit` 성공.
- 병렬 PGlite 메모리 경합에 따른 SIGKILL은 test runner 파일 순차 실행으로 해소. 비즈니스 로직 회귀 실패는 아님.
- 아직 미검증: 실운영 PostgreSQL 다중 프로세스, 인증된 HTTP 취소 API, POST 재시도 idempotency.

## 2026-10-24 — HTTP 주문 취소 인증 회귀 (7회차)

- 신규 HTTP/PGlite 테스트 `backend/test/order-cancel-http.test.ts`: **8 passed / 0 failed**.
- 정상 소유자 서명 취소(200), 사전 취소로 미생성 주문 Nonce 영구 차단(200), 동일 요청 재전송 충돌(409) 확인.
- 위조 서명·타 사용자·변조된 nonce·다른 Chain ID/verifyingContract 서명은 401. 만료/형식 위반은 400, 종료 주문은 409. 사용자 도메인 입력을 명시적으로 거부.
- `OPEN` 및 `PARTIALLY_FILLED` 취소에서 `filled_quantity`를 보존하고 잔량 반환, `FILLED`/`EXPIRED` 거부.
- 생성·취소 동시 요청 후 사용된 Nonce에 활성 OPEN 주문이 남지 않음을 확인. SQL CHECK 오류에 따른 취소 실패 500 이후 Nonce·주문 상태 동시 롤백 및 정상 재시도 확인.
- SQL 비밀 내용·연결 정보 등의 오류는 500 일반 에러로 응답. 상세 비노출 확인.
- 실제 운영 PostgreSQL 서버 및 여러 API 프로세스 동시 실행은 환경에 부재하여 미검증. PGlite 내장 PostgreSQL을 활용한 테스트와 구분.

### 7회차 회귀 결론

- TypeScript **통과** / 백엔드 전체 **58 passed, 0 failed**.
- 서명 취소 API HTTP/PGlite 신규 테스트 **8개 통과**.
- 서버 설정 기반 도메인 고정, EIP-712 위조/타 사용자 거부, 사전 취소, 중복·종료 상태 보호, 부분 체결 잔량 보존, 생성-취소 동시 경합, DB 오류 시 롤백 및 내부 SQL 비노출을 확인.
- 운영 PostgreSQL과 다중 프로세스는 미검증. HTTP 응답 유실 및 재전송 idempotency는 미구현.

## 2026-10-24 — 멱등성 및 응답 유실 복구 QA (8회차)

- 주문 생성 원본 성공 201 → 동일 서명 재전송 200/replayed; 다른 서명·변조된 같은 Nonce 409, 타 지갑 위조 401.
- 기존 주문이 부분 체결·취소 상태일 때 재전송 응답은 현재 상태를 표시. 체결과 취소 동작을 재수행하지 않는다.
- 취소 성공 후 receipt 영속 저장, 동일 취소 재전송 200/replayed, 서명·deadline 변경 충돌 409. 사전 취소 동일 서명 재전송도 안전하게 복구.
- 동시 생성 10개에서 최초 커밋 1개·멱등성 재전송 9개, 동시 취소 8개에서 receipt 1건만 커밋.
- 취소 receipt INSERT SQL 실패 시 Nonce/주문 동시 rollback 확인. 영속 DB 재개방 후 동일 주문 생성·취소 재전송 확인.
- 만료된 요청의 허용 범위 확장 없음; 인증·Nonce 소유자·도메인 보호는 기존 정책 유지.
- PostgreSQL PGlite 기반 검증, 외부 운영 DB 멀티프로세스·실배포 미실행. `forge` 미구비로 온체인 회귀 별도.

### 8회차 로컬 최종 QA

- `npm run build`: 통과. `npm test`: **67 tests, 67 passed, 0 failed**.
- 신규 재전송 테스트 9개: 인증·도메인 검증, 동일 서명 성공 복구, 동시 중복 처리, 변조 및 타 계정 구분, 취소 기록 영속성, 기록 INSERT 오류 rollback, DB 재시작 복구.
- 운영 PostgreSQL 다중 프로세스 및 실제 배포, Foundry 통합 회귀는 **미실행**. 실제 결제/키/정산 자금 작업 없음. QA 범위는 로컬 HTTP/PGlite.
- M2-T3 **로컬 QA Passed / 운영 환경 검증 별도 이관**.
