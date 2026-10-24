# M5-T2 TODO

- [x] 시작 Git/ROADMAP/PROJECT_STATE/M5-T1 TASK 문서·구현 확인
- [x] M4 순수 포지션 전이와 M5-T1 위험평가를 통합하는 읽기 전용 SIMULATION_ONLY 사전 검증 구현
- [x] reduce-only flat/동방향/포지션 전체 수량 초과 금지 및 부분 체결 잔량 검사
- [x] 비-reduce-only 반전 금지, 사후 포지션 수량·notional/IM/MM/equity/레버리지 예상 값 계산
- [x] 위험 증가 주문은 IM/예약/레버리지·기존 MM 위험 검사, 감소 주문은 위험 악화 거부
- [x] 22개 신규 단위 테스트 및 TypeScript 빌드, 전체 백엔드 회귀/문서 업데이트·로컬 commit
- [x] **M5-T3-A**: M3 계정/잔고 버전·M4 포지션/정책/오라클 검증 및 reduce-only 모의 예약·가상 소진·취소 영속 트랜잭션. [ ] M5-T3-B/C: M4 양측 clearing·M3 진짜 증거금 예약 원자 연계는 별도 구현
- [ ] **M5-T4**: 개발용 실제 PostgreSQL 다중 연결·동시 reduce-only·예약 충돌·롤백·재시작 복구 QA
- [ ] M6/M7/M8: funding/청산/보험/실체인 담보·출금보호와 운영자 정책 승인 후 실거래 인수
