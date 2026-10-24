# M4-T3 TODO

- [x] 기존 M4-T2 단일 계정 로직을 같은 SqlRunner 내에서 호출 가능하도록 분리
- [x] SQL 011 시장 OI PAIRED/UNPAIRED 락, 양측 FK·append-only 모의 체결 영수증
- [x] 신뢰 정책/가격·fill ID·동일 시장·가격·수량에서 BUY/SELL 양측 포지션을 원자적 갱신
- [x] 시장 LONG=SHORT 수량 검증/추적 OI 버전 원자 갱신, 증감·반전·전량 종료 지원
- [x] replay, 동시 체결, 상대방 장애/정책 오류, 모드 혼용, DB rollback·재시작 PGlite 검증
- [x] M4-T4 실제 임시 PostgreSQL 다중 연결/경합 및 서버 재시작 QA (seed 9/9 + verify 2/2)
- [ ] M5 이후 허가된 담보·주문 위험·실체결/자금 통합 (사람 승인 필요)
