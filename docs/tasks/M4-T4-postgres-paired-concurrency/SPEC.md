# M4-T4 — 실제 PostgreSQL에서 SIMULATION_ONLY 양측 체결·OI 동시성/복구 QA

상태: **테스트용 PostgreSQL 15.19에서 로컬 통합 QA 완료**, 운영/실거래 대상 미검증.

## 목표·작업 범위

- M4-T3의 `paired-clearing.ts`/`position-ledger.ts`, SQL `010_perp_position_ledger.sql`/`011_perp_pair_clearing.sql`의 실제 PostgreSQL 행 잠금, 마켓 최초 생성 경쟁, transaction commit/rollback 및 서버 재시작 후 OI/유일 체결 ID 회복을 검증한다.
- `backend/qa/postgres-paired-clearing.test.ts`를 **옵트인 실행**한다. 기존 실제 DB 테이블/운영 마이그레이션을 건드리지 않는다. `backend/package.json`에 `npm run test:postgres-paired`를 추가하며 기본 `npm test`에 실 PostgreSQL 접속을 강제하지 않는다.
- 사용자에게 기존 승인된 임시 `/tmp/perpdex-pg-check/data` 클러스터만 사용. `nobody` OS 사용자 / DB 사용자 및 이름이 정확히 `perpdex_autopilot_test`인 DB, `/tmp/perpdex-pg-.../socket` Unix 도메인 소켓만 허용. startup에 `listen_addresses=''` 명시하고 `inet_server_addr() IS NULL`, 서버의 `listen_addresses` 공란을 확인하며 어떠한 네트워크 TCP listener도 생성하지 않는다.
- 매 회차 암호학적으로 무작위인 `perp_qa_<12 hex>` 이름으로 **새 독립 스키마**만 CREATE하고, 010→011 스키마를 그 안에서 트랜잭션으로 실행. `DROP/TRUNCATE/운영 DB 변경` 금지. 실제 승인 전 공개 지갑·키·체인 RPC·자산 이체·배포/remote push 금지.

## 요구사항과 인수 기준

- `pg.Pool max=16`과 `postgresTransactionManager(pool)`로 서로 다른 실제 연결 12개가 동일 `fillId` 체결을 병렬 호출할 때 **정확히 1개**만 완전히 적용, 두 계정 원장 2건/paired receipt 1건/시장 OI 정확히 1회 증가.
- 동일 buyer/seller와 *다른* `fillId`의 12개 경쟁에서 `expectedVersion`이 같으면 **1회만** 승낙, 오래된 상대방 version과 중복/재전송은 전체 양측 rollback. 독립적인 다른 매수/매도 쌍의 두 동시 거래는 모두 허용하고 시장 OI가 보존된다.
- 시장 최초 생성(`INSERT ... ON CONFLICT`)에서 `PAIRED`과 `UNPAIRED` 단일 writer가 경쟁하면 **하나의 모드만** 확정되고, 반대 모드의 거래는 모두 롤백. 최초 DB market row/unique key 직렬화 검증.
- 단 한쪽 SELL journal에 의도적 SQL CHECK 실패를 주입했을 때 BUY 원장/SELL 원장/스냅샷/시장 OI/pair receipt 모두 전 상태로 복귀, 제약 해제 후 동일 fill ID 재시도 성공. pair receipt 자체 실패도 같은 롤백 검증.
- seed 단계 후 **실 `pg_ctl restart`**하고 별도 Node 프로세스 verify에서 기존 5개 paired receipt/10개 account journal, LONG=SHORT와 영속 OI, 같은 체결 ID 재전송 거부를 확인. 새 정상 거래까지 적용해 OI 증가 확인.
- `npm run build`, 전체 `npm test`, 신규 PG seed·restart verify 통과. 본 TASK에서 Foundry/Solidity 변경은 없으므로 재컴파일·배포/체인 호출 불필요.

## 실행 방법

```bash
# 이미 사용자 승인한 로컬 PG만. 먼저 PostgreSQL 15 단일 노드를
# -k /tmp/perpdex-pg-check/socket -h '' 로 실행, TCP listener 없음 확인.
cd /shared/PerpDEX/backend
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket \
PERPDEX_TEST_PG_SCHEMA=perp_qa_<매번 새 12자리 hex> \
PERPDEX_TEST_PG_PHASE=seed npm run test:postgres-paired
# 임시 PG만 pg_ctl restart 실행, 동일 schema/새 Node 프로세스 사용
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket \
PERPDEX_TEST_PG_SCHEMA=perp_qa_<seed와 동일> \
PERPDEX_TEST_PG_PHASE=verify npm run test:postgres-paired
```

## 분리해야 할 실제 제품 위험

- M4-T4는 오직 로컬 검증. 실제 PostgreSQL 복제본/다중 노드/failover/복구·운영 DB/시세/자산 정책 및 체결 승인은 범위 밖.
- 현재 `SIMULATION_ONLY` 포지션 원장은 M2 실 주문/매칭/자금 계정과 결합되지 않음. M5 IM/MM/Leverage·reduce-only 안전심사, M6 funding, M7 liquidation, M8 vault/보험/인출 제한까지 별도 구현/검증 뒤에야 실거래 논의 가능.
