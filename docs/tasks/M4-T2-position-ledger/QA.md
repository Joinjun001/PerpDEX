# M4-T2 QA

- 신규 `backend/test/perp-position-ledger.test.ts`: PGlite **15/15 통과**. `npm run build` 통과, 전체 `npm test` **218/218 passed, 0 failed** (기존 203 + 신규 15).
- 실제 스키마 DDL 010 실행: 계정별 영속 0/롱/숏 스냅샷과 append-only application 및 FK/두 UNIQUE 범위 검증.
- 한 fill ID가 두 다른 매수/매도 계정에는 각각 기록되되 같은 계정에서는 서로 다른 market/token을 사용해도 재적용되지 않음. 다른 `chainId` 스코프의 동일 ID는 독립.
- 최초 진입→동일 방향 추가→부분 종료→롱에서 숏 반전 후 재조회, 완전한 version/원가/손익/계정 저장.
- 동일 요청 9회 병렬 중 1회만 저장, 다른 2개 ID 같은 기존 version 경합 중 1건만 성공. 과거 ID를 다른 정상 체결 뒤 최신 expectedVersion으로 다시 제출해도 거부.
- SQL journal INSERT/스냅샷 UPDATE 중 강제 DB CHECK 위반 시 2개 테이블 모두 롤백, 제약 제거 후 원래 요청 성공.
- DB trigger로 과거 이력 UPDATE/DELETE 거부, snapshot만 수정한 변조를 read/application 시 마지막 영속 이력과 불일치로 차단.
- PGlite 디스크 파일 close/reopen에서 이전 버전 2건과 포지션 유지, 오래된 ID 비연속 재전송 거부, 새 반전 체결 수락.
- 안전 경계: M4-T2는 오직 내부 모의 단일 계정 체결 적용. 실제 고유 match authorization, 양측 원자성·funding/fees·보험·risk·마진 버킷 및 외부 RPC 사용 불가. 실제 PostgreSQL 멀티 연결 및 온체인 QA 미검증.

- `git diff --check` 및 커밋된 변경 파일 자체 검증을 통과함. PostgreSQL 실서버/온체인 검증은 M4-T4 및 이후에만 수행.
