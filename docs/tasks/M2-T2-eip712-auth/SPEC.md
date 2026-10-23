# M2-T2 SPEC — EIP-712 주문 인증과 Nonce / Replay 방지

## 목표
M2-T1의 주문 도메인을 그대로 사용해 EOA 지갑의 EIP-712 주문 서명을 검증하고, 주문 재사용을 거부할 수 있는 인증 계층을 만든다.

## API / 위협 모델
- 서버가 통제하는 EIP-712 도메인 `name=PerpDEX`, `version=1`, `chainId`, `verifyingContract`에 서명을 묶는다.
- 주문 서명 필드: `account(address)`, `market(string)`, `side(uint8; BUY=0/SELL=1)`, `price(uint256)`, `quantity(uint256)`, `nonce(uint256)`, `expiresAt(uint256)`.
- 체인/컨트랙트/주문 내용 변경 및 잘못된 서명은 검증 실패해야 한다.
- M2-T1 입력 정규화·미래 만료시각 검사와 연동한다.
- nonce 재사용 차단은 서버 재시작/동시 요청에도 유지되는 원자적 영속 저장을 목표로 한다. 인메모리 저장만으로 완료 처리하지 않는다.
- 실제 지갑 개인키·RPC·배포·원격 push를 사용하지 않는다. 테스트는 실행 중에만 생성되는 임시 테스트 전용 계정을 사용한다.

## 완료 기준
1. EIP-712 Typed Data 생성/입력 검증.
2. 유효한 EOA 서명자 검증과 변조·체인/컨트랙트 불일치·만료 거부.
3. nonce 유일성과 사용 완료/취소/만료 처리에 관한 영속적이고 동시성 안전한 Replay 방지 구현.
4. 오프체인 백엔드 테스트·빌드 통과, QA 기록, 로컬 커밋.
5. 실제 통합 경로에서 서버가 서명 도메인을 고정하도록 준비.

## 단계 제한
첫 번째 개발 단계에서 1~2만 구현한다. 3~5는 다음 실행에서 후속 구현한다.

## EIP-712 취소 인증 정책 (4회차 확정)

- `CancelOrder(address account,uint256 nonce,uint256 deadline)`은 기존 주문 서명 `Order`와 다른 타입으로 취소 의사를 표시한다.
- 동일한 서버 고정 EIP-712 도메인(`PerpDEX/1/chainId/verifyingContract`)으로 서명한다. 유효 기간은 취소 요청의 `deadline`으로 검사하며, 미래의 안전한 정수 타임스탬프만 허용한다.
- `cancelSignedOrder`는 서명 검증 **이후** 하나의 PostgreSQL 트랜잭션에서 (1) Nonce cancel/tombstone으로 직렬화, (2) 주문 상태 CANCELED 전이 순서로 실행한다. 두 단계 중 오류 발생 시 전체 ROLLBACK.
- 주문이 없는 Nonce도 소유자가 사전 취소 가능하다. 이후 해당 Nonce를 사용한 주문 생성은 실패한다.
- 기존 주문이 `OPEN`, `PARTIALLY_FILLED`인 경우만 취소 가능. 부분 체결량(`filled_quantity`)은 변경하지 않고 나머지 `quantity - filled_quantity`만 취소한다.
- `FILLED`, `CANCELED`, `EXPIRED` 주문과 중복 취소는 거부하며, Nonce 상태 변경도 rollback한다.
- `PostgresNonceRegistry.cancel()`은 인증되지 않는 내부 DB 함수이므로 HTTP에서 직접 노출하면 안 된다. 인증 진입점은 `cancelSignedOrder`이어야 한다.
- 운영 PostgreSQL / 다중 서버와 실제 API 엔드포인트는 별도 통합 검증 대상으로 남긴다.
