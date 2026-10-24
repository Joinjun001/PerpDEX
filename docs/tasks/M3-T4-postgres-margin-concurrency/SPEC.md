# M3-T4 — 실제 PostgreSQL 다중 연결·복구 인수 (로컬 전용)

상태: 개발용 실 PostgreSQL 15 검증 완료. 운영·실자산·체인 불가.

## 목표와 안전한 범위

- M3-T3의 서명된 `SIMULATION_ONLY` v2 주문 접수→Nonce 점유→shadow 주문 영속화→M3-T2 증거금 이중 분개 `RESERVE`, 취소 서명→Nonce tombstone→shadow 주문 변경→`RELEASE` 경로를 실제 PostgreSQL connection pool에서 검증한다.
- 이 TASK는 코드/시스템 결함이 발견되면 바로 수정하기 위한 QA 작업이다. 현재는 검증에서 로직 결함이 관측되지 않아 제품 기능을 바꾸지 않는다. 신규 테스트 및 재현 가능한 실행 진입점은 남긴다.
- `/tmp/perpdex-pg-check/socket`처럼 *로컬 전용* Unix domain socket·TCP 미청취·OS 사용자 `nobody` 및 명시된 개발 DB `perpdex_autopilot_test` 외는 테스트 시작 전 예외로 차단한다.
- 매 실행마다 `perpdex_qa_<12hex>` 고유 스키마를 생성한 뒤 `001_order_nonces.sql`, `008_perp_margin_ledger.sql`, `009_perp_sim_orders.sql`만 독립적으로 적용한다. 기존 schema/table을 DROP·TRUNCATE하지 않고, 운영 마이그레이션은 실행하지 않는다.
- 테스트 전용 계정 잔액은 **검증되지 않은 PGlite/PG 테스트 픽스처**이며 실예치·입금·출금 기능이 아니다. 테스트용 EIP-712 지갑도 프로세스에서만 생성하며 자격증명을 파일로 저장하거나 네트워크로 사용하지 않는다.

## 실 PostgreSQL 인수 항목

1. Pool `max:16`, 실제 복수 연결에서 동일 EIP-712 서명·Nonce의 10개 동시 접수: 정확히 하나 성공, `order_nonces`와 `perp_sim_orders` 각 1행, 원장 2행, 예약 1회.
2. 잔액의 3배까지만 예치한 고립 계정에 서로 다른 서명 주문 10개 동시 접수: 가능한 3개만 성공, 잔액 마이너스/이중 예약 없으며 실패한 nonce·주문은 미기록. 금융 금액은 JS `Number`가 아닌 BigInt 원자단위.
3. 접수·취소가 동시에 도착한 경우: 커밋 전 취소는 fail-closed하며 원래 EIP-712 취소 서명으로 안전하게 다시 요청할 수 있다. 최종 상태는 CANCELED, 원금 전액 반환, 2개 operation·각 2개 분개, 회계 합계 보존.
4. 이미 접수된 동일 주문의 유효한 서명 취소 8개 경합: 단 1개만 적용, nonce tombstone CANCELED, 2행 RELEASE 유지, 나머지 7개는 실패.
5. `perp_margin_entries`의 특정 operation만 SQL CHECK 오류 강제: 예약 실패 시 nonce/shadow/버킷 전체 롤백, 제약 제거 후 **같은 서명** 재실행 성공. 해제 실패 시 취소 전 상태·nonce USED·증거금 예약 유지 및 제약 제거 후 정상 취소 성공.
6. seed·verify를 별도 Node 프로세스로 실행하고 **실 PostgreSQL `pg_ctl restart`** 수행. 재시작 후 OPEN 주문/nonce/보류증거금/2-leg 분개와 멱등 replay 유지, 전체 operation 2-leg sum=0 확인.
7. M2 기존 `backend/qa/postgres-local.test.ts` 4개, `npm run build`, 전체 PGlite/HTTP `npm test` 회귀. 실 Foundry/컨트랙트는 변경 사항이 없으면 재실행 불필요.

## 명령과 선행 조건

```bash
# 관리자 승인된 테스트 Unix socket 서버에서만 (TCP 사용 금지)
cd /shared/PerpDEX/backend
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket \
PERPDEX_TEST_PG_SCHEMA=perpdex_qa_<실제 생성된 12자리 16진수> \
PERPDEX_TEST_PG_PHASE=seed npm run test:postgres-perp
# 이후 별도 운영자 명령으로 pg_ctl restart, 동일 schema로 phase=verify 실행
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket \
PERPDEX_TEST_PG_SCHEMA=perpdex_qa_<위와 동일> \
PERPDEX_TEST_PG_PHASE=verify npm run test:postgres-perp
```

검증 실행 후 `pg_ctl stop`으로 임시 PostgreSQL 서버를 종료한다. 저장소에 실제 금융 위험 승인값/자격증명/키/DB URL/테스트 출력 파일을 커밋하지 않는다.

## 후속 의존성

- M3-T2-B: 실제 Vault 예치 증빙을 원장과 잇는 기능은 실 담보/권한 정책 및 계약 아키텍처 승인 없이는 완료 불가.
- M3-T3-B: 부분 체결/예약금 해제·포지션 할당은 M4 포지션 장부 및 M5 위험 검사 선행. 이 TASK에서는 실제 주문 체결·부분 해제 기능을 활성화하지 않는다.
- M4-T1 **순수 포지션 상태 전이 및 정밀도·PnL 안전 모델**이 다음 독립 구현 TASK. 실 RPC/실자산/운영 DB/배포/remote push 별도 승인 필요.
