# M5-T3-B1 QA

- PGlite 신규 B1 9개 + 기존 A 확장 회귀 1개: 이미 PAIRED 시장에 1 BTC LONG/SHORT에서 양쪽 0.4 BTC reduce-only 예약/모의 일치 체결 → 양측 새 포지션 ±0.6BTC, OI=0.6BTC, 공통 `fillId`를 양쪽 M4 저널과 M5 `CONSUME` 이벤트에 보존. M3 3버킷은 읽기 잠금만, 금액 이동/인가 없음.
- 예약 존재 계정에 legacy `applySimPairedFill` 또는 `applySimPerpFillToLedger` 호출하면 강제 거부. 9회 중복 병렬 예약 체결 중 정확히 하나만 성공, 한쪽 예약 없으면 전체 거부.
- 정책에 부합하는 oracle sequence·margin bucket version 동일성 검사. 한쪽 shadow consume 후 기존 예약을 실제 축소에 이중 사용하려는 경우 거부.
- 강제 SQL `perp_reduce_events` 오류 시 M4 양쪽 snapshot/저널, 시장 OI, 공통 paired receipt, M5 예약/이벤트 전부 rollback; 오류 해소 후 동일 체결 재시도 성공.
- PGlite close/reopen 후 paired receipt, 이벤트 2건, OI·재생 ID 차단 보존. 포지션 줄어든 후 신규 reduce-only 예약이 새 size/version만 사용함.
- **미검증:** 실제 PostgreSQL 다중 연결·다른 진입 경로/저수준 writer 우회, 여러 열린 reduce-only 주문의 부분 매칭 및 다양한 위험 정책, 실제 M3 margin/실 자산·funding/fee/청산/온체인. 전체 backend **301/301 PASS, 0 FAIL** (기존 291 + 신규 B1 9 + M5-T3-A guard 회귀 1), `npm run build` 및 `git diff --check` PASS.

- 최종 `cd backend && npm test`: **301 tests, 301 pass, 0 fail**. `cd backend && npm run build`: 성공. Foundry/실 PostgreSQL 별도 호출 없음(컨트랙트/운영 환경 변경 없음).
