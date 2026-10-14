# M1-T3 QA

상태: Passed

## 검증 범위

- `SETTLEMENT_ROLE` 기반 정산 권한 제어
- `ASSET_MANAGER_ROLE` 기반 자산 allowlist 관리
- `PAUSER_ROLE` 기반 pause/unpause 제어
- allowlist되지 않은 자산의 deposit/settle 차단
- delist된 자산의 기존 잔액 withdraw 허용
- pause 상태에서 deposit/withdraw/settle 차단
- 역할 부여·회수 후 접근 제어 회귀
- 기존 입금·출금·정산 및 회계 불변식 회귀

## 최종 결과

- 전체 테스트: 30 passed / 0 failed
- build: 성공
- `git diff --check`: 성공
- M1-T3 SPEC 요구사항 1~8 검증 완료

## 판정

M1-T3의 역할 기반 접근 제어, asset allowlist, 긴급 정지 및 관련 회귀 테스트가 요구사항을 만족한다.
