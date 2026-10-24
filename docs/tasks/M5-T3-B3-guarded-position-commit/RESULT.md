# M5-T3-B3-A RESULT

**상태:** 개발용 SIMULATION_ONLY 모의 영속 포지션의 COMMIT시 예약/체결/시장 OI 검증 + Boolean 우회 제거 로컬 구현. B3 전체/운영 권한 완성 아님.

- 시작 `main` clean, HEAD `1d7ee5b`, `origin/main` ahead 22. M5-T3-B2 문서 4개, STATE/ROADMAP/SQL 010~012 및 M4/M5 저수준 writer 전부 확인.
- 신규 `backend/sql/013_perp_guarded_position_commit.sql`: DEFERRABLE INITIALLY DEFERRED position trigger, guarded account snapshot과 010 M4 append-only fill·011 paired fill/OI·012 reduce order/event 동일 체결을 커밋 때 DB 자체 검증. Raw SQL, 승인 플래그, 직접 single-account 저수준 writer를 통한 조작이 영구 저장되는 것을 차단.
- `backend/src/perp/paired-clearing.ts`: `guarded:boolean` 위험한 호출 규약을 검증 대상 BUY/SELL 예약 주문 ID 증거로 교체, 같은 DB 연결/시장 OI lock 중 live reserve/snapshot/margin 재검증, 013 미설치면 fail-closed.
- `backend/src/perp/{reserved-paired-clearing,partial-reserved-paired-clearing}.ts`: 두 계정의 구체적인 예약 주문 ID를 M4 저수준 함수에 전달; FULL B1/PARTIAL B2 모두 기존 모의 흐름 유지.
- `backend/scripts/migrate.ts`: 새 SQL 013를 로컬 마이그레이션 목록에 추가. 운영 실행 없음.
- `backend/test/perp-reserved-paired.test.ts`: 재현 실패→차단 통과 B3 신규 8개 + 기존 B1/B2 회귀.
- 한계: 동일 고권한 DB 역할에서 트리거 비활성화/DDL 및 guard/order/history 직접 위조는 별도 권한 설계 필요. 운영 Postgres·자격증명·M2 signed orders·M3 자금 이동/지급·체인 송신과 미연결. 다음 B3-B SQL 역할/guard mutation 불변성, 그 후 M5-T3-C, M5-T4.

- 신규 B3 보안 테스트 **8/8 PASS**, 전체 backend **322/322 PASS**, TypeScript build/변경 검사 통과. 앞선 취약 시뮬레이션 3건은 013 적용 전 실제로 커밋됨을 재현하고 수정 후 전부 거부됨을 확인.
