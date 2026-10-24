# M5-T3-B3-B TODO

- [x] Git/STATE/ROADMAP/B3-A SPEC·TODO·QA·RESULT 및 SQL 010~013/코어 코드 확인
- [x] SQL 014 없는 상태에서 guard 직접 수량 UPDATE, 주문 가격·정책 해시 UPDATE, 허위 CONSUME 이벤트 INSERT, 예약 주문 DELETE 4건의 커밋 우회 재현
- [x] SQL 014 주문/guard 신원 불변성·DELETE 금지·단조 수량/버전 보호
- [x] guard/orders/events 커밋 시점 포지션·정책/버전·이벤트 합계·shadow 잔량 검증
- [x] B1/B2 기존 유효한 모의 체결·소진/취소 정상 보존, 013/014 필수 트리거 활성 검사
- [x] PGlite 변조·동시성·장애 롤백·재시작/타계정 회귀 및 TypeScript/전체 테스트
- [x] 최소권한 역할/기존 데이터 preflight 설계 및 결과·문서/STATE/ROADMAP 로컬 커밋
- [x] **M5-T3-C1:** 서명 주문·M3 영속 예약/Nonce 및 M4/OI·M5 pre/post 위험 평가 단일 TX (읽기 전용)
- [ ] **M5-T3-C2/C3:** 서명 양측 M4 원자 체결 및 M3 부분 증거금·fee/PnL 결산 결속 (모의 전용)
- [ ] **M5-T4:** 실제 개발용 Unix socket PostgreSQL 멀티 연결/비소유자 역할·트리거 권한·성능/데드락 QA
- [ ] 운영 승인 이후: 소유자/리더/라이터 역할 실제 적용, 신뢰된 DB API 및 사전 데이터 검증·백업
