# M5-T3-C3 — 서명 주문 이후 증거금/포지션 회계

## 분할 및 범위

- **C3-A (이번 회차)**: 정책값 없는 읽기 전용 계정별 signed 주문 OPEN/CANCELED/FILLED 책임·M3 RESERVED/POSITION·M4 포지션/표시손익 교차 대조. 어떠한 체결·입출금·PnL 반영도 하지 않고 실행 권한 반환 금지.
- **C3-B (로컬 구현 완료)**: 직접 SQL이 주문과 nonce를 함께 CANCELED로 바꾸고 RELEASE 기록을 누락해도 현 SQL 015~017에서 커밋되는 취소 무결성 결함을 해결. 취소 요청의 EIP-712 인증은 서비스에서 수행하며 DB에서는 불변 취소 영수증-주문-ID-M3 RELEASE 양쪽 분개와 RESERVED 잔고를 COMMIT 제약으로 검증해야 함. 기존 서명된 취소 API 호환 및 롤백 검증 필수.
- **C3-C1 (이번 회차)**: SQL 019로 영속 주문 전량과 기존 terminal 영수증에서 계산한 누적 체결/미체결/실행 가능 수량을 읽기 전용으로 투영하고, OPEN/CANCELED/FILLED의 현재 FULL-only 불변식을 COMMIT 검증한다. PREPARED는 체결량 0. 새 partial 체결·증거금 이동 기능을 열지 않는다.
- **C3-C2-A (이번 회차 로컬 완료)**: 신규 SQL 020의 COMMIT 제약으로 서명 주문 계정별 OPEN 예약/기존 FILLED 할당 의무, RESERVED/POSITION 실제 잔고와 모든 M3 append-only 누적분개 합계를 대조. 계정에 붙은 M3 연산의 정확한 두 분개/경로/소유자를 검증하고 signed RESERVE, cancel RELEASE, terminal ALLOCATE의 기여를 비서명 M3 잔여금과 분리. 신규 자금이동 경로는 생성하지 않음.
- **C3-C2-B (다음)**: 실제 로컬 개발 PostgreSQL 별도 세션에서 동시 서명 admission·취소·FULL 체결 경합 및 DDL/role 최소권한 검증을 설계·진행. PGlite 단일 프로세스 병렬 Promise는 실제 PostgreSQL 동시 연결 검증을 대체하지 못함.
- **C3-C3 (후속)**: 새로운 부분 체결·잔여 예약금 모델과 영속 증거금 배분 이벤트를 별도 승인된 정책에 따라 설계. 취소 시 이미 체결된 누적량과 잔량을 구분하되, SQL 015~019를 약화시키지 말 것.
- **C3-D (후속)**: 포지션 감소와 실현 손익 계산-회계 연결, fee/funding은 승인된 정책 수치가 정해지기 전 정산 금지. 계산만 필요한 경우 기존 M4 numerator 기반 표시는 지원.

## C3-A 불변식

- 동일 trusted market context 및 검증된 오라클; market OI row를 트랜잭션에서 잠금.
- signed 주문과 영속 nonce 상태/ID/만료시간, 최초 M3 RESERVE operation 및 2개 분개를 대조.
- OPEN → 총 IM 부채를 RESERVED bucket 잔액으로 커버해야 함.
- CANCELED → nonce CANCELED + 파생된 주문별 deterministic RELEASE 작업 ID, 금액, 경로, 양쪽 분개 모두 있어야 함.
- FILLED → nonce USED + terminal execution/preparation 영수증 1개, 해당 계정의 정확한 M3 ALLOCATE 기록 및 POSITION bucket의 커버 확인.
- M4 포지션과 실현·미실현 PnL 표시는 기존 신뢰된 position/mark 함수 사용. PnL을 M3 잔고로 자동 지급하지 않으며 fee/funding은 NOT_ACCOUNTED.
- 잔여 reserved/position 금액은 출금 가능액 아님. read-only 분석은 체결 시점 실행 가능성 증명이 아니고, 다른 PG 연결의 새로운 주문 insert를 직렬화한다고 주장하지 않음.

## 제약

SIMULATION_ONLY, 로컬 /shared/PerpDEX 한정. SQL 015~017, 기존 체결·입출금 경로 변경하지 않음. 운영 DB/실체인/실자금/push/배포 금지.

## C3-B 취소 커밋 무결성 구현 범위

