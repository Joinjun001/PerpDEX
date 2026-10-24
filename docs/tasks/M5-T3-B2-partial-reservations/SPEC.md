# M5-T3-B2 — 다중 Reduce-only 예약의 양측 부분 체결 및 포지션 버전 원자 화해

상태: **SIMULATION_ONLY 다중 미체결 Reduce-only 예약의 부분 체결 로컬 구현·검증 완료**. 실거래·실자금·M2 주문 접수 미연결.

## 동작 및 작업 경계

- `backend/src/perp/partial-reserved-paired-clearing.ts`의 `applySimPartialReservedPair`는 **양쪽 모두 감소하는 LONG/SHORT**만 지원하며, 실제 운영 주문 접수가 아닌 개발용 모의 체결이다. 주문 하나의 남은 수량 중 1 lot 이상 일부 또는 전량을 체결하고, 같은 계정에 여러 열린 Reduce-only 예약이 존재해도 다른 주문을 그대로 추적한다. BUY/SELL 양측이 모두 예약을 가져야 하며 한쪽 신규 포지션 개설, 반전, 일반 매칭·M3 돈 이동은 차단/미연결한다.
- 트랜잭션 1개에서 기존 PAIRED 시장 OI FOR UPDATE → 양측 계정주소 순 `perp_reduce_guards` FOR UPDATE → 각 포지션 FOR UPDATE → 명시된 3개 M3 margin bucket FOR SHARE 순서. 두 주문의 ID, 방향, 체결 가격과 양, 포지션 예상 버전, trusted server policy/모의 oracle, bucket/version fingerprint를 같은 SQL runner 안에서 대조. 기존 `applySimPairedFillWithinTransaction(...,guarded=true)`로 두 M4 포지션 snapshot·append-only journals/공통 fillId/OI를 쓰고, 두 계정의 예약/이벤트/가드 앵커를 같은 TX에서 갱신한다. 어느 한 단계라도 실패하면 양측 데이터 전체 rollback.
- `backend/src/perp/reduce-reservations.ts`의 `checkPartialReservedReduceForPair`는 계정별 모든 OPEN 예약을 `ORDER BY order_id FOR UPDATE`로 검증한다. `guard.consumed_qty_atomic`이 0이 아니면 이전 **체결 없는 A-stage 가상 소진**으로 간주해 일괄 거부한다. 주문별 immutable 정책 해시·oracle snapshot (mark/index/sequence/시간/신뢰도)·margin bucket version/balance·포지션 version 불일치면 이전 위험검사를 재사용하지 않는다.
- 과거 `perp_reduce_events` CONSUME는 `perp_sim_paired_fills`의 동일 ID, 수량, BUY/SELL 당사자, 시장·담보토큰이 확인될 때만 실 모의 체결 이력으로 인정한다. 같은 주문의 B2 부분 체결이 반복될 수 있으나 중간에 A-stage shadow consume 등이 끼어 있으면 **거부**한다.
- 체결될 주문: `remaining <- remaining - fillQty`, `consumed <- consumed + fillQty`, `status <- remaining==0 ? EXHAUSTED : OPEN`(DB의 `requested=remaining+consumed+cancelled` CHECK 유지). 이벤트 기록은 양측 `event_id=fillId`로 불변 저장. **다른 OPEN 주문은 소진량을 변경하지 않음.** M4 새 위치 size/version을 얻은 뒤 모든 아직 열린 주문을 **새 포지션**을 기준으로 reduce-only 방향·미체결 잔량·가격별 모의 위험을 **재계산**하고 모두 적합해야 position_version을 새 버전으로 reanchor한다. `SUM(OPEN remaining) <= abs(new position size)`가 필수. 이미 EXHAUSTED/CANCELLED인 주문은 역사적 version·이력 유지.
- M4에서 실제로 줄어든 포지션 수량은 이제 `new position.size`에 반영되어 있으므로 `guard.consumed_qty_atomic`은 0으로 재앵커링하며 같은 소진을 다시 이중 차감하지 않는다. 이전의 shadow consume가 발생한 경우 안전하게 이 과정을 금지한다.
- 기존 B1 단일 FULL 전량 예약 경로와 A 예약/취소 인터페이스는 그대로 유지하며, 테스트에서 서로 회귀하지 않는지 확인한다.

## 제한 및 후속 단계

- 서로 다른 가격·부분 잔량이 정책 minQuantity 이하인 경우 재검증에 실패하면 **전체 트랜잭션 롤백**. 잔량 자동 취소/자동 quote renewal, 가격변동 시 사용자 재승인/체결보증, 이미 있는 A-stage 가상 소진의 M4 reconciliation은 구현하지 않음. 동일 trusted mock 스냅샷 및 동일 margin fingerprint가 유지될 때만 동작.
- B2는 내부 함수를 통해 M4 writer와 함께 작동하지만 **저수준 SqlRunner `applySimPerpFillWithinTransaction` 직접 호출/SQL 권한 가진 다른 서비스가 guard를 우회할 수 있음**. B3에서 권한·DB 방어/서비스 경계 통합 필요. 양측 중 한쪽만 reduce-only + 상대 신규 진입, 위험 증가/예치·출금/수수료/펀딩/청산/M2 주문 검증은 M5-T3-C 이하에서 개별 원자 검증 후에만 허용한다.
- M5-T4의 실제 독립 Unix socket PostgreSQL 다중 연결·락/재시작 QA는 미실행. 오프체인 실주문 활성화/운영 DB·RPC·키·배포·원격 push 금지.
