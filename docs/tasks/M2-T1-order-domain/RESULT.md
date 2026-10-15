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

## Blocked — 미커밋 canonical order ID 변경 검증

- 미커밋 변경: `backend/src/orders/order.ts`, `backend/test/order.test.ts`에 canonical payload 및 SHA-256 기반 deterministic order ID와 관련 테스트가 추가되어 있다. 기존 변경을 우선 검증했으며 새 TODO는 시작하지 않았다.
- Foundry `build` 성공, `test` 35 passed / 0 failed.
- backend 검증 요청 `backend-build`는 `허용되지 않은 check입니다: backend-build`로 도구에서 거부되었다. 거부된 작업을 다른 명령으로 우회하지 않았으므로 backend build/test는 이번 실행에서 확인하지 못했다.
- 추정 원인: 등록된 `project_run_check` 허용 목록에 요청한 backend 검증 이름이 없음. 검증이 완료되지 않아 TODO 완료 처리와 commit을 보류했다. backend 검증용 사전 등록 check가 확인된 후 이어서 진행해야 한다.

## 2026-10-15 — canonical payload 및 deterministic order ID 구현

- 정규화된 주문 필드를 고정 순서로 직렬화하는 `canonicalOrderPayload`를 추가하고 `perpdex-order-v1` 버전 prefix를 포함했다.
- 외부 패키지 없이 Node.js `crypto`의 SHA-256을 사용해 `0x` prefix 32-byte deterministic order ID를 생성하는 `createDeterministicOrderId`를 구현했다.
- 동일한 canonical 주문은 항상 같은 ID를 만들고 nonce 등 식별 필드가 달라지면 다른 ID가 생성되는 단위 테스트를 추가했다.
- 이 order ID는 Off-chain 식별용이며 EIP-712 서명 digest는 M2-T2에서 별도로 구현한다.
- 검증: backend `test` 7 passed / 0 failed, backend `build` 성공, Foundry `test` 35 passed / 0 failed, Foundry `build` 성공.
