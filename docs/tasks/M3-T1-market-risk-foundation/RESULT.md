# M3-T1 RESULT

상태: Local Implementation Completed (실제 위험 엔진/실 거래 경로 미연결)

## 2026-10-24 구현 및 검증

- 시작 Git: `main` clean, HEAD `2f46afb`, `origin/main` 대비 9개 로컬 커밋 앞섬. SPEC·TODO·RESULT·QA, PROJECT_STATE 및 ROADMAP 확인.
- `backend/src/perp/fixed-point.ts`: strict uint256/int256 canonical 값, overflow/반올림 명시적 BigInt mulDiv, 시장 base/price/quote 담보 단위 변환.
- `backend/src/perp/market-config.ts`: trusted registry ID와 승인 표시를 모두 요구하는 MarketConfig, 도메인·시간/시장/자산·금액 스케일/위험 한도의 모든 값 검증, tick/lot 주문 값 검사.
- `backend/src/perp/price-snapshot.ts`: 로컬 mock price snapshot의 출처·시장·도메인, mark/index band, freshness/confidence/sequence 검사.
- `backend/test/perp-market-foundation.test.ts`: M3-T1 기능 테스트 13개 (정밀도·오버플로·정책/출처/시간/배수·오라클 재생 공격/경계) 통과.
- `npm run build`: 통과. 전체 `npm test` **162/162 통과**, 실패 0. 레버리지/초기증거금 일관성 조건 수정 후 최종 회귀 검증.
- 다음 독립 개발 TASK: **M3-T2 — 영속 격리 증거금 이중 분개·예약/해제 원장**. 본 회차에서 공개 주문·실자산·Vault·온체인·운영 DB/배포·remote push는 건드리지 않음.
