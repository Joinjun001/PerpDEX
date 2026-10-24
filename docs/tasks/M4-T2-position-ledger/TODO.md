# M4-T2 TODO

- [x] 010 스키마: 계정/마켓/도메인 영속 스냅샷, account+fill UNIQUE 및 version UNIQUE, 역사 append-only 트리거
- [x] 동일 트랜잭션에서 신규/기존 스냅샷 잠금, 순수 엔진 적용, append-only journal 삽입, version CAS
- [x] 영속 스코프·도메인 정책 격리, 오래된 version 및 비연속 중복 fillId/같은 계정 다른 마켓 중복 방어
- [x] 롱·숏/부분 종료·반전 PGlite 통합, 단일·다중 요청 충돌, 장애 rollback·재시작·원장 변조 탐지
- [ ] M4-T3: 양측 체결을 하나의 DB 트랜잭션으로 처리하는 모의 clearing 적용, OI·롱/숏 잔량 보존/재생 검증
- [ ] M4-T4: 실제 임시 PostgreSQL 다중 pool connection/장애 복구·성능 재현
- [ ] M5 이상: 승인된 위험 엔진/증거금·청산 원장/실체인 정책을 연결한 실거래 검증
