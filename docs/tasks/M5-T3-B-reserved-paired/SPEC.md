# M5-T3-B1 — 양측 Reduce-only 예약 전량 소진과 M4 포지션·OI 원자 결속

**범위:** SIMULATION_ONLY 내부 로컬 API, 기존 주문·실 담보·온체인 변경 없음. **B1 구현**과 추후 B2/C 구분.

## 잠금 및 트랜잭션

- `applySimReservedPairedFill`은 `OrderTransactionManager.withTransaction` **한 번만** 사용한다. 동일 SqlRunner로 `perp_market_open_interest` 시장 행 **FOR UPDATE** → BUY/SELL 계정 주소 정렬에 따른 `perp_reduce_guards` 두 행 **FOR UPDATE** → 각 `perp_position_snapshots` **FOR UPDATE** → 기존 M3 3개 bucket **FOR SHARE** → 신뢰된 가격·정책·잔고/원장 버전 검사 → M4 양측 `perp_position_applications`/snapshot·OI 및 `perp_sim_paired_fills` → M5 양측 예약 잔량 0/`perp_reduce_events`와 guard 새 버전 reanchor → commit 순서이다. M4와 M5 내부 호출은 중첩 `BEGIN/COMMIT`이 없다.
- 기존 M4 `applySimPairedFill`과 단독 계정 `applySimPerpFillToLedger`는 reduce guard가 있는 계정의 독립 적용을 차단한다. `applySimPairedFill`은 내부 트랜잭션 실행 함수와 분리하면서 **012 스키마가 있고 매수자/매도자 중 하나에 reduce guard가 존재하면** 직접 체결을 거부한다. A/B1이 시작한 계정은 legacy 무방비 체결 경로를 우회하지 못한다. 단, 이미 실행중인 단독 M4 서비스/원장 내부 함수를 직접 호출하는 저수준 writer나 비승인 SQL writer까지 전면 봉쇄하지 않으므로 실 거래에 쓰면 안 된다.
- 시장의 이전 모의 OI는 이미 PAIRED이고 양측이 *기존* 상반된 포지션·승인 테스트 정책·신뢰된 모의 가격·M3 3버킷 및 단일 pristine OPEN reduce-only 예약을 각각 보유해야 한다. 시장이 UNPAIRED/비어있거나, 어느 한쪽 예약 없음, 중복 event, shadow CONSUME 기사용, 다른 OPEN 예약, partial fill, 주문 가격/수량·포지션/정책/오라클/마진 fingerprint mismatch는 **거부**한다.
- BUY는 기존 SHORT를 감소시키고 SELL은 기존 LONG을 감소시켜야 한다. 양쪽 `closedQuantityAtomic`이 공통 fill 전체 수량과 일치하고 `openedQuantityAtomic='0'`이어야 commit. 기존 M5-T2 pure risk는 양쪽에 대해 동일 트랜잭션의 같은 가격/정책/버전/잔고로 재평가한다.
- M4 시장 OI 및 양쪽 포지션/체결 ID journal이 저장된 동일 DB TX에서 주문별 `requested = consumed`, `remaining=0`, `EXHAUSTED`, `perp_reduce_events(event_id=fillId,action=CONSUME)`를 양쪽 저장한다. guard는 **새 포지션 size/version**으로 reanchor하고 새 버전의 shadow consumed는 0으로 초기화한다. 이는 실제 변경된 포지션 수량을 과거 shadow consumed와 두 번 차감하지 않기 위함이다. 이벤트 이력과 계정별 영수증은 append-only, 동일 fillId는 M4 UNIQUE 및 M5 eventId UNIQUE로 차단.
- 실패 시 두 계정 저널·snapshot, market OI, paired receipt, 두 예약 row/event/guard **모두 롤백**. 실제 자산 이전, M3 마진 버킷 이동, M2 주문/매칭 API 등록·실 온체인 RPC는 없음.

## 테스트·한계

- 신규 `backend/test/perp-reserved-paired.test.ts` PGlite 정상 양측 0.4 BTC 축소, 양쪽 동일 fillId 원장, 동일 fillId 9건 경합, 한쪽 예약 누락·shadow 사용·legacy 우회 거부, 가격/margin 버전 변화, 강제 SQL 오류 전체 rollback, 다음 position version에 신규 예약, DB close/reopen/replay. `npm run build`/전체 `npm test` 통과 시 완료.
- **B2 미완료:** 여러 open reduce-only 주문의 부분 체결 및 취소와 실제 포지션 변동의 원자 reconciliation, 한 계정 reduce-only + 상대 신규 개설, M3 증거금/fees/funding/outbox 결속, 미승인 저수준 writer 폐쇄·실 PostgreSQL 다중 연결 경합/교착 검증. M5-T4 실제 PG 전에는 운영 적합 주장 금지.
