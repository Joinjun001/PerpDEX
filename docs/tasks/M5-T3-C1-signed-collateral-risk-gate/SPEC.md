# M5-T3-C1 — 서명 모의 개설 주문의 영속 증거금·포지션 위험 단일 TX 검증

상태: **SIMULATION_ONLY, 읽기·평가 전용**. 실제 M4 체결, M3 자금 버킷 이동, M2 공개 주문 API 및 온체인 정산/실자금과 절대 비연결.

## M5-T3-C 세부 작업 분할

- **C1 (이번 회차):** M3 EIP-712 v2 signed *non-reduce-only opening order*를 재인증하고, M3 영속 Nonce·shadow 주문·RESERVE 이중분개/계정 버킷과 M4 포지션/OI 및 M5 순수 거래 전후 위험을 **한 DB 트랜잭션에서 검증**. 결과는 `executionAuthorized:false`, 데이터베이스 쓰기·체결 없음.
- **C2 (후속):** 거래 상대방의 서명·정책/담보/수량·가격 결속, 양측 체결의 동일 시장 OI·포지션·Nonce/예약금 적용을 DB의 단일 TX로 결합하는 설계·테스트. C1 리포트 재사용 금지; C2 체결 시 모든 증빙과 IM/MM/equity를 재평가하고 M3 버킷 이동/부분예약·잔액·미사용 주문을 원자 보존할 수 있는 범위부터 별도 구현. 서명된 opening 주문과 M5 reduce-only 예약은 타입/모델이 다르므로 직접 합치지 않음.
- **C3 (후속):** M3 회계상의 부분 할당/예약 해제·실현 PnL/수수료/펀딩과 순자산 이중계산 방지, 취소·체결 경쟁·출금 경계와 DB 전체 writer 방어. 승인된 자산/정산 정책 전 실거래 금지.
- **M5-T4:** 실제 승인된 임시 Unix 소켓 전용 PostgreSQL의 복수 DB 연결/비소유자 역할/행 잠금·데드락·재시작·중단 오류/성능 검증. 운영 DB 및 자격증명 사용 금지.

## C1 구현·불변식

- `backend/src/perp/sim-order.ts`의 `authenticateSimPerpOrderIntent`는 기존 M3 `admitSimPerpOrder`가 이미 실행하는 **동일한** v2 `PerpSimOrder` EIP-712 검증, 도메인 version=2, signer, nonce, 유효기간, 시장·collateral token·정책 revision/hash·approved source, mock snapshot/mark price deviation, 보수적인 초기증거금(ceil)을 재사용. M3 접수는 이 인증 함수를 호출하되 자체 DB 로직·행동 변경 없음. v1 공개 M2 서명 주문 재사용 불가.
- `backend/src/perp/signed-sim-risk-gate.ts`의 `assessPersistedSignedSimPerpOrder`는 verified canonical order+signature를 입력받아 **1회** `OrderTransactionManager.withTransaction` 사용. Lock order: 현재 `PAIRED` 시장 OI FOR UPDATE → 동일 계정 기존 Reduce guard FOR UPDATE(있으면 거부) → M4 포지션 FOR UPDATE → M3 shadow OPEN order FOR UPDATE → Nonce USED FOR UPDATE → 해당 계정 3개 M3 margin bucket FOR SHARE. 해당 마진에 대한 RESERVE 이중분개 operations/entries도 FOR SHARE로 조회.
- `perp_sim_orders`의 chain/domain/nonce/orderId·side/price/quantity/expiry·policy revision/hash·oracle sourceSequence·서명 인증 결과 도메인/IM와 저장 상태가 같아야 함. `order_nonces.status='USED'`와 orderId/expiry를 함께 검사. CANCELLED/nonexistent/stale 등은 fail-closed. 별도 `perp_reduce_guards` 계정이 존재하면 opening-order 체결과 reduce-only 예약 상태를 서로 혼용하지 않도록 거부.
- M3 `perp_margin_operations(action='RESERVE')`의 식별자 `orderId.slice(2)`, account, amount, AVAILABLE→RESERVED와 `perp_margin_entries` 음/양 2개 leg 및 amount 정확도를 대조. M3 bucket 3개와 버전·uint256 범위 및 `SUM(OPEN perp_sim_orders.initial_margin) <= RESERVED`를 검사. 초기 M3 잔고는 실제 입금·보관을 입증하지 않음.
- M4 포지션 snapshot과 가장 최근 체결 journal 일치를 `readSimPerpPosition`로 검사, caller expectedPositionVersion과 비교. `PAIRED` 시장의 LONG=SHORT 및 스냅샷 합계 OI=영속 `perp_market_open_interest`를 검사. 현재 실제 포지션 수정 없이 `evaluateSimPreTrade(...reduceOnly:false)`로 M5 **before/after BigInt IM/MM/Equity/leverage** 및 후보 포지션만 계산한다. 리포트의 decision=SIMULATION_ELIGIBLE은 실행 승인권이 아님.
- 결과에 사용자/signature private material이나 계정 잔액 원본은 반환하지 않는다. 주문 ID, nonce, Oracle sequence, OI/position 버전, 초기 예약량, M5 위험보고서와 `executionAuthorized:false`만 반환. 합격·불합격의 계산 과정은 DB를 쓰지 않으며 HTTP/매칭/자금 이동 호출은 하지 않는다. 시장 policy와 oracle은 승인된 테스트 context에서만 제공한다.

## 미검증 및 제한

- **가상 단일 계정 위험평가 != 양측 OI 보존이 입증된 execution**. 실제 포지션 갱신·M3 버킷 할당·실현손익/fee·인출은 C2/C3, 운영 승인 및 별도 테스트 이전까지 불가.
- C1은 서명 주문별 RESERVE op/entries를 대조하지만 DB 전체 M3 증거금 권한/자산의 실 예치 증거·체결 후 margin 재배분 이중회계까지 증명하지 않음. 동일 시장 다른 오픈 주문의 예약 합계는 현재 RESERVED 버킷 이하로 확인하되, 모든 미결제 포지션 IM·전역 자금/여러 시장 비율의 운영 인수는 미구현.
- 더 강한 불변식 보장을 위한 실제 PostgreSQL 멀티 연결과 DB role least privilege, 조건부/연속 quote 안정성, DB preflight/인증 없는 data seeding 방지, 가격 source trust 운영인수는 M5-T4·M8로 별도 유보.
