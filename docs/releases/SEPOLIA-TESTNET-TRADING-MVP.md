# PerpDEX Sepolia 테스트넷 무기한 선물 거래 MVP

- 목표 결정: Sepolia 테스트넷에서 실가치 없는 테스트 전용 ERC-20 담보로 주문·체결·포지션·정산·출금까지 동작하는 하이브리드 Perpetual Futures DEX
- 대상 체인: Ethereum Sepolia, chainId 11155111
- 시작 시장: BTC-USD-PERP 한 종목, Long/Short one-way 포지션
- 상태: **목표 확정, 실제 테스트넷 배포와 거래 연결은 미승인·미완료**
- 제외: 메인넷, 실자금·실제 USDC·현금화·실거래 서비스, 허가 없는 지갑 키 사용/계약 배포/운영 DB 변경

## 최종 사용자 경험

1. MetaMask로 Sepolia 지갑 연결 및 체인 확인
2. 실가치 없는 테스트 전용 USDC형 ERC-20을 faucet에서 발급받고 Vault에 approve/deposit
3. EIP-712 주문 서명, nonce/replay 검증, 오프체인 매칭/체결
4. LONG/SHORT 포지션, 초기/유지증거금, 실현/미실현 손익 조회
5. 정책에 따라 포지션 종료, 온체인 담보·손익 안전 정산 및 테스트 토큰 출금
6. 각 트랜잭션의 Sepolia Explorer 링크, 실패/재시작/중복 처리에 대한 검증 기록

## 중요한 현재 한계

- 현재 GitHub Pages https://joinjun001.github.io/PerpDEX/ 는 고정 데모 가격·호가·주문 미리보기만 제공하며, 지갑·백엔드·온체인 거래가 연결되지 않았다.
- 기존 M1 CollateralVault의 settle은 단순 사용자 간 잔액 이전이며 선물 포지션 손익 정산이 아니다. M1 withdraw는 M3의 RESERVED/POSITION 원장을 모르므로 그대로 선물 거래용 출금에 연결할 수 없다.
- 기존 M2 서명 주문/매칭과 M3~M5 로컬 모의 위험/원장 검증은 개발 기반이지 실제 Sepolia 상품 인수는 아니다.
- M6 funding, M7 청산, M8 선물 전용 담보 잠금·정산 계층 등 선행 안전 기능이 필요하다. 일부 미완성 기능을 무시하고 메인넷/테스트넷 거래가 가능하다고 표시하지 않는다.

## Milestone M9: Testnet End-to-End

| TASK | 구현·인수 내용 | 상태 |
|---|---|---|
| M9-T1 Wallet | MetaMask, chainId 검증, 지갑/네트워크 전환, 테스트용 ERC-20 faucet·approve UI | Planned |
| M9-T2 Deposit | M8 선물용 Vault/ClearingHouse 테스트 배포, 입금 이벤트 최종성, M3 장부와 중복 없는 결속 | Planned |
| M9-T3 Order | HTTPS 백엔드, DB 독립 세션 QA, 서명 주문·nonce·취소·포지션/UI, 실제 시험 오라클 출처 표기 | Planned |
| M9-T4 Clearing | 온체인 담보 잠금과 포지션/손익/자금 정산, 내부 잔액·출금 제한, 중단복구·재진입·중복방지 | Planned |
| M9-T5 End-to-End | 두 테스트 지갑으로 입금→양측 체결→포지션 종료→손익 정산→출금 전체 확인 및 자동 회귀 | Planned |
| M9-T6 Release | 배포 주소, 체인 탐색기, 모니터링/일시정지, 테스트넷 공지, 운영자 명시 승인 후 공개 | Approval required |

**실제 구현 순서:** 현재 M5 signed 원장 검증 및 필요한 M6·M7 위험 정책 → M8 담보/clearinghouse → M9 UI·API·Sepolia 연동 → E2E → 공개.

## 범위·안전 가드레일

- 우선 BTC-USD-PERP 한 시장만 사용한다. ETH/SOL의 현재 UI 가격은 가상 시세이므로 실제 시장처럼 표시하지 않는다.
- **실제 가치를 가진 USDC가 아니라 자체 시험 ERC-20만 사용.** 테스트 ETH는 가스에만 쓰고 testnet 사용임을 명시한다.
- 부분 체결은 서명 잔량/예약 마진 영수증·SQL 제약이 완비될 때까지 FULL-only로 제한한다.
- 레버리지, IM/MM, funding, liquidation, 시험 가격/오라클, 수수료, 토큰 faucet 제한, 관리자/settlement 역할은 각각 시험 운영 정책 검증·승인 후 확정한다.
- 개발 및 검증에서 트랜잭션 서명·브로드캐스트·실제 테스트넷 배포·네트워크 접근이 필요할 때는 **별도의 명시적 승인**을 받는다. 이 문서 자체는 배포/트랜잭션 실행 승인이 아니다.
- 서버 키/사용자 시드 구문은 저장소나 프런트엔드에 넣지 않고, 서명은 사용자 지갑에서 실행한다.

## 완료 판정 (Definition of Done)

- Sepolia 지갑 2개, 테스트 전용 토큰의 체인·주소·소유권/allowlist 검증
- 두 지갑의 입금 영수증과 M3 증거금 원장 일치, RESERVED/POSITION 담보 이중 사용 방지
- 서로 반대 서명 주문의 체결과 포지션 Long/Short·OI·PnL 기록, nonce 재사용 거부
- 종료·settlement·출금의 온체인 이벤트와 백엔드 원장/사용자 UI 금액 일치
- 수수료/펀딩/청산 정책 및 위험 초과 거래를 테스트에서 명시적으로 처리
- chain reorg/중단·재시작/동시 취소·체결/재전송/무결성 위조·권한 오류 시 중복 집행 방지
- Foundry 테스트, 실 개발 PostgreSQL 독립 세션, 실제 Sepolia 트랜잭션 ID와 2계정 E2E QA 기록
- 사용자가 웹 UI에서 테스트넷임을 인지하고 지갑으로 온전한 거래 사이클을 완수할 수 있음
