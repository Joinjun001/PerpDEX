# M5-T3-B3 TODO

- [x] B3-A 시작 Git·PROJECT_STATE·ROADMAP·B2 SPEC/TODO/QA/RESULT, M3/4/5 소스/010~012 SQL 확인
- [x] 낮은 레벨 직접 SQL snapshot 수정, M4 `guarded=true` boolean, 단일 계정 내부 writer의 실제 bypass 선행 실패 테스트 3개로 재현
- [x] SQL 013 DEFERRABLE COMMIT constraint로 양측 M4 paired receipt·position·M5 reserve consume·OI 관계 검증
- [x] `guarded=true` 대신 검증 가능한 BUY/SELL 주문 ID 쌍을 받아 실제 DB 위험검사 재수행 + SQL 013 존재/활성 확인
- [x] B1/B2 기존 원자 체결 경로 유지, 정상·중복/동시·장애·재시작/다른 계정 테스트
- [x] TypeScript build/전체 backend tests, QA/STATE/ROADMAP 업데이트 및 로컬 commit
- [ ] B3-B: DB 권한 최소화·역할 설계 및 guard/orders/history 임의 쓰기 자체에 대한 방어/마이그레이션 인수 스크립트와 실제 PostgreSQL 검증
- [ ] M5-T3-C: signed mock order·M3 영속 증거금 예약 및 부분 체결·손익/수수료 회계의 원자적 결속
- [ ] M5-T4: 명시적으로 승인된 임시 Unix-socket-only PostgreSQL의 다중 연결·락·deadlock/반복/재시작 및 OI 비용 QA
