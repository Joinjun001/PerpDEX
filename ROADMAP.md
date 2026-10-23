# ROADMAP

## M1 — 온체인 자금 보관·정산 기반

목표: Off-chain 주문/매칭 시스템이 사용할 최소한의 안전한 온체인 자금 보관 및 정산 레이어를 구축한다.

| TASK | 내용 | 상태 |
|---|---|---|
| M1-T1 | `CollateralVault` ERC-20 입금/출금 및 내부 잔액 회계 | Completed |
| M1-T2 | 권한 있는 settlement executor와 원자적 내부 잔액 이전 | Completed |
| M1-T3 | 자산 allowlist, pause, 역할 기반 관리 및 보안 회귀 테스트 | Completed |
| M1-T4 | 배포 스크립트, Sepolia 환경변수/설정 및 로컬 배포 검증 | Completed |
| M1-T5 | 통합 테스트, invariant/fuzz 보강, GitHub Actions CI 및 M1 릴리스 정리 | Completed |

## M2 — Off-chain Order API & Matching MVP

목표: 서명된 주문을 안전하게 수신·검증하고 가격-시간 우선으로 매칭한 뒤 M1의 온체인 settlement 경로와 연결하는 최소 Off-chain MVP를 구축한다.

| TASK | 내용 | 상태 |
|---|---|---|
| M2-T1 | 주문 도메인 모델, 입력 검증 및 상태 머신 기반 | Completed |
| M2-T2 | EIP-712 주문 서명 검증, nonce 및 replay 방지 | Completed (로컬 검증; 실서버 QA 이관) |
| M2-T3 | Order REST API와 주문 저장/조회/취소 흐름 | Completed (로컬 HTTP/PGlite; 운영 DB QA 이관) |
| M2-T4 | 가격-시간 우선 Matching Engine 및 부분 체결 | Ready (최초 TASK 계획 완료) |
| M2-T5 | 매칭 결과 settlement 연동, 통합 테스트 및 M2 릴리스 정리 | Planned |
