# M2-T5 QA

상태: M2-T5-A~E 로컬 단위/종단간 통합 검증; 실제 PostgreSQL 운영 검증 및 온체인/Foundry 미실행

## 2026-10-24 — M2-T5-A Outbox

- 신규 PGlite 기반 9개 테스트: 진짜 서명 주문·체결에만 등록, 중복 등록 및 병렬 재등록 멱등성, 서명 도메인 격리, 페이지 동기화 재실행, 잘못된/없는 fill 거부, 동시 worker claim 중복 없음, 준비 완료 후 재실행 거부, 지연 재시도/attempt_count/오래된 토큰 차단, 임대 만료 재선점, DB 오류 시 배치 전부 롤백, 디스크 DB close/reopen 후 상태·idempotency 유지, invalid args 차단.
- 개발 중 PostgreSQL 파라미터 `$5`를 서로 다른 타입으로 추론한 문제가 발생해 상태 값에 `::VARCHAR(24)`를 명시, 동일 테스트에서 재검증 성공.
- `cd backend && npm run build` (`tsc --noEmit`) 통과. 전체 백엔드 `npm test` **112 passed / 0 failed** (기존 103 + 신규 9).
- 실제 PostgreSQL 복수 프로세스/다중 DB 연결 SKIP LOCKED, 운영 데이터 변경, 실제 ERC-20 자금 이동/온체인 트랜잭션, Foundry 실행, 원격 push는 미실행.

## 2026-10-24 — M2-T5-B 순수 정책/DB 결합 및 EIP-712 서명 QA

- 신규 `test/settlement-policy.test.ts` **10개 테스트**: 신뢰 정책+서명 승인 정산 지시(동일 입력 재현), 방향 반전 시 새 서명 필요, 정책 draft/revoked/미입력/만료/도메인 오류 거부, 토큰/컨트랙트 주소/정밀도/수수료/증거금 정책/상한 경계, 누락·만료·위조 승인, 승인 서명 뒤 금액/수수료/토큰/정밀도/정책 버전 변조 거부, >2^53 정확한 BigInt 정산 금액, Outbox 상태/ID 게이트, 타 체결/시장 재사용 방지, 실제 DB 원장 조회/계약 경계.
- `cd backend && npm run build` 타입 검사 통과. `cd backend && npm test` 전체 백엔드 **122 passed / 0 failed** (기존 112 + 신규 10).
- 실 정책 승인/정책 공급 레지스트리, 리스크 엔진·담보잔액/시장경제 모델, 정산 트랜잭션 송신·영수증 및 운영 PostgreSQL·Foundry 검증은 범위 밖. **테스트용 메모리 계정은 실제 사용자의 비밀키가 아니다**.

## 2026-10-24 — M2-T5-C 영속 dry-run QA

- 신규 `settlement-dry-run.test.ts` **11개**: 인증된 체결·정책/서명에 한 번만 지시 등록, 결정론적 `CollateralVault.settle` ABI calldata/BigInt 금액, 동시 6개 요청 중 정확히 한 선점, 위조·만료 승인·타 도메인·미준비 Outbox 차단, 변경된 정책/금액 덮어쓰기 거부, 실패 SQL 삽입 전체 rollback·성공 재시도, 모의 실행 결과 저장 실패 후 `SIMULATING` 정지·`UNKNOWN` 격리·자동 재실행 차단, PGlite 디스크 재시작 후 상태/해시 지속, DB JSON 변조 탐지, 복구 경계 검사.
- `cd backend && npm run build` 타입 검사 성공. `cd backend && npm test` 전체 **133 passed / 0 failed** (기존 122 + 신규 11). 실제 PostgreSQL 멀티프로세스 검증, 운영 006 마이그레이션, 실제 트랜잭션 서명·RPC·체인 receipt/Foundry는 실행하지 않았다.

## 2026-10-24 — M2-T5-D 모의 영수증·재조정 QA

