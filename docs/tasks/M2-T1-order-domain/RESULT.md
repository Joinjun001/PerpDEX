# M2-T1 RESULT

상태: In Progress

## 2026-10-15

- M1 완료 후 M2를 5개 TASK로 세분화하고 M2-T1 주문 도메인 기반 작업을 시작했다.
- 원격 push는 AutoPilot 작업 범위에서 제외한다.

## 2026-10-15 — 주문 도메인 타입 및 입력 검증

- `backend/`에 외부 패키지 없이 Node.js 22에서 실행 가능한 TypeScript test/build 기반을 추가했다.
- `backend/src/orders/order.ts`에 주문 입력 타입과 런타임 검증을 구현했다.
- EVM account, market 식별자, BUY/SELL side, 양수 price/quantity, uint nonce, 미래 `expiresAt`을 검증하고 금액/nonce는 10진 문자열로 유지한다.
- 유효 입력 정규화, 무효 필드 거부, 큰 정수 정밀도 보존 단위 테스트를 추가했다.
- 검증: backend `test` 3 passed / 0 failed, backend `build` 성공, Foundry `test` 35 passed / 0 failed, Foundry `build` 성공.

## 2026-10-15 — 주문 상태 모델과 허용 전이 구현

- 주문 상태를 `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`로 정의했다.
- `OPEN`에서는 부분체결·완전체결·취소·만료로, `PARTIALLY_FILLED`에서는 완전체결·취소·만료로만 전이하도록 허용했다.
- `FILLED`, `CANCELED`, `EXPIRED`를 terminal state로 두고 역전이·동일 상태 전이를 거부하도록 `canTransitionOrderStatus`와 `transitionOrderStatus`를 구현했다.
- 허용 전이와 terminal/backward 전이 거부 단위 테스트를 추가했다.
- 검증: backend `test` 5 passed / 0 failed, backend `build` 성공, Foundry `test` 35 passed / 0 failed, Foundry `build` 성공.
