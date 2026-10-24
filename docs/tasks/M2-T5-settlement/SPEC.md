# M2-T5 SPEC — 체결 결과와 온체인 정산 연결

## 목표

M2-T4의 커밋된 `order_fills`로부터 검증 가능한 정산 후보를 만들고, 자산/정밀도·위험 정책이 명시적으로 승인된 이후에만 `CollateralVault.settle(token, from, to, amount, tradeId)` 경로를 연결한다. 오프체인 결과가 온체인 정산 성공을 의미하지 않도록 출처·정산 상태·재시도·체인 영수증을 분리한다.

## 작업 분할

1. **M2-T5-A — 영속 Settlement Outbox (이전 회차)**: SQL 005 + 내부 등록/선점/lease-fencing/재시도 상태 머신, 트랜잭션·동시성·재시작 로컬 테스트. 정산 승인/체인 전송 없음.
2. **M2-T5-B — 명시적 정산 정책 검증**: 시장별 담보 자산, 정밀도·가격 단위, 거래 증거와 사용자별 자금 흐름/위험 정책이 주어진 경우에만 검증된 정산 지시를 구성한다. 정책이 미승인인 경우 차단; 먼저 정책 스키마와 순수 검증·경계 테스트 구현.
3. **M2-T5-C — 영속 정산 의도·로컬 dry-run 어댑터**: 실제 서명/키·RPC 사용 없이 dry-run/모의 provider에서 실행 의도를 직렬화하고 `tradeId` 단위 중복 전송 차단 및 영속 Tx 기록. 실체인 실행은 승인 분리.
4. **M2-T5-D — 모의 영수증 확인·장애 재조정/복구**: 정산 여부·실패/체인 재구성/미확정·확정 결과를 분리해 저장하고 재조정. 불명확한 브로드캐스트를 무조건 재전송하지 않음.
5. **M2-T5-E — M2 통합 QA/릴리스**: 종단간 불변식, 마이그레이션·운영 문서, 비밀키 없는 로컬/모의 검증과 사람 승인이 필요한 실제 PostgreSQL/Foundry/운영 실행의 구분.

## M2-T5-A 구현 계약

- 신규 `backend/sql/005_settlement_outbox.sql`은 기존 `order_fills.fill_id`를 FK로 참조하며 `fill_id` PK와 결정적 `trade_id` UNIQUE로 중복 작업을 불가능하게 한다.
- trusted `OrderSigningDomainInput`으로 체인·검증 컨트랙트를 고정하고 `listSettlementSourceFills`로 미리 검증된 실제 커밋 원장에서만 등록한다. 요청자 임의의 시장/토큰/가격/계정 정보를 Outbox에 주입할 수 없다.
- 재등록은 `ON CONFLICT DO NOTHING`이고 기존 처리 상태·lease/attempt_count를 초기화하지 않는다. 배치 등록은 하나의 트랜잭션에서 모두 성공하거나 롤백한다.
- 상태는 **PENDING_POLICY**(미승인) → **PREPARING**(로컬 데이터 준비 임대) → **WAITING_POLICY**(로컬 준비 종료, 정책 승인 필요) 또는 **RETRYABLE**(로컬 준비 재시도 대기)로만 제한한다. `ONCHAIN_SUCCESS`, `AUTHORIZED`, `BROADCAST` 같은 상태는 존재하지 않는다.
- `PREPARING` 선점은 단일 SQL 내 `FOR UPDATE SKIP LOCKED` + UPDATE, 작업별 UUID lease token·만료 시간·시도 횟수 갱신. 완료/재시도는 올바른 토큰·만료 전 lease에서만 조건부 UPDATE. 재시작 후 만료 임대는 재선점 가능하고 이전 토큰은 거부한다.
- `RETRYABLE`은 retry_after 이후에만 다시 claim할 수 있다. 실패 원인은 최대 160자로 제한하며 비밀키나 RPC·원격 전송 정보를 기록하지 않는다.
- 실 DB 마이그레이션은 서버 운영자 명시 작업으로만 실행한다. `backend/scripts/migrate.ts`에 SQL 005 등록만 하고 자동 실행 금지. 기존 주문 생성/체결 REST의 동작은 바꾸지 않는다. 정산 Outbox 등록도 자동으로 chain transaction을 발생시키지 않는다.

