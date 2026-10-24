# M5-T3-B2 RESULT

**상태: 제한된 양측 SIMULATION_ONLY 다중 예약·부분 체결/새 포지션 버전 원자 화해를 로컬 구현.** 실제 주문, 증거금 이동 및 공개 API 체결 경로와 비연결.

- 시작 `main` clean, HEAD `1359b10`, origin/main보다 21 commit 앞섬. STATE/ROADMAP 및 M5-T3-B1 4개 TASK 문서·실제 SQL/소스를 확인.
- `backend/src/perp/partial-reserved-paired-clearing.ts` 신규: 시장 OI → 두 계정 주소순 guard → 포지션·마진 일관 TX에서 양측 모의 체결과 계정별 예약 일부 소진을 한 번에 기록. 결과는 내부 SIMULATION_ONLY 포지션/OI 장부이며 실제 거래가 아님.
- `backend/src/perp/reduce-reservations.ts` 확장: 다중 OPEN 예약 전체에 대한 quote/position/ledger 스냅샷·M4 paired consume history 유효성 검사, 선택 주문 잔량 부분 소진/이벤트 기록, 나머지 주문 post-position risk 재검사 및 version 재앵커링. OI·양측 버전·위험·예약 불변식에 실패하면 모든 변경 rollback.
- `backend/test/perp-reserved-paired.test.ts` 신규 B2 PGlite 13개 시나리오: 다중 예약/연속 부분 체결/초과 검증/취소·경합/SQL 실패·재시작·과거 shadow replay 금지. PGlite B2 **13/13 PASS**, 전체 백엔드 **314/314 PASS**, TypeScript build/변경 검사 PASS.
- 미구현 후속은 M5-T3-B3 **저수준 writer/DB 역할 guard 우회 폐쇄** 및 M5-T3-C **증거금·서명 주문·실현 PnL/fee/funding 원자 체결**. M5-T4 별도 개발용 실제 PostgreSQL multi-connection/restart 회귀.
