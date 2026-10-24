# M2 로컬 통합 인수 및 운영 전 승인 체크리스트

기준일: 2026-10-24. 프로젝트: `/shared/PerpDEX`. 기준 범위: 로컬 PGlite/TypeScript/모의 영수증.

> **상태: 로컬 PGlite + 임시 실제 PostgreSQL 15 복수 연결 + Foundry 빌드/회귀 완료, 실운영 릴리스 불가.** M2의 Deposit → Order → Matching → Settlement → Withdraw 중 *실제 자금 보관/송금*과 *온체인 Settlement 영수증 검증*은 테스트용 모의 처리로 대체되지 않는다. `SIMULATED`, `MOCK_VERIFIED`는 실제 체인 성공 상태가 아니다.

## 1. 독립 로컬 검증 절차 (운영 자격증명 불필요)

```bash
cd /shared/PerpDEX/backend
npm run build
node --experimental-strip-types --test test/m2-end-to-end.test.ts
npm test
```

- 실제 HTTP 서버는 자동 할당된 `127.0.0.1` 루프백 포트에서 테스트 동안만 구동하고 종료한다. 테스트에 실제 자산·외부 RPC·API key·운영 DB 연결은 사용하지 않는다.
- 테스트는 PGlite에 `001_order_nonces.sql`부터 `007_settlement_reconciliations.sql`까지 순차 적용하고, 완성된 스키마 재적용이 idempotent임을 확인한다. 또한 007만 먼저 적용할 때 FK/선행 테이블 누락으로 실패함을 확인한다.
- `m2-end-to-end.test.ts`: **공개 HTTP 서명 주문 → FIFO 매칭·BigInt 부분 체결 2건 → 원장 → Outbox → 작업 임대 → 정책/서명 승인 → 고유 dry-run → 모의 영수증 확정·불확실 격리 → PGlite 디스크 재시작 → 스키마 재적용 및 기존 상태 확인**을 한 번에 검증한다.
- 같은 서명 요청의 HTTP 200 재조회·고유 Nonce·체결원장/정산 의도 중복 방지, 신뢰 정책 승인 실패 시 지시 저장 금지, 다른 체인 스코프 분리, uint256 범위 내 초대형 정수 정밀도, 실패 SQL 원자성 및 영수증 모순·다중 확인은 전체 회귀에서 재검증한다.
- 독립 로컬 DB 재시작은 테스트 전용 디렉터리에서만 수행된다. DB close → reopen → 마이그레이션 재적용 → 원장·outbox·intent·mock evidence 조회 → 멱등 재요청을 검증한 후 테스트 임시 데이터를 정리한다.

## 2. 운영 인수 게이트 — 모두 사람 확인 필요 (AutoPilot 실행 금지)

