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

## 2026-10-24 C2-B1 영속 제약 QA

- 마이그레이션: `backend/sql/015_perp_signed_opening_fence.sql` (기존 001~014 뒤 적용)
- 테스트: `backend/test/perp-signed-fence.test.ts`, 신규 **10/10 PASS**
- 정상: EIP-712 v2 주문 admission/서명 취소/예약 해제, C2-A read-only 검증, 무관 계정 M4 paired fill, 015 재적용
- 차단: 기존 M4 paired writer의 signed OPEN 우회, 직접 position snapshot UPDATE, 무연계 M3 ALLOCATE, signed order DELETE/고정 필드 수정, nonce-only 상태 위조, M3 역사 행 UPDATE/DELETE, RESERVED 버킷을 OPEN 의무량 미만으로 훼손
- `npm run build`: PASS
- 관련 회귀 파일 5개: `node --experimental-strip-types --test --test-concurrency=1 test/perp-signed-fence.test.ts test/perp-signed-pair-gate.test.ts test/perp-signed-risk-gate.test.ts test/perp-sim-order.test.ts test/perp-paired-clearing.test.ts` → **54/54 PASS**
- 최초 병렬 테스트는 PGlite 테스트 프로세스 2개가 SIGKILL로 종료됨; 정상적인 단일 동시성 제한 옵션으로 재실행하여 실패 없이 종료. 단일 전체 `npm test`는 이번 회차 미실행.
- 독립 임시 PGlite에 SQL 001~015를 순서대로 적용: PASS, 신규 trigger 7종 등록 확인
- `git diff --check`: PASS
- 실제 운영/스테이징 DB, 권한 정책, 동시 PostgreSQL 세션, 체인/실거래 검증은 수행하지 않음. Trigger를 disable할 수 있는 DB 관리자 권한에 대한 방어 보장이 아니며, 서명된 취소의 암호학적 인증은 TypeScript 내부 서비스가 담당함.
