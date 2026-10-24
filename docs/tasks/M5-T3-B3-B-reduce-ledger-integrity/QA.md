# M5-T3-B3-B QA

- 신규 실패-우선 시나리오 4개: SQL 014 설치 **이전에는 4/4 모두 `Missing expected rejection`**, 실제 guard/주문/이벤트 변경이 커밋되었음. 이후 같은 공격 테스트 4개 모두 거부.
- 신규 SQL 014: 임의 주문/guard 버전·정책 변조, forged CONSUME 이벤트, 주문 DELETE, 잔여 예약 용량 초과 direct INSERT, SQL 014 트리거 비활성 상태에서 M4 보호 체결 거부 등 검증.
- B1 단일 전량 양측 reduce-only, B2 여러 OPEN 예약 부분 소진/잔량 버전 갱신, 중복·취소 경합·SQL 이벤트 오류 트랜잭션 롤백·PGlite disk close/reopen 회귀.
- 실제 서버 측 DB 권한 적용·PostgreSQL 실제 멀티 연결은 미검증이며 `ROLE_POLICY.md`를 참고해 후속 승인 필요. 현재 연결 환경에서 PostgreSQL 서버 실행 파일 `pg_ctl`/`postgres`/`initdb` 경로를 확인할 수 없어 임시 Unix socket 서버 QA는 실행하지 않았습니다. 다음 M5-T4에서 실제 PostgreSQL 연결/권한/교착 검증 필요. `npm run build`: PASS, 전체 `npm test`: **329/329 PASS, 0 FAIL** (직전 322 + 신규 B3-B 7), `git diff --check`: PASS.
