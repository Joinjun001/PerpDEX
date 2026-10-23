# M2-T2 QA

상태: In Progress — EIP-712 서명 기능 검증 완료, Replay 방지 미구현

## 이번 회차 검증 (2026-10-24)
- `cd backend && npm test`: **17 passed / 0 failed** (기존 9개 + 신규 8개).
- `cd backend && npm run build`: **성공**. 현재 build 스크립트는 Node.js `--experimental-strip-types --check` 기반 *구문 검사*이며 전체 TypeScript 타입 검사는 아니다.
- 검증한 내용: EIP-712 Order 스키마 필드와 타입, BUY/SELL side 매핑, 정확한 256-bit 정수 값, 정상 임시 지갑 서명 인증, 가격/수량/side/nonce/만료시각/market 변조 거부, chainId 및 verifyingContract 변경 거부, 잘못된 서명자 거부, 만료 주문 거부, 잘못된 도메인/zero address 거부, uint256 overflow 검출.
- 실제 사용자 비밀키나 RPC, 실배포를 사용하지 않았다. 서명 테스트 계정은 테스트 프로세스 안에서만 임시 생성된다.
- `forge`가 실행 환경에 없어 Foundry 테스트는 **미실행**. 이번 회차에 온체인 Solidity 변경은 없다.

## 남은 검증
- `nonce` 영속 저장, 중복 사용 원자성, 서버 재시작/동시성 경계 테스트.
- 주문 인증과 다음 REST API의 통합(서명 검증 도메인은 신뢰할 수 있는 서버 설정에서만 주입).
- ERC-1271 컨트랙트 지갑 지원은 이 EOA 전용 검증 기능의 범위에 포함하지 않는다.
