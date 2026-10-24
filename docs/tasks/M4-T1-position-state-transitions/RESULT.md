# M4-T1 RESULT

상태: **M4-T1-A 로컬 순수 포지션 엔진 구현·유닛 테스트 완료**, M4-T2 영속화 이전 실거래 적용 불가.

## 2026-10-24 구현

- 시작 상태: `main` clean, HEAD `c88c5c0`, `origin/main` 대비 13 커밋 ahead. ROADMAP/PROJECT_STATE/아키텍처/M3-T4 SPEC·TODO·QA·RESULT 및 M3-T1 fixed-point/market-config/price-snapshot 확인.
- `backend/src/perp/position-engine.ts`: 순수·불변 PerpPosition 생성, One-way LONG/SHORT 증가·축소·flat·flip, 정확한 entryCost/PnL numerator, collateral quote 단위로의 명시적 BigInt truncate, 신뢰 MarketConfig 및 local mock Snapshot/mark validation, 미리 정해진 가격 tick/lot/OI와 int256/uint256 정밀도/overflow 검사.
- `backend/test/perp-position-engine.test.ts`: 신규 **19개** 단위 테스트로 상태/회계 전이, PnL 부호, 두 단계 이상 closing/반올림 잔여, 100회 분할 거래 dust, stale oracle/domain, extreme 범위 실패/버전·즉시 replay 차단을 검증.
- 엔진에 DB/stateful 영속 기록이 없으므로 비연속 이전 fill ID 중복은 순수 엔진 alone으로 **차단하지 않음**. 고유 ID 영속 제약·원자적 position log/재시작 복구는 **M4-T2** 다음 작업.
- 무기한 선물 주문 실거래 활성화, position margin 연계/수수료·펀딩·청산, Vault 온체인 RPC/자금 이동/운영 DB/배포/remote push는 실행·구현하지 않음.
- `npm run build` 통과. 전체 `npm test` **203/203 통과 (0 failed)**, 신규 19/19. `git diff --check` 통과.
