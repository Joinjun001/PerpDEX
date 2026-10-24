# M5-T1 QA

- 신규 `backend/test/perp-risk-engine.test.ts`: **21/21 통과**. `npm run build` 통과, 백엔드 전체 **254/254 passed, 0 failed** (기존 233 + 신규 21).
- LONG 1 BTC@$65k 정상 10% IM=6,500 USDC, 5% MM=3,250 USDC, 8,000 USDC 모의 담보 equity, 8.125x의 정확한 81250 bps, 주문/청산 실행 권한 없음.
- LONG/SHORT 유리·불리 mark 시 손익 부호/Equity·notional 변동, `AVAILABLE + RESERVED + POSITION` 보존 및 예약금 제외한 가용 잔여 추정치.
- 0 포지션/0 equity·0 나눗셈 방지, IM 미달/MM 이하·음수 equity `INSOLVENT`, 정확한 경계값 및 레버리지 상한이 IM보다 엄격한 테스트 정책 분리.
- M4 partial close 후 누적 unbooked realized PnL(이익·손실) 포함, `realizedPnlBookedAtomic !== '0'` 즉시 거부하여 현재 모의 원장 미구현 book-keeping과 이중 계상 방지.
- 기초자산/가격/담보소수점 차이 및 극소값 반올림: 명목·IM·MM UP, tiny 손실 AWAY_FROM_ZERO, tiny 이익 TOWARD_ZERO.
- 버킷 합계 불일치·비정규/음수/uint256 초과, 누적 signed equity overflow, 위조 계정·토큰·체인/정책 revision, stale/future/다른 오라클·confidence/mark deviation, MARKET status DRAFT/REVOKED 거부.
- M3/M4/체결/실담보/체인 상태 수정 없음. 실제 시장·Vault 마진 수탁, 실현손익 게시·funding·수수료·reduce-only/order gate 및 청산 자동 트리거 **미구현**.

- 최종 `cd backend && npm run build` 성공, `cd backend && npm test` **254/254**, `git diff --check` 성공. 실 PostgreSQL/Foundry/온체인 변경 없음.
