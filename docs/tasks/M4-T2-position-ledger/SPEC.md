# M4-T2 — SIMULATION_ONLY 포지션 영속 스냅샷·체결 적용 원장

상태: **로컬 구현 및 PGlite 통합 검증 완료**, 실 PostgreSQL 멀티프로세스 QA·M4-T3 양측 시장 OI 미구현.

## 작업 목적 및 범위

M4-T1의 순수 One-way LONG/SHORT/PnL 상태 전이는 직전 `lastFillId`만 보관하여 다른 체결 뒤 예전 ID 재사용을 탐지하지 못한다. M4-T2는 영속 유일성 제약과 동일 DB 트랜잭션을 추가하여 임의 비연속 재시작 이후에도 같은 계정에 체결 ID를 다시 적용하지 못하도록 한다.

### 실제 구현

- `backend/sql/010_perp_position_ledger.sql`:
  - `perp_position_snapshots`: PK `(chain_id,verifying_contract,market,collateral_token,account)`; unsigned/signed canonical 원자 단위·정수 원가/PnL·버전 및 마지막 fill ID의 상태 체크.
  - `perp_position_applications`: PK `(chain_id,verifying_contract,account,fill_id)`로 **동일 도메인의 한 계정은 시장/담보를 바꿔도 해당 ID를 다시 사용 불가**. 매수자와 매도자 **서로 다른 계정**은 같은 fill ID를 각각 저장할 수 있다. 동일 계정·시장·담보의 `applied_version` UNIQUE, 스냅샷 FK RESTRICT.
  - 체결 적용 시 원래 주문 방향·가격/수량, 정책 revision/hash, oracle sequence, 닫힌/새로운 포지션 수량, realized 차이 및 전이 후 size/cost/realized 상태를 **감사용 append-only** 행으로 저장. DB `BEFORE UPDATE OR DELETE` trigger로 기존 이력 변경을 거부.
  - 명시적 관리자 `scripts/migrate.ts`의 `001~010` 목록에 순서만 추가. 운영/실 DB에는 마이그레이션하지 않는다.
- `backend/src/perp/position-ledger.ts`:
  - `readSimPerpPosition`은 DB가 없으면 순수 zero position을 반환하고 자동으로 자금/주문/포지션을 저장하지 않는다. 존재하면 trusted MarketConfig/PriceSnapshot 검증 및 마지막 이력과 snapshot 상태를 비교하여 훼손을 감지한다.
  - `applySimPerpFillToLedger`는 내부 서버가 전달한 신뢰된 **SIMULATION_ONLY** 모의 체결만 허용한다. nonce/서명 주문·M2 실매칭/계약/자금과 분리한다.
  - `withTransaction` 안에서 비어 있는 스냅샷을 zero로 `INSERT ON CONFLICT DO NOTHING` → `SELECT ... FOR UPDATE` → persisted revision·latest journal 일치 검증 → 같은 계정/domain 내 중복 `fillId` 조회 → 기존 M4-T1 순수 상태 전이(시장·체인·account·tick/lot·오라클·price band·안전 정수 연산) → DB `UNIQUE` 응답 가능한 append-only journal 삽입 → version CAS snapshot 갱신이 하나의 커밋으로 완료된다.
  - SQL 오류/충돌/잘못된 정책·시장·가격/버전/잔액 맥락은 트랜잭션 전체 롤백. 중복 ID 재요청은 명시적으로 거부(자동 재적용/마진 해제 없음).

## 불변식과 검증

- 한 계정에서는 동일 fillId 1회, 같은 체결 ID의 양측 **계정별 기록 가능**. 고유 버전 슬롯 충돌 방지, 정상 전이만 snapshot/append log가 함께 증가.
- 가중 원가·정확한 BigInt PnL numerator와 long/short/부분 종료/반전, 독립 market/token/domain/account 스코프. **configRevision 변경 시 단위 재해석 금지**(별도 승인된 정책 이관 필요).
- PGlite 신규 DB·디스크 재시작 후 고유 ID/스냅샷 보존. 동일 ID 9개 병렬, 다른 ID 같은 expectedVersion 병렬, journal INSERT 오류 및 snapshot UPDATE 오류 롤백/재시도, DB 역사 UPDATE/DELETE 거부, 마지막 스냅샷 조작 검출.
- 코드는 실 자금 증빙·마진/보험 원장/레버리지 위험 승인·실 체결 서명·M2 Matching 연결을 하지 않는다. 해당 API가 공개되어서는 안 된다.

## 후속 미검증과 보안 경계

- **M4-T3**: 서로 다른 계정 양측의 동일 모의 체결이 원자적으로 적용되는 공통 transaction과, 시장별 LONG/SHORT OI 보존/일관성 검사. 단일 계정 application의 성공만으로 상대방 체결 완결이나 실거래 체결 유효성을 보장하지 않음.
- **M4-T4**: 실제 개발용 PostgreSQL 다중 프로세스/connection pool 동시성 및 참조 데이터 재조회 경합·failover QA. PGlite 통과만으로 실운영 수준을 주장하지 않음.
- **M5/M8**: 승인된 collateral 증빙, 출금 제한, 실제 주문 위험 판단, 포지션·증거금·PnL·수수료/펀딩 원자성 및 계약 보안 감사가 완성되기 전 실체인/실거래 결합 불가.
- 운영 DB migration, 실제 RPC, credentials, push, deploy, 실제 자금 이동은 사용자 승인 범위에 포함되지 않음.
