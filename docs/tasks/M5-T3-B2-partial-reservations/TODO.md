# M5-T3-B2 TODO

- [x] Git/STATE/ROADMAP/M5-T3-B1 문서 및 M3/M4/M5 코어 코드 검토
- [x] 다중 OPEN 예약 조회·LOCK 및 정책/가격/마진/포지션 version 검증
- [x] 이전 A-stage shadow consume를 무단 실제 체결로 재분류하지 않도록 M4 paired fill ID·수량·시장·계정 증빙 검증
- [x] 개별 주문 부분 소진 이벤트 및 동일 TX M4 양측 체결/OI 변경
- [x] 선택 주문의 잔량 감소 및 다른 OPEN 주문의 새 position version·risk 재검증/원자 갱신
- [x] 초과 예약·재전송·동시 취소·한쪽 SQL 실패·재시작 PGlite 테스트 및 전체 회귀/빌드
- [x] M5-T3-B3-A — 저수준 public/internal guarded 포지션 수정 commit-time DB 제약/무단 boolean 통과 방지
- [ ] M5-T3-B3-B — DB 역할 권한/guard·orders 직접 위변조 제한 및 실제 PG 안전 인수
- [ ] M5-T3-C — M3 영속 증거금 예약·해제 및 서명된 모의 주문 상태, 양측 실현 PnL/fee 위험 정산의 동일 원자 체결 통합
- [ ] M5-T4 — 실제 개발 전용 PostgreSQL 복수 연결·교착·수정 가능한 quote/취소 경쟁·서버 재시작 QA
- [ ] M6+ — funding/청산/보험/체인 Vault 경제 설계/실자금 사용에 별도 운영 승인