## 안전성·미결 사항

- 영속 Outbox는 정책/체인 정산이 아니다. 금액(`amount`), 토큰(`token`), 방향(`from`,`to`)은 시장명에서 추측하지 않는다.
- **사람 확인 필요**: 시장별 현물/파생 정산 모델, 체인별 토큰 주소와 정밀도, 증거금·청산/위험 규칙, 수수료/슬리피지 정책, 실제 컨트랙트 권한, 운영 DB 마이그레이션 및 체인 송금 승인.
- 로컬 PGlite는 실제 PostgreSQL 다중 세션/프로세스의 동시성·공정성 검증을 대체하지 못한다. Foundry 도구 없는 환경의 Solidity 회귀는 미검증으로 유지한다.

## M2-T5-B — 명시적 정책 및 per-fill 승인 서명 검증 계약 (이번 회차)

- `backend/src/settlement/policy.ts`는 신뢰된 서버 설정에서 공급한 `SettlementPolicyInput`을 명시적으로 검증한다. 정책이 HTTP 사용자 입력이나 외부 비인증 데이터에서 자동 승인되었다고 가정하지 않는다. 이 모듈은 **정산 지시 데이터만** 생성하고 지갑·RPC·Tx 서명·broadcast/자금 이동은 수행하지 않는다.
- 필수 정책 항목: `policyId`·`revision`·`status=APPROVED`, chainId/verifyingContract/market, vault/token의 0이 아닌 EVM 주소, `tokenDecimals (0..36)`, `transferDirection`(BUYER_TO_SELLER/SELLER_TO_BUYER), 명시적인 `settlementModel=EXPLICIT_APPROVED_TRANSFER`, `marginModel=EXTERNAL_RISK_ENGINE`, `feeModel=EXTERNALLY_ACCOUNTED`, `feeBps (0..10000)`, 최대 `maxAmountBaseUnits`(양의 uint256), 신뢰된 정책 승인자 `approver` 주소, 정책 유효 구간.
- **경제 원칙**: 담보 단위 금액은 체결 가격×수량으로 유추하거나 임의의 반올림/수수료·증거금 계산을 수행하지 않는다. 금액은 별도 승인자가 체결에 대해 명시적으로 서명한 `amountBaseUnits` 정수이며 수량/가격/자산/정밀도/거래 방향을 기반으로 한 실제 경제적 정합성 및 충분한 담보·리스크 검증은 외부 승인 계층 책임이다. 실제 시장 정책 승인 없이 샘플 정책을 배포하면 안 된다.
- 정산 지시를 만들려면 **실제** `listSettlementSourceFills`로 읽은 확정 체결원장 행과 도메인별 `settlement_outbox.status=WAITING_POLICY` 행이 일치해야 한다. `tradeId = keccak256(abi.encode(chainId, verifyingContract, fillId))`를 재계산하여 검증하며, 같은 체결에 대한 임시 DB 상태/불일치 정보는 전부 거부한다.
- per-fill `SettlementApprovalInput`은 승인자가 EIP-712로 `policyHash`, `tradeId`, `fillId`, `market`, `price`, `quantity`, `token`, `from`, `to`, `amount`, `deadline`을 서명한 증거다. EIP-712 domain은 체인과 정산 컨트랙트 vault 주소를 고정하며, 정책 hash에는 수수료/정밀도/방향/정책 버전/허용금액 및 정책 유효 기간 전체가 반영된다. 확인된 `approver` 외 서명자는 거부한다.
- 미승인·철회·만료·불완전 정책, 누락·잘못된 승인 서명, 서명 후 입력 변경, 중복 체결 식별자 교체, 승인 만료/정책 유효 기간 외, MAX 정산 금액 초과, 타 체인/시장/컨트랙트, 자가정산을 거부한다. 금액은 JS Number가 아닌 BigInt로 비교·검사한다.
- 생성하는 `SettlementInstruction`은 `tradeId`, `fillId`, `market`, `chainId`, `vault`, `token`, `from`, `to`, `amount`, `tokenDecimals`, `policyHash`, `approvalDeadline`만 포함한다. 이는 **드라이런/결정론적 실행 후보**이지 실제 정산 완료·전송 권한·중복 전송 방지 기록이 아니다. M2-T5-C/D에서 실행 기록·체인 `settledTrades` 확인·영수증 상태 조정과 강한 멱등성 경계를 별도로 구현한다.
- 승인자 주소와 정책 원본은 운영자의 신뢰된 설정·레지스트리로만 공급해야 한다. 코드상 `status=APPROVED` 문자열만으로 신뢰 근거가 생성되지 않는다. 실제 운영의 승인 책임 및 정책 선택은 별도 사람 확인 필요.

