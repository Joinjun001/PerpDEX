# M2-T5 QA

상태: M2-T5-A 로컬 단위/통합 검증; 실제 PostgreSQL 운영 검증 및 온체인/Foundry 미실행

## 2026-10-24 — M2-T5-A Outbox

- 신규 PGlite 기반 9개 테스트: 진짜 서명 주문·체결에만 등록, 중복 등록 및 병렬 재등록 멱등성, 서명 도메인 격리, 페이지 동기화 재실행, 잘못된/없는 fill 거부, 동시 worker claim 중복 없음, 준비 완료 후 재실행 거부, 지연 재시도/attempt_count/오래된 토큰 차단, 임대 만료 재선점, DB 오류 시 배치 전부 롤백, 디스크 DB close/reopen 후 상태·idempotency 유지, invalid args 차단.
- 개발 중 PostgreSQL 파라미터 `$5`를 서로 다른 타입으로 추론한 문제가 발생해 상태 값에 `::VARCHAR(24)`를 명시, 동일 테스트에서 재검증 성공.
- `cd backend && npm run build` (`tsc --noEmit`) 통과. 전체 백엔드 `npm test` **112 passed / 0 failed** (기존 103 + 신규 9).
- 실제 PostgreSQL 복수 프로세스/다중 DB 연결 SKIP LOCKED, 운영 데이터 변경, 실제 ERC-20 자금 이동/온체인 트랜잭션, Foundry 실행, 원격 push는 미실행.
