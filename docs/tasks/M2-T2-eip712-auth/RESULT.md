# M2-T2 RESULT

상태: In Progress

## 2026-10-24 — EIP-712 주문 서명 검증 구현
- 기존 M2-T1 결과 및 깨끗한 Git 작업 트리 확인.
- M2-T2 `SPEC.md`, `TODO.md`, `RESULT.md`, `QA.md` 작성.
- 검증된 `viem@2.57.10` 의존성을 백엔드에 고정 버전으로 추가(`package-lock.json` 포함).
- `backend/src/orders/signature.ts` 추가:
  - EIP-712 도메인 `PerpDEX / 1 / chainId / verifyingContract` 검증 및 Typed Data 생성
  - 서명 주문의 market·side·price·quantity·nonce·expiresAt 정규화와 uint256 경계 검증
  - EOA 지갑의 EIP-712 서명 복원/주소 확인 및 주문·체인·검증 컨트랙트 변조 거부
  - 잘못된 서명·만료 주문·잘못된 도메인 거부
- `backend/test/signature.test.ts` 신규 테스트 8개 추가, 전체 17개 통과.
- `npm run build` 성공(현재는 Node.js strip-types 구문 검증).
- Foundry는 `forge` 미설치로 미실행. 원격 push, 실제 배포 및 실제 지갑 개인키 사용 없음.

## 다음 개발 단계
- DB 기반의 **영속적·원자적 NonceRegistry** 도입: (chainId, verifyingContract, account, nonce) 고유 제약과 중복 삽입 실패 처리.
- 취소·만료/수명주기 처리를 분리하고 동일 nonce의 동시 승인 요청에서 하나만 성공하는 테스트 작성.
- 서버 설정에서만 EIP-712 도메인을 선택하도록 후속 API 계층에 연결.
- 위 기능이 완료되기 전에는 `verifyOrderSignature`만으로 Replay 공격을 방지했다고 주장하지 않는다.
