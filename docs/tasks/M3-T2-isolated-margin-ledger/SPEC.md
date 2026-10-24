# M3-T2 SPEC — 격리 증거금 영속 이중 분개 원장

상태: M3-T2-A 로컬 구현·검증. 개발용 데이터베이스 전용, 운영 담보/계약과 연결하지 않음.

## 작업 분할

- **M3-T2-A (이번 회차):** `008_perp_margin_ledger.sql`을 추가하고 계정의 가용(AVAILABLE)/예약(RESERVED)/포지션(POSITION) 담보 간 보존되는 원자적 내부 이동 기능을 구현한다. 마켓·토큰·체인·계정마다 독립된 버킷 잔액과 operation journal을 유지하고 작업 ID별 정확히 한 번 기록하도록 한다.
- **M3-T2-B (후속 의존 작업):** 향후 신뢰 가능한 실제 담보 입출금 증명·부채/리스크 회계와 재조정할 수 있는 검증된 입출금 계정/회계 이벤트 계약. **인증되지 않은 자금 발행/가용 잔액 증가 API는 만들지 않는다.** 실제 입출금은 M8 ClearingHouse 및 승인 이후에만 가능.

## M3-T2-A 세부 요구사항

1. 스코프: EIP-712 `chainId`,`verifyingContract` + `market` + `collateral_token` + `account`. 검증된 nonzero EVM 주소를 소문자로 정규화한다. 실제 시장/담보 활성화·마진 정책 승인은 아직 미완료.
2. `perp_margin_balances`: 세 버킷의 문자열 원자 단위 비음수 uint256 잔액·버전. DB의 3행을 사전 생성할 때는 `0`만 삽입할 수 있으며, **입금·공급·잔액 발행 API는 없다.**
3. `perp_margin_operations`: 시장·담보 토큰 내 고유 `operation_id`로 멱등화. 재사용 시 계정·action·금액·버킷이 기존과 같아야 하며, 다르면 오류. `perp_margin_entries`: operation당 음수 차변 1행·양수 대변 1행, DB FK와 원자 트랜잭션으로 기록.
4. 내부 이동: `RESERVE` AVAILABLE→RESERVED, `RELEASE` RESERVED→AVAILABLE, `ALLOCATE` RESERVED→POSITION, `UNALLOCATE` POSITION→AVAILABLE. 임의 버킷 조합/임의 외부 계정 이체 입력은 제공하지 않는다. 각 작업에 대해 출발 잔액 ≥ 이동 금액, 목적 잔액·총합 ≤ uint256, 작업 전후 세 버킷 합계가 정확히 일치해야 한다.
5. `OrderTransactionManager.withTransaction` 안에서 operation 삽입·중복 확인, 버킷 행 초기화, `ORDER BY bucket FOR UPDATE`로 안정적 잠금, 이전 금액 조건부 UPDATE, 두 ledger entry 삽입, 잔액 보존 검증을 완료하거나 모두 롤백. 실제 PostgreSQL 다중 프로세스 성능·데드락 불변식은 M3-T4 스테이징/개발용 PG 통합 테스트로 확인한다.
6. 공개 주문 API/기존 M2 매칭·취소/정산 경로에는 연결하지 않는다. 특히 `RELEASE`/`UNALLOCATE`에는 아직 체결·포지션·위험 엔진의 증명이 연계되지 않았으므로 **외부에서 호출 가능한 API를 열지 않는다.** M3-T3~M5에서 신뢰된 주문/포지션 상태 전이와 같은 DB 트랜잭션에 묶어 검증하도록 한다.

## 로컬 테스트용 opening fixture 규칙

- PGlite 테스트에서만 시작 AVAILABLE 잔액을 `test/perp-margin-ledger.test.ts`의 비공개 SQL fixture helper로 직접 넣는다. 이는 **실제 예치 증명이 아니며 회계 opening balance의 검증된 기록도 아니다**. production 코드에는 faucet, funding, credit, signed deposit, unsafe admin mint 함수/마이그레이션이 없다.
- 입금 증빙 경로가 구현되지 않은 현재 운영 데이터베이스에 `perp_margin_balances`의 실제 가용증거금을 생성하거나 이 체계를 출금 가능 잔액으로 간주해서는 안 된다.

## 안전 제한 및 완료 기준

- 테스트: 중복 operation, 2개 posting 합계 0, total margin 보존, 다른 도메인/계정/토큰 격리, 병렬 동일/다른 ID 요청, 버킷 부족·음수/정밀도/overflow, journal 삽입 실패 롤백, PGlite 재시작 복원·변조 탐지.
- `npm run build`, 전체 `npm test`와 `git diff --check` 통과 후 로컬 커밋. 실제 온체인 자금 이동, 실제 운영 DB 스키마 적용, 배포·push·키 사용 금지.