- [ ] **도메인·체인**: 실제 chainId, EIP-712 검증 컨트랙트, Vault, 주문 토큰/마켓 식별을 운영자가 검토하고, 컨트랙트 bytecode/배포 결과를 별도 확인
- [ ] **경제·위험 모델**: 시장별 토큰·정밀도·담보 보유/증거금·수수료·청산/회계 규칙을 승인하고 지급 지시의 계정·금액 생성 책임자를 지정. `status=APPROVED`가 임의 클라이언트 데이터가 되지 않도록 보안 정책 저장소 구축/검증
- [ ] **실 PostgreSQL**: 별도 개발/스테이징 인스턴스에서 *백업·복원 계획/트랜잭션 경계/락·용량·권한* 승인 후 001→007 마이그레이션 순서대로 테스트; 운영 데이터 직접 변경 금지. `backend/scripts/migrate.ts`는 모든 SQL을 일괄 적용하므로 계획·백업·DB 역할 검토 후에만 실행. 스키마 재적용/버전/실패 시 롤백 검증
- [ ] **동시성**: 실제 PostgreSQL 여러 프로세스/연결에서 order nonce, market FIFO, Outbox `FOR UPDATE SKIP LOCKED`, intent unique ID 및 정산 영수증 잠금 검증
- [ ] **컨트랙트**: Foundry 설치된 승인된 환경에서 `cd contracts && forge build && forge test` 및 체인·권한·잔액·불변식/중복 tradeId·정산 에러/이벤트의 회귀를 실행하고 결과 기록. 2026-10-24 실제 로컬 Foundry 35/35 통과. 이후 스테이징/운영 별도 인수 필요
- [ ] **실제 Settlement 통합**: 명시적 권한 승인 하에만 RPC read-only receipt/`settledTrades`, 블록 finality/reorg 처리, `eth_getTransactionReceipt` logs 및 `CollateralVault.Settled` 이벤트 topic/address, chain code, 중복/모순 영수증을 신뢰 가능한 출처로 검증. 지금 코드는 **메모리 모의 Provider 전용**이며 실제 온체인 수행/감시가 구현되어 있지 않음
- [ ] **전송 권한 분리**: 트랜잭션 실제 서명·nonce 관리·원자적 영속 송신 outbox·브로드캐스트·상태 복구의 설계 검토 및 별도 승인. 현재 **실제 체인 전송 경로가 없음**; 알 수 없는 결과를 자동 재전송하는 정책 금지
- [ ] **릴리스·배포·소스 공개**: 모든 승인자 서명, Vault 역할 관리, 비밀정보 취급, 배포/마이그레이션 및 Git 원격 push를 사람에게 별도 승인 받은 뒤 수행. AutoPilot에서는 절대 자동 실행하지 않음

## 3. 환경 변수/개발 명령 구분

- 로컬 TypeScript 검증은 환경 변수 없이 실행한다. backend `npm run start`는 운영 PostgreSQL `DATABASE_URL`, `PERPDEX_CHAIN_ID`, `PERPDEX_VERIFYING_CONTRACT`를 요구하므로 AutoPilot에서 실행하지 않는다.
- `npm run db:migrate`는 승인된 실제 PostgreSQL에 DDL을 쓰므로 **이 문서의 로컬 검증 절차에 포함하지 않는다**.
- `cd contracts && forge test`는 설치/의존성 점검 후 승인된 환경에서만 수행한다. 로컬 Foundry 35/35 테스트 통과를 확인했으나 실제 체인 배포/재현성/운영 환경 검증은 별도 인수 항목이다.
- 테스트 서명 키는 테스트에서 메모리로 생성되는 일회성 계정이며 실제 자격 증명이 아니다.

## 4. 로컬 최종 결과

- 신규 종단간 테스트: **3/3 passed**.
- 전체 backend 자동 테스트: **149/149 passed / 0 failed**.
- `npm run build` 및 `git diff --check`: 성공.
- 임시 실제 PostgreSQL 15.19 복수 연결/DDL/잠금/롤백 테스트 **4/4×3회**, Foundry 로컬 **35/35** 통과. 상세: [`M2-LOCAL-PG-FOUNDRY-QA.md`](M2-LOCAL-PG-FOUNDRY-QA.md).
- 테스트 완료 후 운영 PostgreSQL·실제 체인 환경으로의 변경은 실행하지 않음.

## 5. 인수 판정

- **충족:** 공개 HTTP 서명 주문 → 실제 오프체인 체결 → 영속 원장 및 정산 준비 → 검증된 정책 승인 *테스트 픽스처* → dry-run calldata → 모의 영수증 재조정 → 재시작 복구. 타입 검사, PGlite/HTTP 통합 테스트와 전체 백엔드 테스트.
- **미충족:** 스테이징/운영 PostgreSQL 멀티프로세스/백업·접근제어, 승인된 시장 회계·위험 정책, 실제 Vault 계약 호출·전송·온체인 영수증, 운영 배포/모니터링/보안 검토. 개발 전용 임시 PostgreSQL 15 및 Foundry 로컬 검증은 통과.
- **결론:** M2-T5-E 로컬 작업을 완료해도 M2를 운영에서 사용 가능한 서비스라고 표시하거나 `DONE`으로 처리하지 않는다. 남은 릴리스 게이트는 명시적 승인·실환경 준비 없이는 자동으로 진행할 수 없다.
