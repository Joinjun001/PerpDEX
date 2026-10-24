# M3-T4 TODO

- [x] 이전 Git 상태, PROJECT_STATE/ROADMAP/M3-T3 및 관련 SQL·타입/트랜잭션 구조 재확인
- [x] 외부 TCP 비활성 로컬 PostgreSQL 서버 및 독립 테스트 schema 안전 가드
- [x] 실 PostgreSQL 16-connection pool에서 중복 nonce 및 동시 증거금 과다 예약·자동 이중 분개 방지 검증
- [x] 서명 주문 접수/취소 경합 및 동일 취소 8개 병렬 중 단 한 번 해제 검증
- [x] SQL 분개 실패 시 주문·Nonce·예약/취소 상태 원자 롤백 및 원래 서명 재시도 검증
- [x] 실제 PostgreSQL 서버 재시작 전후 두 Node 프로세스 복구 및 멱등 재생 테스트
- [x] 기존 M2 PostgreSQL QA / TypeScript build / 전체 Backend 테스트 회귀
- [ ] M4-T1: 순수 포지션 순롱·순숏 전이 및 BigInt PnL 모델 실구현
- [ ] M3-T3-B: 매칭·부분 체결과 예약·포지션 할당 원자성 — M4/M5 완료 후
- [ ] 실자산·스테이징/운영 DB/RPC/배포: 별도 명시적 승인 대기
