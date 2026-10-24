# M5-T3-C3 TODO

- [x] C3-A 계정별 OPEN/CANCELED/FILLED signed 예약·영수증 read-only 대조
- [x] C3-A M3 분개·nonce·CANCELED RELEASE·FILLED ALLOCATE, M4 포지션·PnL 표시 검증
- [x] C3-A 다중 OPEN + 과거 FILLED 혼합, 경합, 위조 취소, 오류/롤백/SQL 무결성 테스트
- [x] **C3-B 취소 상태/nonce만 SQL로 위조한 상태를 COMMIT에서 거부**, 단일 immutable cancel receipt + M3 RELEASE 검증 및 기존 cancellation API 회귀
- [ ] C3-C signed 부분 체결·복수 예약을 원자적 저널로 확장
- [ ] C3-D 포지션 감소 및 realized PnL·fee/funding 정책 의존 회계 설계/검증
- [ ] M5-T4 별도 실제 개발 PostgreSQL 다중 세션·role/권한·마이그레이션 인수
