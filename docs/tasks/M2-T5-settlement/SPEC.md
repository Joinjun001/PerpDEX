# M2-T5 SPEC — 체결 결과와 온체인 정산 연결

## 목표

M2-T4의 커밋된 `order_fills`로부터 검증 가능한 정산 후보를 만들고, 자산/정밀도·위험 정책이 명시적으로 승인된 이후에만 `CollateralVault.settle(token, from, to, amount, tradeId)` 경로를 연결한다. 오프체인 결과가 온체인 정산 성공을 의미하지 않도록 출처·정산 상태·재시도·체인 영수증을 분리한다.

## 작업 분할

1. **M2-T5-A — 영속 Settlement Outbox (이번 회차)**: SQL 005 + 내부 등록/선점/lease-fencing/재시도 상태 머신, 트랜잭션·동시성·재시작 로컬 테스트. 정산 승인/체인 전송 없음.
2. **M2-T5-B — 명시적 정산 정책 검증**: 시장별 담보 자산, 정밀도·가격 단위, 거래 증거와 사용자별 자금 흐름/위험 정책이 주어진 경우에만 검증된 정산 지시를 구성한다. 정책이 미승인인 경우 차단; 먼저 정책 스키마와 순수 검증·경계 테스트 구현.
3. **M2-T5-C — 정산 실행·영수증 어댑터**: 실제 서명/키·RPC 사용 없이 dry-run/모의 provider에서 실행 의도를 직렬화하고 `tradeId` 단위 중복 전송 차단 및 영속 Tx 기록. 실체인 실행은 승인 분리.
4. **M2-T5-D — 영수증 확인·장애 재시도/복구**: 정산 여부·실패/체인 재구성/미확정·확정 결과를 분리해 저장하고 재조정. 불명확한 브로드캐스트를 무조건 재전송하지 않음.
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
