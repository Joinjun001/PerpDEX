# M5-T3-C1 RESULT

상태: **EIP-712 v2 signed SIMULATION_ONLY OPEN 주문의 M3 영속 증거금 RESERVE/Nonce·M4 포지션/OI·M5 pre/post risk 일관성 단일 DB TX 검증 구현**, 자금 이동/체결 미연결.

- 시작 `main` clean HEAD `b818eb1`, origin/main보다 24 로컬 커밋 앞섬. PROJECT_STATE/ROADMAP/B3-B TASK SPEC/TODO/QA/RESULT, 기존 signed `sim-order.ts`, M3 margin ledger, M4 position/paired OI, M5 pure risk & reduce reservations, SQL 001/008~014 확인.
- `backend/src/perp/sim-order.ts`: M3 admission에서 인증·시장 정책·증거금 계산 부분을 공개 internal-only `authenticateSimPerpOrderIntent()`로 추출. 원래 M3 admission의 동일 함수를 재사용하고 유효한 v2 서명/nonce/모의 오라클 조건 유지.
- `backend/src/perp/signed-sim-risk-gate.ts`: 기존 영속 주문과 M3 RESERVE 단일 계정 세 bucket·double entry, M4 포지션 버전·PAIRED OI를 같은 DB TX 잠금/검증하고 M5 순수 pre/post 계산 report 반환. 주문·포지션·증거금 DB 변경 기능 **전혀 없음**; reduce-only guard 계정과 opening signed order를 혼용 금지.
- `backend/test/perp-signed-risk-gate.test.ts`: 신규 PGlite 13개 정상/위조·중복·증거금 조작/동시·장애/재시작 위험 게이트 검증. 신규 PGlite **13/13 PASS**, 전체 backend **342/342 PASS (0 FAIL)**, TypeScript build/diff 검사 PASS.
- 사용자 승인 없이는 새 서버 정책값·실 자산/입출금 근거를 만들지 않음. 후속 C2는 서명된 양측 opening orders의 경제적/체결 ID/필요 증거금 pair 결속과 M4 시장 OI 원자 적용을 별도 설계·구현. C3에서 M3 자금 버킷 배분·손익/fee/펀딩·취소·부분 잔량 회계. M5-T4 실제 PG 권한/경합 QA.
