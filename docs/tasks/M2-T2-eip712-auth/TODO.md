# M2-T2 TODO

- [x] M2-T2 TASK 문서 작성 및 진행 상태 설정
- [x] EIP-712 타입/서명용 데이터 생성 및 EOA 서명 검증 구현
- [x] 서명 검증 단위 테스트 및 백엔드 빌드 검사
- [x] 영속적·원자적인 nonce 사용/취소/Replay 차단 (PostgreSQL 스키마·저장소·PGlite 영속/동시성 테스트)
- [x] 주문 INSERT와 Nonce 소비의 원자적 트랜잭션 구현 및 PGlite Rollback 검증
- [x] 운영 PostgreSQL 서버 검증은 현재 환경에서 실행 불가한 것으로 기록하고 M2-T3 환경 QA로 이관 (검증 완료를 의미하지 않음)
- [x] 취소 요청 소유자 인증 및 주문·Nonce 취소 상태의 원자적 갱신 (EIP-712 CancelOrder, PGlite 7개 회귀 테스트)
- [x] 인증 계층 통합 테스트 37개 확인 및 로컬 범위 QA 결과 정리
- [x] M2-T2 로컬 완료 상태 갱신 (운영 환경 검증은 후속 이관)
