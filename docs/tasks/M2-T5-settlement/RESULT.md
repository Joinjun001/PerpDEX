# M2-T5 RESULT

상태: In Progress — M2-T5-A/B/C 로컬 구현 완료, D~E 미완료

## 2026-10-24 — M2-T5-A 정책 미승인 Settlement Outbox

- 작업 시작: `main` clean, HEAD `f54f358`, `origin/main`보다 2커밋 ahead. M2-T5 계획 항목 및 M2-T4 완료 문서 검토.
- `backend/sql/005_settlement_outbox.sql`: fill FK + 기본 키, 고유 trade ID, 준비 전용 4상태, 임대 fencing/재시도 시각/시도 횟수/마지막 오류/정책 대기 상태 제약 및 클레임 인덱스.
- `backend/src/settlement/outbox.ts`: 기존 `listSettlementSourceFills`를 통한 출처 검증, 도메인별 개별/배치 원자적 등록·멱등 중복 억제, `FOR UPDATE SKIP LOCKED` 기반 claim, UUID+만료 임대 fencing, 제한된 지연 재시도, 로컬 준비 완료 후 `WAITING_POLICY`로 전이. 자동 정산/승인은 구현하지 않음.
- `backend/scripts/migrate.ts`: 신규 SQL 005를 수동 마이그레이션 목록에만 등록. 어떤 운영 DB에도 실행하지 않음.
- `backend/test/settlement-outbox.test.ts`: 실제 서명 주문/매칭으로 생성한 PGlite 체결 데이터에서 신규 Outbox 회귀 테스트 9개. `npm run build` 성공, 백엔드 `npm test` **112/112 성공**.
- M2-T5-B의 자산·단위·증거금·위험 정책은 확인 없이 설정할 수 없으므로 직접 출금·잔액 이전·송금 준비가 가능한 상태로 승격하지 않음.

## 2026-10-24 — M2-T5-B 신뢰 정책·서명 검증 정산 지시 (이번 회차)

- 시작 Git: `main` clean, HEAD `c985bf8`, 원격 `origin/main` 대비 3커밋 앞섬. M2-T5-B를 현재 첫 미완료 항목으로 확인.
- `backend/src/settlement/policy.ts` 신규: 신뢰된 시장 정산 정책의 계약/체인·토큰·정밀도/수수료·금액 한도·방향·위험/마진 모델·유효 기간 필수 검증, 정확한 uint256 BigInt 금액 처리, 승인된 체결별 EIP-712 서명 검증 및 정책 해시 결합, 정산 지시 데이터 생성. 임의 수수료/증거금/금액 산출 또는 자금 이동 기능 없음.
- `prepareSettlementInstructionFromLedger`: DB 읽기 전용 트랜잭션 안에서 이전 M2-T4-D `listSettlementSourceFills`와 M2-T5-A `getSettlementOutboxEntry`를 재사용. 실제 원장·Outbox WAITING_POLICY와 서명 도메인 및 결정적 tradeId가 모두 일치해야만 정산 지시를 반환한다.
- `backend/test/settlement-policy.test.ts`: 테스트 전용 메모리 생성 계정으로 승인 서명 검증, 금액 변경/타인 서명·만료·정책 필드 조작/재사용/승인 없는 Outbox/다른 시장·체인 및 BigInt 정확성 확인. `npm run build` 성공, 전체 백엔드 `npm test` **122/122 통과** (기존 112 + 신규 10). 실사용 정책 승인자 계정이나 자격 증명 사용하지 않음.
- 실제 운영용 정책·위험 계산/담보 잔고/실제 signing service는 사용자 승인 전 **미구현**. M2-T5-C는 dry-run 영속 전송 의도와 모의 실행만 구현하며 실제 전송은 하지 않음.

## 2026-10-24 — M2-T5-C 영속 정산 의도 및 로컬 dry-run (이번 회차)

- 시작: `main` HEAD `45ca559`, 워킹트리 clean, 원격 `origin/main`보다 4개 로컬 커밋 앞섬. TASK SPEC/TODO/QA/RESULT 확인.
- `backend/sql/006_settlement_intents.sql`: 실제 Outbox FK, fill PK/trade UNIQUE, 정규화 지시 JSON·hash, `PREPARED/SIMULATING/SIMULATED/UNKNOWN`만 허용하는 상태 제약, 조건부 모의 선점 토큰/시각/성공 해시.
- `backend/src/settlement/dry-run.ts`: 기존 인증된 체결원장·Outbox·정책/승인 서명 검증 계층을 거쳐 재검증된 지시만 트랜잭션에서 등록. 이미 등록된 다른 지시의 불변식·해시 충돌은 거부. 로컬 M1 `CollateralVault.settle()` calldata 인코딩·digest만 생성(실제 RPC/provider·서명/송금 없음), 결과 상태/중복 모의실행 방지·불확실 상태 수동 격리. 체결과 체인 영수증은 별도 상태로 구분.
- `backend/scripts/migrate.ts`: 수동 마이그레이션 목록에 SQL 006 추가. 운영 DB에는 적용하지 않음.
- `backend/test/settlement-dry-run.test.ts`: 실제 서명·체결원장/Outbox 및 PGlite 통합을 통한 11개 신규 테스트. 일관성/변조·동시 등록/선점, 모의 ABI 인코딩, 잘못된 승인 차단, SQL 삽입·결과 저장 오류, 중단 후 UNKNOWN 격리, 재시작·중복 거부를 검증. `npm run build` 성공 및 전체 `npm test` **133/133 통과**.
- 미완료: M2-T5-D 실제 RPC가 아닌 신뢰 가능한 read-only 모의 receipt/체인 상태 재조정과 불명확한 브로드캐스트 처리; M2-T5-E 전체 릴리스 QA. 외부 승인 없이는 브로드캐스트/자격증명/운영 마이그레이션 금지.
