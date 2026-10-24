# M5-T3-C1 QA

- 신규 PGlite **13개** 서명 위험 평가 통합·경합·복구 테스트. 신규 **13/13 PASS**, 전체 backend **342/342 PASS, 0 FAIL**, TypeScript build 및 `git diff --check` 통과.
- 신규 서명 OPEN 비-Reduce-only 주문의 v2 EIP-712 서명 재검증과 M3 nonce USED, `perp_sim_orders` 저장 시장·계정·초기 IM/오라클 snapshot sequence·policy revision/hash·expiry 대조.
- M3 RESERVE operationId/orderId와 AVAILABLE/RESERVED 두 leg의 실제 원장 postings 및 RESERVED bucket와 전체 OPEN reservation obligations, 3 bucket 버전·잔액/uint256 합계를 검사.
- M4 스냅샷 버전/영속 journal·시장 LONG=SHORT/기록된 OI와 M5 pre/post 상태를 한 TX에서 계산. `executionAuthorized:false`, 새 fill/order/담보 operation 생성 0건. 임의 caller expectedVersion/오라클 불일치·guard 혼재 fail-closed.
- 위조 signer, 변경된 주문·도메인/policy, stale Oracle, 취소 이후 주문, Nonce 중복, 예약금 부족, RESERVE operation/entry 변조, 기록된 OI 변조, 동일 Nonce 동시 접수·반복 병렬 계산, 가상 부분 체결, forced SQL query outage rollback, persistent PGlite close/reopen 전후 동일 주문 인증을 검증.
- 정책/Oracle·자산/실 예치 출처는 로컬 테스트 fixture에 한정, 실제 M4 포지션 적용/M3 margin bucket allocation/실현 손익·실자금/체인/배포/Push 미연결. 실제 PostgreSQL 16+ multi-connection/nonowner 권한·M5-T4 QA 미수행.

- 최종 `cd backend && npm run build`: **PASS**. `cd backend && npm test`: **342 tests, 342 pass, 0 fail** (이전 329 + 신규 13). 실제 PostgreSQL 서버/Foundry/온체인 변경 미실행, 운영 자격증명·원격 push 미사용.