- `node --experimental-strip-types --test test/settlement-reconcile.test.ts`: **13/13 신규 테스트 통과**. 미존재 영수증 UNCONFIRMED/접근 오류·pending RECHECK_REQUIRED, 확인 횟수 증가 후 MOCK_VERIFIED, 확정 mock REVERTED MOCK_FAILED, 이벤트·거래 상태/도메인/액수 위조 거부, 이전 블록 증거와 충돌 시 UNKNOWN 격리, 완료 후 상태 역행·재확정 차단, 같은 tradeId 동시 확인 고유성, SQL 제약 위반 롤백, PGlite 디스크 재시작 시 증거 지속, 재송신 없는 UNKNOWN 원장 검사.
- 초기 마이그레이션 실행에서 기존 006 테이블에 `(chain_id, verifying_contract, fill_id)` 복합 고유 인덱스가 없어 FK 42830 오류를 발견했고 007에 `CREATE UNIQUE INDEX IF NOT EXISTS`를 추가하여 재검증 통과.
- `cd backend && npm run build` 통과. `cd backend && npm test` 전체 **146 passed / 0 failed** (기존 133개 + 신규 13개).
- 실제 PostgreSQL 다중 연결·운영 데이터 적용, 실제 영수증/체인 최종성·재조직, 실제 `settledTrades` RPC, Foundry·실자산 전송·원격 push는 검증하지 않음. mock VERIFIED는 실제 정산 완료가 아님.

## 2026-10-24 — M2-T5-E 로컬 종단간 검증

- `node --experimental-strip-types --test test/m2-end-to-end.test.ts`에서 신규 **3/3 통과**: ① 실제 HTTP 주문 3건/서명·FIFO 잔량/체결 2건/Outbox·정책·승인·dry-run·모의 영수증/모순 UNKNOWN·DB 재시작 ② 정책 실패/위조 승인/HTTP 중복 주문 회귀 ③ 로컬 migration 001~007 반복 적용 및 순서 오류 거부.
- 장기 운영 및 외부 체인 QA는 미검증. `cd backend && npm run build` TypeScript 검사 **통과**. 전체 `cd backend && npm test` **149/149 passed, 0 failed** (기존 146 + 신규 3).
- 실 PostgreSQL 멀티프로세스, 운영 환경별 DDL/권한/백업·복구, Foundry/Solidity 자동회귀, 실제 정책 신뢰 경계, 송금·settledTrades RPC·chain finality/reorg, API 배포, 원격 push 등은 테스트/실행하지 않았다. 사람의 명시적 승인 및 환경 제공 없이는 실운영 인수를 완료할 수 없다.

## 2026-10-24 — 사용자 승인된 실제 PostgreSQL·Foundry 로컬 QA

- Solidity Foundry `/root/.foundry/bin/forge` 1.8.5: `forge build` 성공, `forge test -vv` **35/35 passed** (4개 suite), accounting invariant **128,000 calls, 0 reverts**.
- Postgres server 15.19 실제 실행; TCP listener 없음. `PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket npm run test:postgres-local` **4/4 passed × 3회 (서버 재시작 후 1회 포함)**. 001~007 DDL, 실제 복수 PG 연결의 중복 주문/nonce·부분 체결·Outbox 멱등성/잠금, `FOR UPDATE SKIP LOCKED`, 매칭 중 SQL 오류 시 원자 롤백/정상 재시도 검증.
- Test source는 고정 로컬 DB 사용자·DB 이름과 `/tmp` 사설 Unix 소켓을 강제하며, 운영 `DATABASE_URL`·실 키·실체인 RPC는 참조하지 않는다.
- Node TypeScript·기존 백엔드 전체 회귀 결과는 최종 실행 후 추가 기록. 여러 OS 프로세스/운영 DB·Sepolia·실거래·경제 정책은 미검증.
- 최종 `cd backend && npm run build` **통과**, `cd backend && npm test` **149/149 통과**. 실 PostgreSQL 임시 서버 재시작 전후 총 3회, 각 4/4 통과. 종료 시 PostgreSQL 임시 프로세스를 정지하고 Unix 소켓이 제거된 상태 확인.
