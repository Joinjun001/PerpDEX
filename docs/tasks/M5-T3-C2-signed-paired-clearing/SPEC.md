# M5-T3-C2 서명 양측 모의 주문 결속

## 목표
M3 signed v2 비-reduce-only OPEN 주문 두 개, M4 PAIRED 포지션/OI, M5 위험평가를 한 거래에 결속하는 내부 시뮬레이션 기능. 실거래·자산·외부 체인·배포는 제외.

## 하위 단계
- C2-A (이번 회차): 동일 DB 트랜잭션에서 시장 OI를 선점 잠그고 두 계정의 EIP-712 서명/nonce/영속 M3 RESERVE 이중분개, M4 position/version, M5 주문 체결 직전 위험을 검증하는 읽기 전용 쌍 증명.
- **C2-B1 (이번 회차)**: SQL 015 지연 커밋 트리거로 signed OPEN 원장과 nonce·M3 RESERVE, 예약 합계 하한, M4 포지션·양측 paired-fill 우회 및 미연계 M3 ALLOCATE를 fail-closed 처리. API는 여전히 읽기 전용이며 신규 실행 권한 없음.
- **C2-B2-A (이번 회차)**: 신규 SQL 016에 두 signed OPEN 주문과 공통 체결 후보의 전량/FLAT 원자 검증 결과를 PREPARED-only 영구 기록. 주문 가격·수량·market OI/version·margin 예약금·정책 해시/오라클을 DB 지연 체크하고 UPDATE/DELETE 차단. 취소 후에도 기록은 과거 후보일 뿐 실행 권한이 아니며 SQL 015 차단 제약 유지.
- **C2-B2-B (이번 회차 로컬 완료)**: PREPARED 기록을 승인으로 간주하지 않고 양측 서명·OPEN·nonce·위험·M3 원장을 새 TX 안에서 전부 재검증. 전량 양측 M4/OI·M3 RESERVED→POSITION·signed 주문 소진과 terminal 영수증의 불변식 확보 후 정확한 영수증에 대해서만 SQL 015 실행 차단 제약 한정. 임의 우회 플래그 금지.
- C3 (후속): 부분 체결/복수 OPEN 예약/취소 경합, realized PnL/fee/funding 등의 회계 정산.

## 불변식
- 서로 다른 두 계정의 정당한 BUY/SELL 서명.
- SELL limit ≤ 후보 체결가 ≤ BUY limit, tick/lot 적합, 수량은 양측 서명 수량 이내.
- 공통 config revision, hash, 오라클 및 기존 M3 RESERVED 원장·nonce·M4/OI 일치.
- 시장 OI row 잠금 선행, 계정은 주소순 처리, fillId 재사용 금지.
- 주문에 저장된 가격 대신 공통 후보 체결가로 양측 M5 pre/post 재평가.
- 모든 보고 결과 executionAuthorized=false 고정. 임의 체결·자금 전송 없음.

## C2-B2-B 실행 경계

- 신규 `backend/sql/017_perp_signed_pair_executions.sql`은 기존 SQL 015/016을 선행 조건으로 요구한다. signed 주문 상태에 `FILLED`를 추가하되 OPEN→FILLED 경로에는 연결된 terminal receipt와 COMMIT 단계의 양측 일치 증빙을 필수화한다. 취소/OPEN의 기존 불변식과 append-only M3 저널을 보존한다.
- 내부 `executePreparedSignedSimPair`는 PREPARED만으로 권한을 주지 않는다. 새 TX에서 C2-A EIP-712/nonce/OPEN/시장·오라클/M3·M4·M5 검증을 다시 수행하고, FLAT·전량·단일 active signed 주문/계정이라는 보수적 한정 조건에서만 M4 양측/OI + M3 RESERVED→POSITION + terminal 영수증 + 두 주문 FILLED를 커밋한다.
- SQL 017은 paired M4 영수증, 양측 포지션 application(체결가·수량·계정·포지션 버전), 2개 M3 allocation 이중분개, 원장 버킷과 append-only posting 총합, OPEN→FILLED/nonce USED, 시장 OI 일치를 연결한다.
- 체결 후 signed 계정의 DB margin/position 직접 변조는 지연 커밋 제약으로 차단한다. 이후 증거금 회수·부분 체결 및 청산은 C3에서 먼저 증빙 연계를 확장해야 하므로 현재 단계에서는 fail-closed.
- 이 장부는 자체 발행/입출금 기능이 없는 SIMULATION_ONLY 로컬 원장이며, 실제 담보 유효성을 보증하지 않는다. DB 테이블 소유자·DDL 권한 보유자, 모든 테이블을 동시에 위조 가능한 악성 DML 주체의 암호학적 신뢰성까지 증명하지 않는다. DB 최소 권한과 실제 PostgreSQL 동시 연결 인수는 M5-T4 별도 과제.