## M2-T5-C — 영속 정산 의도 및 로컬 dry-run (이번 회차)

- `006_settlement_intents.sql`은 검증 완료된 Outbox 행을 FK로 참조한다. `fill_id` PK와 `trade_id` UNIQUE를 갖고, 승인된 지시의 완전한 정규화 JSON·결정적 `instruction_hash`를 함께 영속한다. 정책·서명 검증을 우회하는 공개 삽입 API는 없다.
- `recordApprovedSettlementIntent(transactions, trustedDomain, fillId, policy, approval, nowSeconds)`는 **M2-T5-B의** `prepareSettlementInstructionFromLedger`를 통과한 지시만 허용한다. DB 등록은 Outbox의 `WAITING_POLICY`를 다시 검사하는 `INSERT ... SELECT ... ON CONFLICT DO NOTHING` 트랜잭션이다. 기존 같은 `fill_id`의 요청이라도 token/amount/대상/policyHash를 수정하려 하면 오류로 거부하며, 저장된 상태나 모의 실행 기록은 리셋하지 않는다. 중복 요청도 최신 정책·승인 검증을 통과해야 하며 오래된 서명은 새 전송 권한이 되지 않는다.
- `executeSettlementDryRun`은 **내장된 로컬 calldata 인코더**로 M1 `CollateralVault.settle(token,from,to,amount,tradeId)`의 ABI 호출 데이터를 구성한다. 임의 RPC/provider callback, 지갑 서명, 토큰 이전, `eth_sendRawTransaction`은 존재하지 않는다. calldata와 `keccak256(calldata)` 검증 결과를 반환하되 실제 tx hash/receipt/confirmation으로 표기하지 않는다.
- 영속 상태는 `PREPARED → SIMULATING → SIMULATED`, 실패 또는 충돌 시 `SIMULATING → UNKNOWN` (별도 수동 격리) 뿐이다. 시작 시 DB 조건부 UPDATE로 토큰을 선점하고 트랜잭션을 커밋한 뒤 모의 실행, 성공 시 해당 토큰으로만 SIMULATED 기록을 커밋한다. 동시 작업의 동일 체결은 한 건만 선점. `SIMULATING` 상태에서 프로세스 종료·최종 커밋 오류·결과 불확실 시 **자동 재시도 금지**. `quarantineInterruptedSimulation`은 충분히 오래된 작업을 `UNKNOWN`으로 격리하는 명시적 복구 API이며 UNKNOWN에서 자동 재시도 경로를 제공하지 않는다.
- 저장 지시의 변경·파손은 `instruction_hash` 재계산 및 tradeId/fillId 정합성 검사에서 거부한다. 동일 정책·승인으로 재등록하더라도 SIMULATED/UNKNOWN 상태를 PREPARED로 되돌리지 않는다.
- 정책 검증과 DB 등록 사이의 시간차를 대비하여 쓰기 트랜잭션에서 Outbox 상태를 재확인한다. 이 작업은 **실제 자산/마진 안전성 보증이 아님**. 정책 레지스트리의 신뢰·정책 철회 전파, 다중 체결 합계·자금 잔액 확보, 체인 중복 정산 판정은 후속 별도 승인 및 구현 책임이다.
- `backend/scripts/migrate.ts`에 수동 적용 목록 006만 추가한다. 운영 DB 적용·실제 브로드캐스트, 네트워크·인증 정보 사용은 금지된다. M2-T5-D에서 정산 영수증/체인 상태 확인 및 모호한 브로드캐스트의 영속 reconciliation을 분리 구현해야 한다. 현재 SIMULATED는 **로컬 ABI 인코딩 성공만**을 의미한다.

