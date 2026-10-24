# M5-T3 TODO

- [x] A: Git/상태/ROADMAP/M5-T2 문서·M3/M4/M5 실제 코드 확인
- [x] A: SQL 012 account guard/immutable reservation events/수량 삼중 분할 CHECK
- [x] A: 기존 M3 3버킷·M4 스냅샷/이력·M5-T2 위험검사와 일관된 트랜잭션용 예약 함수
- [x] A: 총 오픈 예약량 + 미정산 가상 소진량을 position anchor 절댓값 이하로 직렬화
- [x] A: 부분 가상 소진/미소진 취소의 정확한 회계, 이벤트 중복·경합/포지션·오라클·마진 드리프트 차단
- [x] A: PGlite 경합·rollback·재시작 테스트, TypeScript build/전체 회귀/로컬 commit
- [x] B1: 양측 pristine FULL 예약 1건씩 M4 paired transaction과 원자 결합, public ungated pair guarded 계정 거부
- [ ] B2: 다중/부분 주문의 예약량을 실제 양측 체결·재앵커링과 안전하게 화해, 모든 writer까지 우회 차단
- [ ] C: M3 실제 영속 margin reservation/영수증과 signed simulated order lifecycle 안전 통합 및 위험 재평가
- [ ] M5-T4: 임시 실제 PostgreSQL 멀티 연결/시장·계정 동시 잠금·장애·재시작 QA
- [ ] M6 이후: funding/청산/보험/온체인 별도 보안 및 정책 승인
