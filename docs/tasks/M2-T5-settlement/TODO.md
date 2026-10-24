# M2-T5 TODO

- [x] M2-T5-A: `settlement_outbox` 신규 005 스키마 및 관리자 마이그레이션 목록 등록 (운영 실행 금지)
- [x] M2-T5-A: 원장 검증 후 개별/배치 원자적 등록, 멱등성·도메인 격리 구현
- [x] M2-T5-A: 준비 작업 SQL 원자적 claim/lease, 만료 복구/오래된 토큰 차단, 로컬 오류 지연 재시도·WAITING_POLICY 전이
- [x] M2-T5-A: PGlite 오류·동시성·rollback·재시작 통합 테스트 및 타입 검사
- [x] M2-T5-B: 신뢰 정책 입력·자산/정밀도/수량 상한·방향/정책 유효 기간 검사, 체결별 EIP-712 승인 검증, 영속 원장/WAITING_POLICY와 결합한 read-only 정산 지시 생성 (실제 정책 승인/자산 이동은 별도)
- [x] M2-T5-C: 검증된 승인 지시 영속 의도/고유 tradeId, 로컬 settle calldata dry-run, DB 조건부 선점·변조 차단·중복/재시작/불확실 작업 격리 테스트 (실제 전송/receipt 미구현)
- [x] M2-T5-D: 모의 영수증/Settled 이벤트·모의 settledTrades read-only 검증, 영속 재조정 5상태, 모순/역행/재시작/트랜잭션 롤백 로컬 QA (실제 체인 receipt·재전송은 명시적 승인 필요)
- [x] M2-T5-E (로컬 범위): 공개 REST 주문 → FIFO/부분체결 → Outbox → 서명정책 → dry-run → 모의 영수증의 종단간 통합 QA, 001~007 마이그레이션/재시작/멱등성 검증, M2 운영 릴리스 게이트 정리. 실 PostgreSQL/Foundry/온체인 통합 인수는 사람 승인 필요

- [x] M2 승인된 로컬 환경 QA: Foundry 실 바이너리로 Vault/Solidity 회귀·invariant 검증
- [x] M2 승인된 로컬 환경 QA: 외부 네트워크 없는 임시 PostgreSQL 15 인스턴스, 전용 DB/분리 스키마, 실제 pg.Pool 동시 nonce·체결, SKIP LOCKED 및 SQL 트랜잭션 롤백 검증
- [ ] 실 스테이징/운영 인수: 네트워크·백업·정책·위험/정산 실제 경로·멀티프로세스 및 배포 전 승인 (현재 권한 범위 밖)
