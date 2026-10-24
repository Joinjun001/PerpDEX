# M5-T3-B3-B — PostgreSQL 최소권한 및 이관 계획 (실행하지 않음)

이 문서는 프로덕션 계정 생성·비밀번호·GRANT를 **수행하지 않는 운영 보안 계획**입니다. 이번 작업에서 임시/운영 DB 역할은 변경되지 않았습니다.

## 권한 분리 목표

1. **Schema owner/migrator:** `NOLOGIN` 오브젝트 소유자에 schema·DDL 권한 집중. migration은 별도 승인/백업/기존 원장 preflight 점검 후 일회성 책임자만 수행. 앱의 접속 역할과 별개로 관리하며 `ALTER TABLE ... DISABLE TRIGGER` 권한을 runtime에 부여하지 않음.
2. **Readonly auditor:** 포지션·예약 원장에 `SELECT`만 필요. 위험평가·운영 관측·감사 조회에서 INSERT/UPDATE/DELETE/CREATE/TRUNCATE 금지.
3. **Simulation writer:** 현재 TypeScript 트랜잭션은 guard·orders·events·position·paired OI에 직접 DML하므로, 단순히 owner만 분리하더라도 이 writer가 3개 테이블에 모두 DML 할 수 있으면 *논리적으로 일관된 허위 이벤트를 만들 수 있음*. **운영 권한 인수 전** 신뢰 가능한 서버 내부 코어와 외부 API 쓰기 역할을 분리하고, 소유자가 관리하는 검증된 트랜잭션 API(`SECURITY DEFINER` with fixed `search_path`, no dynamic SQL, parameter validation, tested non-owner execution) 또는 동등한 완전한 서비스 권한 격리가 필요.
4. **Permission review:** `pg_class.relowner`, `pg_roles.rolsuper/rolcreaterole/rolcreatedb/rolbypassrls`, `pg_namespace.nspowner`, `pg_trigger.tgenabled`, `has_schema_privilege`, `has_table_privilege`, `pg_proc.prosecdef`를 읽기 전용으로 감사한다. 서비스 runtime 역할에는 owner/CREATE/DDL 권한 없음과 013/014 모든 trigger 활성화를 확인.
5. **기존 데이터 인수:** 오프라인 백업 후 실 OI=LONG=SHORT, guard의 스냅샷 version/수량/정책 일치, 주문 requested=remaining+consumed+cancelled, ORDER별 append-only CONSUME/CANCEL 합계, M4 paired fill과 M5 이벤트 동일 ID·계정·시장·담보·수량 증빙, unpaired shadow consumption과 guard 누적 수량, OPEN 예약 합계 용량까지 검사한다. 불일치하면 migration·실거래 활성화를 중단한다.

## 주의 사항

- 개발용 PGlite는 동일 소유자 수준 테스트이므로 **실제 DB 역할 분리 보안을 증명하지 못함**. SQL 014는 독립된 변경의 회계 정합성을 높이는 보완 장치일 뿐, 인증·권한의 증명이 아님.
- 역할 변경이나 GRANT/REVOKE는 명시적 사용자 승인, 기존 서비스 경로/트랜잭션 호환성 검증, 권한 회복 계획 전에는 적용하지 않는다.
- 명시적으로 승인된 *임시 Unix socket만 사용하는* PostgreSQL에서 복수 비소유자 역할과 롤백/교착을 먼저 시험한 뒤, M5-T3-C/M5-T4에서 운영 인수 준비 여부를 별도 보고한다.
