# M2-T5 RESULT

상태: In Progress — M2-T5-A 로컬 구현 완료, B~E 미완료

## 2026-10-24 — M2-T5-A 정책 미승인 Settlement Outbox

- 작업 시작: `main` clean, HEAD `f54f358`, `origin/main`보다 2커밋 ahead. M2-T5 계획 항목 및 M2-T4 완료 문서 검토.
- `backend/sql/005_settlement_outbox.sql`: fill FK + 기본 키, 고유 trade ID, 준비 전용 4상태, 임대 fencing/재시도 시각/시도 횟수/마지막 오류/정책 대기 상태 제약 및 클레임 인덱스.
- `backend/src/settlement/outbox.ts`: 기존 `listSettlementSourceFills`를 통한 출처 검증, 도메인별 개별/배치 원자적 등록·멱등 중복 억제, `FOR UPDATE SKIP LOCKED` 기반 claim, UUID+만료 임대 fencing, 제한된 지연 재시도, 로컬 준비 완료 후 `WAITING_POLICY`로 전이. 자동 정산/승인은 구현하지 않음.
- `backend/scripts/migrate.ts`: 신규 SQL 005를 수동 마이그레이션 목록에만 등록. 어떤 운영 DB에도 실행하지 않음.
- `backend/test/settlement-outbox.test.ts`: 실제 서명 주문/매칭으로 생성한 PGlite 체결 데이터에서 신규 Outbox 회귀 테스트 9개. `npm run build` 성공, 백엔드 `npm test` **112/112 성공**.
- M2-T5-B의 자산·단위·증거금·위험 정책은 확인 없이 설정할 수 없으므로 직접 출금·잔액 이전·송금 준비가 가능한 상태로 승격하지 않음.
