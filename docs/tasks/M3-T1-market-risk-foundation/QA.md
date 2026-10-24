# M3-T1 QA

상태: **M3 신규 13/13 passed, 백엔드 전체 162/162 passed, 0 failed**. `npm run build` 통과.

## 2026-10-24 로컬 테스트

- `node --experimental-strip-types --test test/perp-market-foundation.test.ts` **13 passed / 0 failed**.
- uint256/int256/2^53 초과·signed PnL 부호·정규 10진 문자열·explicit UP/DOWN/TOWARD_ZERO/알고리즘 중간 512-bit BigInt·최종 overflow, notional scale 불일치/0으로 반올림 거부.
- MarketConfig 신뢰된 소스/APPROVED·revision·정책 유효 기간·체인/시장/정밀도·collateral 주소, tick/lot/min/max/OI/IM/MM/leverage/오라클 한도 검증. 입력 임의 승인·유효기간 만료·타 도메인/비정상 스케일/초과 한도는 거부.
- Mock PriceSnapshot index/mark 및 신뢰도·가격 이탈 한도, stale/future 가격, 시퀀스 재생/역행, 시장·체인·oracle source/정책 revision 오염 거부.
- 기존 M2 엔드포인트, 공개 서명 유형/실제 Vault 또는 DB 상태를 변경하지 않았음. 시장/위험 설정 수치는 **운영에 적용 불가한 테스트 픽스처일 뿐**이며 주문 실행·위험 엔진으로 연결되지 않음.

## 미검증/사람 확인 필요

- 실제 오라클 provider 및 TLS/서명·다중 가격원·최종성, 공식 자산/정밀도 및 초기/유지증거금·레버리지·OI·펀딩·청산 한도 승인.
- 실제 자금 보호/DB 영속 double-entry ledger/복수 프로세스 동시성은 M3-T2~ 이후 구현, M8 계약/온체인 별도 인수. 원격 push/배포/키·RPC·자금 이동 미실행.

- 전체 백엔드 `npm test`: **162 tests passed, 0 failed**, 기존 149 + 신규 13.
- 레버리지 상한 점검 중 초기증거금률 10%이면 최대 허용 레버리지가 10배라는 경계를 바로잡고 5배 허용/11배 거부 테스트로 재검증.
