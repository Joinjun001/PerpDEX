# M5-T3-B3-A — Reduce-only 포지션 영속 커밋 방어 및 bool 우회 제거

**범위:** 개발용 `SIMULATION_ONLY` 영속 M4/M5 포지션에 적용하는 데이터 무결성 보호. 실제 PostgreSQL/운영 계정/체인/실자산 미적용. DB 권한 분리·실 PostgreSQL 다중 연결 검증은 B3-B/M5-T4 후속.

## 기존 우회 취약점 재현

- B1/B2 이전 저수준 `applySimPairedFillWithinTransaction(db,trade,ctx,true)`의 `guarded=true`는 **임의 호출자 값**이라 M5 예약/오라클/증거금 위험 검사를 거치지 않고 M4 양측 포지션·시장 OI/paired receipt를 기록할 수 있었다. 예약 소진/이벤트 없이 M4만 커밋되었다.
- 공개 M4 `applySimPerpFillToLedger`는 guard를 확인하나 저수준 `applySimPerpFillWithinTransaction(db,...)` 호출은 해당 경계를 건너뛰었다.
- 저장소 권한을 가진 직접 `UPDATE perp_position_snapshots` 또한 M5 guard·M4 저널을 변경하지 않고 포지션 버전/수량을 무단 수정할 수 있었다.
- 신규 regression 3개를 **013 적용 전** 실행하여 세 사례 모두 `Missing expected rejection`으로 실패하는 것을 확인했다(재현 로그 `/tmp/perpdex_b3_red.log`).

## 실제 구현

- 신규 `backend/sql/013_perp_guarded_position_commit.sql`: `perp_position_snapshots` 행 INSERT/UPDATE/DELETE를 대상으로 `DEFERRABLE INITIALLY DEFERRED` **CONSTRAINT TRIGGER**를 추가한다. `perp_reduce_guards` 행이 있는 계정만 검사하고 다른 모의 계정·시장은 기존 정상 경로를 유지한다.
- 커밋 단계에서 `guard.position_version/size/config_revision == position snapshot` 보존, 최신 `perp_position_applications`의 마지막 fill ID·버전/수량·평균 원가/실현손익 누적 필드 일치를 강제한다.
- guarded position이 실제로 변경된 경우, **동일 fillId**로 양측 M4 `perp_sim_paired_fills`, 계정별 `perp_reduce_events(action=CONSUME)`, 관련 주문 도메인/정책/수량/side가 모두 일치해야 한다. M4 `opened_quantity_atomic='0'`, `closed_quantity_atomic=paired.quantity=event.quantity`; 매수자는 BUY, 매도자는 SELL. 어떤 변경도 이벤트 영수증을 생략할 수 없으며 실패 시 트랜잭션이 전체 롤백된다.
- 커밋 시 전체 시장의 `SUM(LONG size)==SUM(abs(SHORT size))==perp_market_open_interest.open_interest_atomic` 및 mode `PAIRED` 확인. 시장별 양측 수량 불변식 실패 시 커밋 거부.
- `backend/src/perp/paired-clearing.ts`의 `guarded:boolean` 인자를 제거했다. guarded 저수준 호출에는 `SimPairReservationProof {buyerOrderId,sellerOrderId}`를 받아 **DB에서 양쪽 예약 ID/잔량, 가격, 위험, 정책/모의 오라클, 마진 버전을 재검증**한다. SQL 013 트리거가 존재하고 비활성화되지 않았는지도 확인한다. 임의 `true`, 없는 주문 ID, 미설치 013은 거부한다. **주문 ID만 알고 있어도 예약 이벤트까지 같은 트랜잭션에 기록하지 않으면 DB commit은 실패**한다.
- B1 `reserved-paired-clearing.ts` 및 B2 `partial-reserved-paired-clearing.ts`는 각 검증된 주문 ID를 전달하고 기존 공통 한 트랜잭션 처리를 유지한다. SQL 마이그레이션 파일 목록 `backend/scripts/migrate.ts`에 013을 추가했다. 기존 마이그레이션 001~012 변경/운영 실행 없음.

## 한계·사람 확인 필요

- 트리거는 **DB table owner/DDL·SUPERUSER/ALTER TABLE DISABLE TRIGGER가 가능한 역할**을 제한하지 못한다. 또한 guard/order/event 자체에 허위 insert/update를 수행할 수 있는 과권한 애플리케이션 역할에는 별도 최소권한·불변식이 필요하다. 이는 프로덕션 권한 경계의 대체품이 아니며, 실제 역할 분리·권한 회수/접속 자격증명·기존 데이터 migration/replay 검증은 B3-B/운영자 승인 후 별도 수행해야 한다.
- 기존 DB에서 013을 설치한다고 이미 존재하는 변조된 스냅샷이 자동 감사되지는 않는다. 마이그레이션 전 백업/기존 행·이력 정합성 검증·락 영향 평가가 필요하며 운영 DB 직접 실행 금지.
- Trigger의 aggregate OI 조회는 보호되는 position 변경 시 시장 단위 선형 비용이 추가된다. 실제 PostgreSQL 멀티 연결/높은 OI 계정 수 부하, deadlock·PERMISSION 오류는 M5-T4에서 별도 검증 필요.
- 원자적 M3 증거금/서명 주문/경제적 손익 이전, 수수료·funding, 실거래와 온체인 RPC는 여전히 미지원. 이번 검증의 013은 **모의 원장의 정합성 보호**이지 자금 보관·안전성 인증이 아니다.
