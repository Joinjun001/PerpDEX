# ROADMAP

## M1 — 온체인 자금 보관·정산 기반

목표: Off-chain 주문/매칭 시스템이 사용할 최소한의 안전한 온체인 자금 보관 및 정산 레이어를 구축한다.

| TASK | 내용 | 상태 |
|---|---|---|
| M1-T1 | `CollateralVault` ERC-20 입금/출금 및 내부 잔액 회계 | Completed |
| M1-T2 | 권한 있는 settlement executor와 원자적 내부 잔액 이전 | Completed |
| M1-T3 | 자산 allowlist, pause, 역할 기반 관리 및 보안 회귀 테스트 | In Progress |
| M1-T4 | 배포 스크립트, Sepolia 환경변수/설정 및 로컬 배포 검증 | Planned |
| M1-T5 | 통합 테스트, invariant/fuzz 보강, GitHub Actions CI 및 M1 릴리스 정리 | Planned |

## M2 — Off-chain Order API & Matching MVP

M1 완료 후 구체화한다. 예상 범위는 주문 모델, 서명 검증, 주문 상태 머신, 가격-시간 우선 매칭, 온체인 settlement 연동이다. M2 역시 4~5개 TASK로 세분화한다.