## M2-T5-D — read-only MOCK 영수증 재조정 계약 (이번 회차)

- 신규 `backend/sql/007_settlement_reconciliations.sql`은 기존 `settlement_intents`의 `(chain_id, verifying_contract, fill_id)` 고유 인덱스 및 FK를 기반으로 `fill_id` PK/`trade_id` UNIQUE 재조정 이력을 저장한다. `source=MOCK_READONLY`로 고정하여 실제 체인 영수증으로 오인하지 않게 하고, `status`, tx/block 식별자·blockNumber, 관측 수, 증거 fingerprint, 오류 사유를 영속 기록한다. 운영 DB에서 007 자동 실행 없음.
- `backend/src/settlement/reconcile.ts`는 실제 RPC/provider URL·키·서명·send 메서드가 전혀 없는 `InMemoryMockReceiptProvider`의 **읽기 전용 모의 관측**만 받는다. 영수증 미존재는 `UNCONFIRMED`, pending/unavailable/확인 횟수 부족/기존 잠정 증거 소실은 `RECHECK_REQUIRED`, 신뢰된 모의 스냅샷의 명시적 실패(확정 mock revert)는 `MOCK_FAILED`, 명시적 성공(확정 mock `Settled` 이벤트와 `settledTrades=true`)은 `MOCK_VERIFIED`, 사전 증거의 tx/block 식별자 충돌은 `UNKNOWN`으로 분리한다.
- 성공 모의 관측은 도메인 chainId, 승인된 vault 주소, 정확한 tradeId, tx/block 해시·블록 번호·확인 횟수, M1 `CollateralVault.Settled(tradeId, token, from, to, amount)`의 모든 인수 일치, 모의 `settledTrades=true`를 검증해야 한다. 실패 확정 모의 영수증에서는 event 부재·모의 `settledTrades=false`를 요구한다. 체인과 이벤트/상태의 불일치는 조용히 넘어가지 않고 예외 및 데이터 미변경으로 차단한다. `confirmations`의 최소 기준은 별도 검증된 정수 입력이며, 동일 증거의 추가 확인은 허용한다.
- `MOCK_VERIFIED`/`MOCK_FAILED`는 **되돌릴 수 없는 모의 검증 기록**이며 새 관측이 누락·pending·상충하면 오류를 반환하고 기존 결과를 유지한다. 잠정 txHash/blockHash가 새 관측과 다르면 `UNKNOWN`으로 격리 후 수동 확인만 허용한다. `UNKNOWN`은 후속 모의 관측으로 자동 복구하지 않는다. 의도의 `SIMULATED`는 mock 결과로 바뀌지 않으며 송신 또는 전송 상태를 추가하지 않는다.
- 실제 정산 성공 또는 최종 확정은 **절대 주장하지 않는다**. 실제 블록체인 검증에는 승인된 읽기 전용 RPC 경로, canonical chain head/finality 및 재조직 감시, 실제 `transactionReceipt` 로그와 `settledTrades` 호출, 이벤트 서명/topic 검증, 호출된 컨트랙트 코드·주체·토큰 자산 원장 검증, 재브로드캐스트 정책이 필수다. 이 모든 사항은 실환경/사용자 승인과 별도 검증 전까지 미구현·사람 확인 필요 상태를 유지한다.
- 기존 M2-T5-C PREPARED 의도는 영수증을 조회하지 않으며 SIMULATED 또는 격리 UNKNOWN만 조회 허용한다. 영수증 부재/네트워크 에러를 재전송 신호로 사용하지 않는다. 외부 자격증명·실제 RPC 접근·거래 전송/배포는 금지.

