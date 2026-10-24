# M4-T3 SPEC — 모의 양측 포지션 체결·시장 OI 원자성

상태: 로컬 구현 완료(실거래 아님). 다음 단계 M4-T4 실제 임시 PostgreSQL 다중 연결 검증.

## 구현 범위

- `backend/sql/011_perp_pair_clearing.sql`: 시장 `(chainId,verifyingContract,market,collateralToken)`별 시장 OI/버전/정책 버전 및 `PAIRED`·`UNPAIRED` 모드. 시장 단위 `FOR UPDATE` 직렬화. `perp_sim_paired_fills`는 도메인+fillId PK, 매수자/매도자 M4-T2 체결 원장 각각에 FK, append-only 트리거, 동일 시장·가격·수량·정책 revision/hash·오라클 source sequence 결속.
- `backend/src/perp/position-ledger.ts`: 기존 public `applySimPerpFillToLedger(manager,...)` 유지, 공통 `applySimPerpFillWithinTransaction(db,...)`으로 순수 체결 계산→append-only application→CAS 스냅샷 저장을 분리. 동일 DB transaction 안에서 2회 호출하므로 중첩 BEGIN/COMMIT 없음.
- 기존 M4-T2 단일 계정 실행은 011 테이블이 있으면 시장 첫 접근 시 `UNPAIRED` 행을 `INSERT ON CONFLICT DO NOTHING` + `FOR UPDATE`로 점유. 이미 `PAIRED` 시장인 경우 즉시 거부. 두 모드가 처음 접속할 때도 동일 PK 삽입을 기다리므로 시장 초기화 경합을 직렬화함. 단독 포지션 이력이 남아 있는 시장을 승인 없는 양측 모드로 변환하지 않음.
- `backend/src/perp/paired-clearing.ts`: 내부 `SIMULATION_ONLY` 한 거래의 `fillId`, buyer/seller(서로 다른 nonzero EVM 주소), 수량, 가격, 개별 expectedVersion만 입력. 유효한 trusted MarketConfig/mock PriceSnapshot에서 체인·마켓·collateral·revision·BUY/SELL 방향을 각각 생성. **두 독립된 불신 fill을 직접 접수하지 않음**.
- `withTransaction` 하나에서 시장 OI row lock→기존 공통 fill ID 조회→시장 전체 signed-size를 BigInt 집계하고 LONG=SHORT 및 tracked 값 일치 확인→매수·매도 두 체결 원장/스냅샷 순차 적용→새 LONG=SHORT 검증→시장 OI/version CAS 갱신→paired immutable receipt 삽입. 어느 단계든 실패하면 두 계정/두 journal/OI/receipt 전부 rollback. 동일 계정 fill ID 재실행은 기존 M4-T2 고유 제약도 적용.
- **Open Interest**는 모든 LONG 수량의 합이자 SHORT 절대 수량의 합(baseAtomic)이며, 양측 포지션 증감에 따라 증가/감소할 수 있음. 항상 일정한 값은 아니고 LONG=SHORT와 tracked OI 일치가 불변식. 최대 OI는 승인된 테스트 MarketConfig 숫자 범위만 사용.

## 안전 제한

- 실제 M2 주문/매칭·실 담보·PnL 자금·펀딩/수수료/청산·온체인 RPC·비밀키·배포·원격 push에 연계하지 않음. 마이그레이터에 011을 수동 관리자 단계로만 등록, 운영 DB 적용 금지.
- 공개 HTTP API는 미등록. 두 계정이 정산될 수 있는 실체결 출처·서명/위험 승인·출금 안전성은 구현하지 않음.
- M4-T4에서 실 PostgreSQL 멀티 연결, migration 010/011, market row lock/일관성 및 실제 server restart 시험 필요. M5~M8에서 risk/자산/계약 정책 승인 후만 실거래 고려.