- 신규 SQL 018 `perp_signed_cancel_receipts`: domain/account/nonce/orderId/market/collateral/release ID/IM 금액/취소 만료·서명 digest·signature(검증된 입력으로부터 저장) 불변 기록. FK와 행 불변식, 지연 COMMIT 트리거를 설치한다.
- SQL 018은 CANCELED 상태와 nonce CANCELED, 원래 서명 주문 identity·IM, M3 RELEASE operation과 RESERVED→AVAILABLE 분개 2개, RESERVED 장부의 기록 합계를 교차 검증한다. 원장/잔고, nonce, 주문, 새 receipt 각각의 독립 SQL 변경도 감사한다.
- 서비스 `cancelSimPerpOrder`는 EIP-712 인증을 완료한 뒤 기존 nonce·상태·M3 RELEASE와 같은 TX에 영수증을 INSERT한다. SQL 017이 존재하지만 018이 없으면 새 취소는 fail-closed. 기존 017이 없는 레거시 테스트 스키마는 기존 취소 동작을 유지하되 018 보호 수준을 주장하지 않는다.
- **운영 마이그레이션 제한:** 영수증 없는 기존 CANCELED 기록을 무단으로 가짜 서명/영수증으로 채우지 않는다. SQL 018 DO 블록이 차단하며 검증된 과거 영수증 재구축 또는 운영자 승인된 별도 마이그레이션이 필요하다.
- 서명 복구 검증은 viem 내부 서비스에서 수행한다. SQL 트리거 단독으로 ECDSA 서명을 인증하는 것은 불가능하고 DB owner/DDL 또는 receipt·ledger 전체 조작 권한에 대한 보장은 없다. M5-T4 DB role 최소 권한으로 분리해야 한다.
- 실제 실자금·실거래·출금·메인넷 기능은 추가하지 않는다.

## C3-C1 주문 수량 원장 불변식

- SQL 019 `perp_signed_order_fill_progress` VIEW는 `perp_sim_orders.quantity`(원래 서명 수량)와 **실제 커밋된** SQL 017 `perp_signed_pair_executions`+SQL 016 PREPARED의 BUY/SELL 레그별 체결량만 합산한다. PREPARED 자체는 체결량이 아니다.
- 무조건 `total = committedFilled + unfilled`, `0 <= committedFilled <= total`, 합계 uint256 한도.
- **현재 단일 전량 경계**: OPEN→0건/0 filled/원래 전량 unfilled, FILLED→1건/전량 filled/0 unfilled, CANCELED→0건/0 filled/원래 전량 unfilled. CANCELED는 **미체결량은 보존하지만 실행 가능 수량은 0**이다.
- SQL 019의 DEFERRABLE CONSTRAINT TRIGGER는 주문 상태 변경·terminal execution INSERT 시 위 조건을 재검사한다. 기존 SQL 015~018 체결·취소 트리거는 유지. 관리자가 019를 재실행할 때 기존 데이터 모두 재검증하고 불일치는 실패 처리.
- `inspectSignedSimFillProgress`는 단일 주문 행을 FOR UPDATE로 잠근 DB 거래 안에서 영속 VIEW를 읽고 수량·상태를 검증하여 `partialFillsAuthorized:false` / `executionAuthorized:false`를 반환한다. 이 조회 결과는 후속 다른 거래에서의 실행 허가가 아니다.
- 후속 부분체결의 나눗셈 반올림(IM 배분), 거래 수수료·펀딩·실현손익, 잔량 취소의 담보 정산은 본 작업에서 결정하거나 기록하지 않는다.

## C3-C2-A signed account aggregate M3 보존 제약

- 서명 주문이 하나라도 존재하는 (chainId, verifier, market, token, account) 범위에서 **OPEN 초기증거금 총액과 현재 RESERVED** 및 **FILLED 초기증거금 총액과 POSITION**을 비교한다. 기존 M3에서 계정에 별도로 예약된 비서명 잔고는 출금 가능액이라 가정하지 않고 signed 증거금과 분리한다.
- M3 RESERVED/POSITION 버킷 값은 동일 계정·시장·담보의 모든 `perp_margin_entries.signed_delta` 합계와 정확히 같아야 한다. 별도 초기 입금 증거가 없는 AVAILABLE 버킷은 해당 비교에서 제외한다.
- 서명 계정의 **모든 M3 operation**은 정해진 액션 경로를 따르고, 0/1 이중분개의 account·bucket·delta·operation ID가 일치해야 한다. 다른 소유자 operation이 signed 계정으로 분개하면 거부한다.
- signed 각 주문의 RESERVE, SQL 018 CANCELED RELEASE, SQL 017 FILLED ALLOCATE로 설명되지 않는 RESERVED/POSITION의 잔여 합계는 음수일 수 없다. 정확히 signed OPEN/FILLED 부담분 + 비서명 M3 잔여분이 각 버킷 장부와 일치해야 한다.
- SQL 020 지연 제약은 signed order, M3 bucket, M3 operation, M3 entry 변경을 각각 감시하며, 관리자 마이그레이션 시 기존 signed 계정별 사전 검증이 실패하면 적용을 중단한다.
- **한계:** 예약 자금은 계정별로 합산되므로 특정 코인의 실보관/실입금 또는 비서명 버킷 자금의 물리적 식별을 증명하지 않는다. 실제 PostgreSQL 복수 연결/서버 권한별 DML 보호는 C3-C2-B/M5-T4에서 검증해야 한다. 기존 FULL-only 실행 경계와 C3-C1 partial 비활성 상태를 유지한다.