## M2-T5-E — 공개 HTTP부터 모의 영수증까지 종단간 로컬 인수

- `backend/test/m2-end-to-end.test.ts`는 공개 REST API로 테스트용 주문 지갑이 EIP-712 주문을 실제 서명하고 FIFO 잔량·체결 2건을 만든 뒤, **같은 체결 행**을 M2-T4-D → M2-T5-A/B/C/D API로 인계하는 단일 테스트를 제공한다.
- 실제 HTTP 재전송 200 멱등 응답과 체결 원장의 고유 행, 최대 2^120 규모 BigInt 수량 보존, 거래별 승인된 금액 2^200/2^199 초대형 uint256 정수, 도메인 격리, 고유 정산 의도 및 재송신 차단을 확인한다. `MOCK_VERIFIED`는 모의 확정, 충돌하는 블록은 `UNKNOWN`으로 격리한다. PGlite 디스크 DB를 닫고 재연 후 001~007 순차 재적용 시 체결/의도/모의 증거가 변경되지 않는다.
- 별도 실패 경로는 **HTTP에 이미 반영된 체결**이어도 Outbox 준비 미완료·위조 승인 금액이면 정산 지시가 생성되지 않으며, 중복 HTTP 주문 전송이 새로운 체결을 발생시키지 않는지 검사한다.
- 001~007 각 마이그레이션 파일은 로컬 DB에서 지정된 순서로 재적용할 수 있어야 하며, 선행 스키마 없이 007을 단독 적용하는 잘못된 순서는 DB 오류로 거부된다. 운영 DB에서는 테스트 프로세스로 마이그레이션을 실행하지 않는다.
- `docs/releases/M2-LOCAL-ACCEPTANCE.md`의 사람 확인 게이트가 남아 있는 동안 **M2의 로컬 기술 인수만 완료**로 기록한다. 실제 PostgreSQL 다중 연결, 외부 정책·리스크 승인, 실제 체인 RPC/실자산·영수증/블록 finality, Foundry 테스트·운영 마이그레이션·배포는 별도 승인이 필요하고 현재 로컬 모의 성공으로 대체되지 않는다.

## M2 승인된 후속 QA — 개발용 PostgreSQL/Foundry 실환경 회귀

- 사용자가 개발용 PostgreSQL 구성과 Foundry 로컬 테스트에 명시적으로 동의한 후에만 수행한다. 운영 DB/실체인 송신·자격증명·push는 승인하지 않은 상태를 유지한다.
- 개발용 PostgreSQL 15는 외부 포트 없이 Unix socket 및 고정 전용 DB `perpdex_autopilot_test`에서만 테스트하고, 매 테스트마다 분리된 `perpdex_qa_*` 스키마에 `001~007`을 적용한다. `backend/qa/postgres-local.test.ts`는 서버 호스트·DB/사용자/접속 방식 가드를 유지하며, 의도치 않은 데이터베이스 연결은 오류로 차단한다.
- 실제 pg Pool 다중 연결 nonce/시장 매칭 직렬성, Outbox `FOR UPDATE SKIP LOCKED`와 롤백 후 안전한 재시도 등의 차이를 PGlite 환경과 구분해 검증한다.
- Foundry는 순수 로컬 `forge build && forge test -vv`로 역할/담보/정산/withdraw 계약 및 fuzz/invariant를 재검증한다. 리허설/온체인 방송/실자산은 없음.
- 이 검증 이후에도 승인된 시장경제·담보 위험 모델, 실제 스테이징 운영/백업·권한, 멀티프로세스, 실체인 영수증 검증은 별도 게이트다.
