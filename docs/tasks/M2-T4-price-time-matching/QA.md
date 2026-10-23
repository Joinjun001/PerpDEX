# M2-T4 QA

상태: In Progress — M2-T4-A/B/C 로컬 완료, M2-T4-D 및 실제 PostgreSQL 다중 연결 운영 QA 미완료

- M2-T3 로컬 최종 회귀: npm run build 통과, npm test 67/67 통과 (2026-10-24).
- 실제 운영 PostgreSQL, Foundry, 배포 검증은 별도 작업.

## 2026-10-24 — M2-T4-A 코어 QA

- `npm run build` (tsc --noEmit) 통과.
- 순수 매칭 신규 테스트 **14/14 통과**, 백엔드 전체 회귀 **81/81 통과**. 상승 BUY/하락 SELL 반대편 최우선 호가, maker price, 동일 가격 FIFO, 경합 없는 결정적 오더 순서, 부분/전량/무체결, 타 시장·동일 side 격리, inactive 주문 제외, BigInt 정밀도, 120개 시드 기반 입력 합계·비음수 수량 검증.
- API·실제 PostgreSQL/다중 프로세스, 프론트엔드, 온체인 정산은 미실행. M2-T4-A는 순수 오더북 스냅샷에서 계산만 하며 실제 DB를 변경하지 않는다.

## 2026-10-24 — M2-T4-B 영속 매칭 QA (10회차)

- PGlite의 실제 PostgreSQL SQL 제약·트랜잭션/ROW LOCK을 사용한 오더북 테스트 **10개 통과**.
- 시장별 접수 카운터의 고유·안정적 증가, 같은 가격 FIFO와 다른 가격 우선, 부분/완전 체결과 메이커 호가 적용, 잔여 수량 정확성·BigInt, 사전 취소 제외·직접 자가체결 방지, 재호출 중복 체결 0, 9개 동시 동일 매칭 중 1개만 체결, 동시 취소·매칭 일관성, SQL fill INSERT 실패 시 둘 다 롤백, DB 닫기·재개방 후 시퀀스/원장/잔량 보존 확인.
- **미검증:** 운영 PostgreSQL의 실제 다중 연결/멀티프로세스 잠금 순서와 장애 복구, 현 REST API 자동 주문 등록·매칭 통합, settlement, Foundry 회귀. 실제 DB에 `004` 운영 마이그레이션 미실행.

### 10회차 전체 회귀 검증

- `cd backend && npm run build` → `tsc --noEmit` 성공.
- `cd backend && npm test` (`--test-concurrency=1`) → **91 passed / 0 failed**, 기존 81개 + 신규 PGlite 오더북 10개.
- 내부 영속 매칭 API의 DB 행 잠금·동시성, 취소 경합, 원장 외래키, SQL 오류 롤백 및 데이터베이스 재개방을 검증했다.
- 운영 PostgreSQL 서버/다중 연결·프로세스 검증은 실행할 도구가 없어 **미검증**. 기존 주문 생성 REST API에서 오더북 자동 등록·체결을 수행하는 연동도 **미구현**.

## 2026-10-24 — M2-T4-C API 통합 QA (11회차)

- 신규 `order-matching-http.test.ts` 6/6: HTTP 자동 호가 등록·교차·동가 FIFO/부분 체결, 동시 두 구매자의 메이커 잔량 보존, 같은 계정 매매 제외, 인증된 취소와 체결 생성 경합, 체결원장 오류시 주문/Nonce/접수 기록 통째 롤백 및 동일 서명 재시도, PGlite 재시작 후 기존 체결/잔량 영속성 및 접수 순서 유지.
- 기존 생성/취소/조회/멱등성 테스트는 실제 API 의존성에 따라 SQL 001~004를 로컬 적용하도록 변경. 모든 비밀키는 메모리에서 생성한 테스트 임시 계정만 사용.
- `cd backend && npm run build` (`tsc --noEmit`) 성공, `cd backend && npm test` 전체 **97 passed / 0 failed** (`--test-concurrency=1`), 기존 91개와 신규 HTTP 통합 6개.
- **운영 한계:** 로컬 HTTP/PGlite 기반 테스트이며, 운영 PostgreSQL 다중 세션/프로세스 잠금, 004 실마이그레이션, Foundry, 온체인 정산, 실제 배포는 검증하지 않았다.
