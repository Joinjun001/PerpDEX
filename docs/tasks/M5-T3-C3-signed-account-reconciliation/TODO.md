# M5-T3-C3 TODO

- [x] C3-A 계정별 OPEN/CANCELED/FILLED signed 예약·영수증 read-only 대조
- [x] C3-A M3 분개·nonce·CANCELED RELEASE·FILLED ALLOCATE, M4 포지션·PnL 표시 검증
- [x] C3-A 다중 OPEN + 과거 FILLED 혼합, 경합, 위조 취소, 오류/롤백/SQL 무결성 테스트
- [x] **C3-B 취소 상태/nonce만 SQL로 위조한 상태를 COMMIT에서 거부**, 단일 immutable cancel receipt + M3 RELEASE 검증 및 기존 cancellation API 회귀
- [x] C3-C1 SQL 019 terminal 영수증 기반 누적 체결·미체결·실행 가능 수량 VIEW와 FULL-only COMMIT 트리거, 조회·테스트
- [x] C3-C2-A 복수 OPEN/기존 FILLED/CANCELED signed 계정의 M3 RESERVED·POSITION 장부와 OPEN/FILLED 의무 및 비서명 M3 잔여금 COMMIT 무결성 검사 (SQL 020)
- [x] C3-C2-A M3 operation 0/1 이중분개/계정 소유자 정합성, 직접 SQL 변조/반쪽 posting, 중복·동시 admission·취소/신규 admission 및 마이그레이션 preflight 테스트
- [x] C3-C2-B1 private Unix socket·고정 테스트 DB·신규 schema/독립 backend PID 기반 수동 opt-in 실제 PG 경합 QA 하네스 및 오프라인 guard 테스트
- [ ] C3-C2-B2 PG 환경 실제 확보 시 admission/cancel/FULL 경합 QA 실행, 최소 권한 role DDL/임의 영수증 변경 차단 인수 (현재 실 PG 미실행)
- [ ] C3-C3 안전한 부분 체결 수량·잔여 IM 할당·부분 취소 영수증 및 M4/OI 결속 (정책 미확정 시 실행 금지)
- [ ] C3-D 포지션 감소 및 realized PnL·fee/funding 정책 의존 회계 설계/검증
- [ ] M5-T4 별도 실제 개발 PostgreSQL 다중 세션·role/권한·마이그레이션 인수
