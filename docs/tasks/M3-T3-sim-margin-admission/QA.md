# M3-T3 QA

## 현재 로컬 검증 결과

- PGlite 신규 통합 테스트 **10/10 통과**: v2 서명 모의 주문/정책+oracle 바인딩/증거금 산출, 독립 cancel 서명+정확한 release, 동시 6회 재요청 단 한 건 성공, invalid policy/stale oracle/잔액 부족 fail-closed, 공개 v1 서명/가격·정밀도·계정 변조 거부, 도메인 격리, 강제 journal SQL 오류로 nonce/order/balances 롤백, 실패 취소 분개 때 nonce tombstone과 주문 상태 롤백, PGlite 디스크 재시작 후 상태/중복 보호.
- `npm run build` 통과. 전체 백엔드 `npm test` **184/184 passed, 실패 0개** (기존 174 + 신규 10).
- **모의 실행 전용**: 실제 시장 risk/mark snapshot 공급·청산·funding/PnL, 서명 v2 공개 API/매칭·부분 체결, 실 PostgreSQL 여러 연결, 실제 담보 예치/출금·Vault 보호, 운영 마이그레이션/배포·push 미검증/미실행.

- `cd backend && npm run build` 성공, `cd backend && npm test` 전체 **184/184** 통과, `git diff --check` 통과.
