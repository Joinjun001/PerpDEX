# M3-T3 RESULT

상태: **A 로컬 구현 완료 (모의 전용), B/C 후속**.

## 2026-10-24 구현 결과

- 시작 HEAD `b91908e`, `main` clean, 원격 대비 11개 로컬 커밋 앞섬. PROJECT_STATE/ROADMAP/M3-T2 SPEC·TODO·QA·RESULT 및 order-auth/signature/nonce/margin-ledger 코드 확인.
- `backend/sql/009_perp_sim_orders.sql`: 기존 `order_nonces` FK를 재사용하는 shadow signed order 저장소. 정책 전체 해시/버전·mock oracle sequence·예약금·OPEN/CANCELED 상태 저장.
- `backend/src/perp/sim-order.ts`: simulation-only EIP-712 v2 주문·독립 취소 서명, 정책 해시/오라클/market/scale 검증, BigInt 기반 보수적 initial margin 계산, nonce+shadow row+RESERVE 단일 commit, cancel+nonce tombstone+RELEASE 단일 commit. 기존 공개 v1 API와 매칭은 건드리지 않음.
- `backend/scripts/migrate.ts`: 009 수동 관리자 적용 목록만 추가. 운영 DB 적용 금지.
- `backend/test/perp-sim-order.test.ts`: 임시 EIP-712 지갑/PGlite에 한해 승인/실패/부족 증거금/이상 정책·stale oracle/잘못된 서명/중복/경합/DB 강제 실패 롤백/재시작 후 한 번만 해제 테스트.
- **주의:** M3-T3-A에는 부분 체결이 없다. 부분 체결 예약량 조정은 M4/M5 포지션/위험 회계가 선행될 때만 안전하게 구현할 수 있으며 후속으로 유지한다. 현재의 초기 증거금 계산은 경제/청산/수수료·시장 정책 미승인 모의 산식이다.
- `npm run build` 성공, `npm test` 전체 **184/184 passed**. 이번 회차 신규 **10개** PGlite/EIP-712 모의 주문·취소 테스트 통과. 실 PostgreSQL 경합 검증(M3-T4) 및 포지션/부분 체결 위험 검사(M4/M5)는 아직 수행하지 않음.
