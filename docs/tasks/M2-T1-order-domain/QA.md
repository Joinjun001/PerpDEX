# M2-T1 QA

상태: Passed (백엔드 TASK 범위)

## 2026-10-24 검증

- Node.js v22.23.2, `cd backend && npm test`: **9 passed / 0 failed**.
- `cd backend && npm run build`: **성공**.
- 유효/무효 주문 입력과 시각 경계, 상태 전이/종료 상태, canonical payload 정규화, SHA-256 기반 오프체인 주문 ID 일관성 및 필드별 구분 테스트 통과.
- Foundry 명령 `forge`가 현재 환경에 없어 온체인 회귀 테스트/빌드는 **미실행**. M1-T5의 과거 35 tests 통과 기록과 구분함. M2-T1은 온체인 소스를 수정하지 않음.

## 판정

M2-T1 주문 도메인 코드와 백엔드 테스트·빌드는 통과했다. 통합 온체인 회귀는 도구가 준비된 실행 환경에서 후속 검증 필요.
