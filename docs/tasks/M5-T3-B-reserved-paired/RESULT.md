# M5-T3-B1 RESULT

상태: **양쪽 온전한 reduce-only 예약의 모의 전량 소진과 M4 양측 포지션/OI 저장을 하나의 트랜잭션에서 결속하는 제한적 로컬 구현**. B2/B3/C 별도 미완료.

- 실제 시작: main clean, HEAD `27b6e27`, 원격 대비 20개 앞섬. PROJECT_STATE/ROADMAP/M5-T3-A SPEC/TODO/QA/RESULT 및 M3/4/5 source/010~012 SQL 읽음.
- `backend/src/perp/paired-clearing.ts`: 기존 M4 public wrapper는 유지, 공통 내부 SqlRunner 처리로 분리. 계정에 M5 reduce guard가 있으면 direct ungated M4 paired writer는 거부. `position-ledger.ts`의 단일 계정 M4 public writer도 012 guard가 있는 계정은 거부하도록 보강.
- `backend/src/perp/reduce-reservations.ts`: 2-계정 guard 잠금·stale position/margin/oracle 검사, FULL OPEN 예약 매칭·구 이벤트 차단, M4 영속 체결 이후 동일 트랜잭션 이벤트를 공통 fillId에 결속하고 새 position version/size로 guard 재앵커링.
- `backend/src/perp/reserved-paired-clearing.ts`: OI row → 정렬 계정 guard → position/margin 락, 검증 후 M4 양측 포지션과 OI 갱신·양쪽 M5 예약 소진 이벤트 저장을 한 `withTransaction` 호출로 처리.
- `backend/test/perp-reserved-paired.test.ts`: PGlite 신규 테스트 정상/중복 경합/한쪽 실패·replay·서버 재시작 역할의 disk close/reopen 시나리오.
- 금지사항 준수: 운영 DB/실주문 활성화/자산/온체인/키/배포/원격 push 미실행.

- 최종 신규 PGlite B1 **9/9** 및 M5-A 1개 신규 writer 우회 회귀 포함 전체 백엔드 **301/301 PASS**, 타입 빌드와 diff 검사 성공. 실 PostgreSQL/실 자금/원격 push 미실행.
