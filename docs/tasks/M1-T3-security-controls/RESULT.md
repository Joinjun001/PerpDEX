# M1-T3 RESULT

상태: In Progress

## 2026-10-15

- `AccessControl`을 `CollateralVault`에 도입하고 초기 역할을 설정했다.
- deployer에 `DEFAULT_ADMIN_ROLE`, `ASSET_MANAGER_ROLE`, `PAUSER_ROLE`을 부여했다.
- settlement executor에 `SETTLEMENT_ROLE`을 부여했다.
- 생성자 역할 할당 검증 테스트를 추가했다.
- 검증: `build` 성공, `test` 19 passed / 0 failed.

## Blocked — 이전 예약 실행

- 대상 TODO: settlement 권한을 `SETTLEMENT_ROLE`로 전환
- 차단 단계: 코드 및 테스트 수정 요청이 도구 보안 검사에 의해 거부됨.
- 실패 테스트: 실행하지 못함 (변경 적용 전 차단).
- 에러 요약: `This tool call was blocked by OpenAI's safety checks.`
- 추정 원인: 도구 호출에 대한 보안 검사 차단. 구체적 사유는 제공되지 않음.
- 조치: 우회하지 않고 종료. build/test 미실행, commit 없음. 기존 작업 트리 변경 없음.

## 2026-10-15 — 미커밋 기록 정리

- 이전 예약 실행에서 미커밋 상태로 남은 Blocked 기록만 검증하고 정리했다. 새 TODO 구현 및 소스 변경은 진행하지 않았다.
- 검증: `build` 성공, `test` 19 passed / 0 failed.
- 다음 작업: settlement 권한을 `SETTLEMENT_ROLE`로 전환.

## 2026-10-15 — SETTLEMENT_ROLE 전환 완료

- `settle()`의 기존 단일 주소 기반 `onlySettlementExecutor` 검사를 제거하고 OpenZeppelin `onlyRole(SETTLEMENT_ROLE)` 기반 권한 검증으로 전환했다.
- 기존 고정 `settlementExecutor` 상태 변수와 전용 unauthorized error를 제거했다.
- unauthorized settlement 회귀 테스트를 `AccessControlUnauthorizedAccount` 기준으로 수정했다.
- 이전 실행에서 실패했던 테스트는 `vm.expectRevert`와 `vm.prank` 호출 순서를 바로잡아 해결했다.
- 검증: `forge fmt --check`, `forge build`, `forge test` 모두 성공. 19 passed / 0 failed.

## 2026-10-15 — Asset allowlist 구현

- `isAssetAllowed` 상태와 `setAssetAllowed` 관리 함수를 추가했다.
- `ASSET_MANAGER_ROLE` 보유자만 allowlist를 변경할 수 있도록 구성했다.
- allowlist되지 않은 자산의 `deposit`과 `settle`을 차단하고, 변경 이벤트를 추가했다.
- 기존 정상 경로와 fee-on-transfer 테스트가 allowlist 전제에서 동작하도록 테스트 설정을 갱신했다.
- allowlist 토글, 미지원 자산 deposit 차단, 미지원 자산 settlement 차단 테스트를 추가했다.
- 검증: `forge fmt --check`, `forge build`, `forge test` 성공. 22 passed / 0 failed.
