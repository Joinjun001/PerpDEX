# M1-T2 SPEC — Settlement Executor와 내부 잔액 정산

## 목적

Off-chain 매칭 엔진이 생성한 체결 결과를 온체인 Vault 내부 장부에 원자적으로 반영할 수 있게 한다.

## 요구사항

1. 일반 사용자와 분리된 settlement executor 권한을 둔다.
2. 권한 있는 executor만 `settle(token, from, to, amount, tradeId)`를 호출할 수 있다.
3. settlement는 실제 ERC-20 전송 없이 내부 잔액만 이동한다.
4. 송신자 잔액 부족 시 전체 트랜잭션을 revert한다.
5. 0 수량, zero-address 사용자, 동일 송수신자 등 잘못된 입력을 거부한다.
6. 동일 `tradeId` 재실행을 거부해 중복 정산을 방지한다.
7. 정산 후 `totalLiability`는 변하지 않아야 한다.
8. 관리자 권한 강화/다중 역할 체계는 M1-T3에서 확장한다.

## 설계 선택

M1-T2에서는 초기 배포자가 설정하는 단일 `settlementExecutor`를 사용한다. 복잡한 역할 관리와 pause/allowlist는 M1-T3에서 OpenZeppelin `AccessControl` 기반으로 통합한다.
