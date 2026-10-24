# M3-T3 TODO

- [x] A: M2 v1과 분리된 SIMULATION_ONLY v2 주문/취소 서명, 승인 시장 설정·가격 검증
- [x] A: nonce·shadow order·증거금 예약 원자적 경계, 위험 초과/서명 변경 차단
- [x] A: 서명 취소·nonce tombstone·잔액 해제 원자성/중복 취소 방지
- [x] A: 009 SQL 영속 원장, PGlite 정상/장애/재시작/동시성 테스트
- [ ] B: 부분 체결 증거금 할당·남은 예약 조정 — M4 포지션 엔진 및 M5 위험 검사 필요
- [x] C: 실제 PostgreSQL 다중 연결에서 서명 모의 주문/취소 경합 및 잠금/재시작 QA (M3-T4, seed 8 + restart 1 + M2 PG 4 통과)
- [ ] 실제 거래용 시장 위험 수치·담보/청산 정책·오라클·Vault 출금 제한 승인 및 보안/스테이징 QA
