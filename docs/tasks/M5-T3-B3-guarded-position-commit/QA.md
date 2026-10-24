# M5-T3-B3-A QA

- 먼저 실패하는 보안 재현 3건: 012까지 설치한 PGlite에서 direct SQL guarded snapshot mutation, arbitrary `guarded=true`로 low-level paired fill, low-level single-account fill **모두 원래는 성공하여 테스트 FAIL** (실제 `/tmp/perpdex_b3_red.log`, 0/3).
- 013 적용 및 코드 변경 후 신규 B3 **8/8 PASS**: 세 실제 우회 경로 차단, 유효한 주문 ID만 지정했지만 M5 consume events 누락한 pair rollback, 013 미설치 fail-closed, 성공한 B1 체결 이후 cost tamper 거부, 다른 계정 paired trade 영향 없음, guarded snapshot delete 거부.
- B1 정상 FULL Reduce-only 및 B2 다중 OPEN 예약/부분 체결·동시 중복/SQL 오류 롤백/재시작 시나리오는 013 활성인 PGlite 통합 테스트에서 기존 동작 유지.
- DB CHECK/FOREIGN KEY/immutable append-only는 기존 010~012를 유지하고, 013 COMMIT-time deferrable constraint를 신규로 적용해 같은 transaction에서 뒤늦게 작성되는 M5 이벤트도 검증 가능.
- 대량 포지션/real PostgreSQL multi-connection·DB superuser/DDL bypass·운영 마이그레이션/데이터 사전 감사 미검증. 자격증명·운영 DB·체인 RPC·원격 push 미사용.
- 최종 `cd backend && npm run build` **PASS**, 전체 `cd backend && npm test` **322/322 PASS, 0 FAIL** (기존 314 + 신규 B3 8), `git diff --check` **PASS**. 로컬 커밋만 수행, 원격 push 금지.
