# M5-T3-B2 QA

- B2 신규 PGlite **13개** 정상/경계/경합 통합 테스트. 전체 TypeScript build 통과, 백엔드 **314/314 통과, 실패 0개** (기존 301 + 신규 13).
- 양쪽 1 BTC LONG/SHORT 및 각 0.6+0.3 BTC 예약에서 첫 주문 0.2 BTC 부분 체결 시 OI 1 → 0.8 BTC, 각 첫 주문 남은 0.4 BTC/consumed 0.2 BTC, 둘째 주문 남은 0.3 BTC. 각 OPEN 주문 position_version 새 2로 동시 갱신. `requested=remaining+consumed+cancelled` 보존.
- 같은 주문 연속 두 번째 0.2 BTC 체결 → OI 0.6 BTC, 이벤트 이력 4건, version 3 및 중복 body·fillId 방지. 다른 예약을 추가하여 새 포지션 수량 초과하면 거부.
- 선택 주문 또는 다른 OPEN 주문의 오래된 oracle/정책·margin fingerprint, 기존 포지션 expectedVersion, 잘못된 계정·order ID/side/price·수량 초과 시 DB 장부 변경 없이 거부.
- 여러 OPEN 예약의 cancel vs partial 경쟁에서 순차 직렬화 결과별로 미체결 합이 현재 포지션 이하. 재시작 PGlite persistent 디렉터리에서 OI·모든 OPEN order version·M4/M5 paired fill ID history 유지 및 중복 replay 거부.
- M4 양측 포지션/OI/paired journal 생성 이후 M5 이벤트 등록 중 **두 번째 계정의 SQL 오류**를 강제하여 양측 포지션·시장 OI·예약·append-only 이벤트가 모두 rollback되며 재시도 후 정상 반영되는지 검사.
- 체결 없는 A-stage shadow consumption의 M4 receipt 부재를 확인하여 B2 진입 거부. 다른 OPEN 주문의 oracle fingerprint 변조도 거부.
- 새 체인 RPC·실계정 자금·운영 DB·Foundry contract 변경 없음. **아직 실제 PostgreSQL 독립 연결 테스트는 수행하지 않음.**

- 최종 `cd backend && npm run build`: **PASS**, `cd backend && npm test`: **314/314 PASS, 0 FAIL**, `git diff --check`: **PASS**. 실 PostgreSQL·Foundry/온체인 변경은 이번 회차에서 수행하지 않음.
