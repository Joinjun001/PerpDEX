# M3-T2 RESULT

상태: M3-T2-A 로컬 구현 완료, 실제 예치 자금 증빙·주문/포지션 통합(M3-T2-B/M3-T3 이상)은 미완료.

## 2026-10-24 구현

- 시작 HEAD: `281abc4` (`main`, clean, origin 대비 10커밋 앞섬); PROJECT_STATE/ROADMAP/M3-T1 문서 및 기존 SQL/트랜잭션 구조를 확인.
- `backend/sql/008_perp_margin_ledger.sql`: non-negative margin buckets, scope/버전, immutable operation IDs 및 두 개의 signed journal leg(차변/대변), unique/FK 제약.
- `backend/src/perp/margin-ledger.ts`: 상태 경계가 고정된 reserve/release/allocate/unallocate, 실 PostgreSQL `FOR UPDATE` 기반 버킷 잠금, DB와 함께 원자적 두 분개, 전체 담보 총합 보존, 요청 멱등·payload 변조 검출.
- `backend/scripts/migrate.ts`: 008 SQL을 명시적 **관리자 수동 마이그레이션 목록에만** 추가. 운영 DB 적용 없음.
- `backend/test/perp-margin-ledger.test.ts`: PGlite 독립 검증 12개 추가. **시작 잔액은 테스트 파일 내 비공개 SQL fixture로만 주입하고 production funding API는 없음**. 실제 자금 이전 불가.
- 기존 M2 공개 HTTP·EIP-712 v1 주문·매칭·Vault/서명 경로는 변경하지 않았다.
- `npm run build` 통과, 전체 `npm test` **174/174 통과 (0 failed)**. 검증 후 로컬 커밋; 원격 push 없음.
