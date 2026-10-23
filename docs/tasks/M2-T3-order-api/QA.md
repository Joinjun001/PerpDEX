# M2-T3 QA

상태: In Progress

- 구현 예정: HTTP 입력 유효성·서명·Nonce 중복·DB 실패 응답.
- 운영 PostgreSQL 서버 및 다중 프로세스는 현재 환경에서 실행 불가. PGlite의 embedded PostgreSQL 엔진으로 검증한 결과와 구분한다.

## 2026-10-24 — 주문 생성 HTTP 회귀 결과

- 백엔드 `npm run build` (`tsc --noEmit`): **성공**.
- `npm test`: **44개 통과 / 0개 실패**.
- 신규 API 테스트 7개: 주문+Nonce 원자적 저장 후 201, 동일 Nonce 재사용 409, 잘못된 입력·만료 400 및 DB 비소비, 위조 서명 401 및 DB 비소비, 잘못된 서명 도메인·요청 도메인 삽입 거부, 잘못된 JSON 400, 크기 초과 413, Content-Type 415, 경로 404, 메서드 405, 내부 DB 예외 500 및 내부 문자열 비노출.
- 인메모리 PGlite(실제 PostgreSQL SQL 엔진) + localhost 임시 포트. 운영 PostgreSQL 다중 연결/멀티프로세스 및 실제 배포 환경은 미실행.
- 보안 경계: 공개 인터넷 전용 API gateway 인증/요청 rate-limit·CORS 정책·고가용성은 현재 범위에 없음. 현재 서버 시작 시 loopback 전용.
- 미완료: 주문 조회·목록, 인증된 취소 HTTP, 네트워크 실패 뒤 idempotency/재요청 정책, 운영 PG E2E.
