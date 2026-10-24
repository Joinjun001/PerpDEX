# M5-T3-C2 서명 양측 모의 주문 결속

## 목표
M3 signed v2 비-reduce-only OPEN 주문 두 개, M4 PAIRED 포지션/OI, M5 위험평가를 한 거래에 결속하는 내부 시뮬레이션 기능. 실거래·자산·외부 체인·배포는 제외.

## 하위 단계
- C2-A (이번 회차): 동일 DB 트랜잭션에서 시장 OI를 선점 잠그고 두 계정의 EIP-712 서명/nonce/영속 M3 RESERVE 이중분개, M4 position/version, M5 주문 체결 직전 위험을 검증하는 읽기 전용 쌍 증명.
- **C2-B1 (이번 회차)**: SQL 015 지연 커밋 트리거로 signed OPEN 원장과 nonce·M3 RESERVE, 예약 합계 하한, M4 포지션·양측 paired-fill 우회 및 미연계 M3 ALLOCATE를 fail-closed 처리. API는 여전히 읽기 전용이며 신규 실행 권한 없음.
- **C2-B2 (다음)**: 승인된 DB 스키마의 정확한 양측 전량 opening fill 영수증과 상태 전이를 설계하고, 한 TX에서 M3 RESERVED→POSITION 할당·M4 양측 저널/OI·signed 주문 소진이 모두 검증되어야만 커밋되도록 구현. SQL 015의 현재 fail-closed 실행 방어를 '검증된 C2-B2 영수증' 조건으로만 좁히며 임의 우회 플래그 금지.
- C3 (후속): 부분 체결/복수 OPEN 예약/취소 경합, realized PnL/fee/funding 등의 회계 정산.

## 불변식
- 서로 다른 두 계정의 정당한 BUY/SELL 서명.
- SELL limit ≤ 후보 체결가 ≤ BUY limit, tick/lot 적합, 수량은 양측 서명 수량 이내.
- 공통 config revision, hash, 오라클 및 기존 M3 RESERVED 원장·nonce·M4/OI 일치.
- 시장 OI row 잠금 선행, 계정은 주소순 처리, fillId 재사용 금지.
- 주문에 저장된 가격 대신 공통 후보 체결가로 양측 M5 pre/post 재평가.
- 모든 보고 결과 executionAuthorized=false 고정. 임의 체결·자금 전송 없음.
