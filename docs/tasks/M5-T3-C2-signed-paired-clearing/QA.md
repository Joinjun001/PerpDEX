# M5-T3-C2 QA

로컬 PGlite 테스트: backend/test/perp-signed-pair-gate.test.ts
- 한계가격이 다른 BUY/SELL에서 동일한 체결가 후보·fillId 및 M3/M4/M5 증명
- 위조 서명, 잘못된 side, self-match, 수량·tick·한계가 오류 차단
- 반대 주문 취소, 오라클/포지션 버전 변경, M3 RESERVE 위변조, OI 부정합
- 이미 사용된 fill ID와 SQL 예외 시 read-only 롤백

검증 명령:
- cd backend && npm run build
- node --experimental-strip-types --test test/perp-signed-pair-gate.test.ts
- npm test

## 실제 실행 결과
- TypeScript npm run build: PASS
- C2-A 집중 테스트: 6/6 PASS
- 전체 npm test: 기본 원격 실행 시간 제한(240초)으로 229/348 통과 중 중단, 테스트 실패 없음.
- 분할 회귀 보완: 초기 명령에서 기존 파일 194건 통과 + 후반 154/154 PASS = 총 348개 테스트 범위를 중복 없이 검증.
- git diff --check: PASS
- 운영 PostgreSQL·실거래·온체인 검증을 의미하지 않음.
