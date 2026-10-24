# M5-T3-B3-B — Reduce-only 예약·guard·이벤트 무결성 보호 (SIMULATION_ONLY)

## 목적 및 실제 범위

기존 SQL 013은 **포지션 스냅샷에 DML이 발생한 경우**만 커밋 무결성을 검사했습니다. 포지션에 손대지 않고 `perp_reduce_guards`, `perp_reduce_orders`, `perp_reduce_events`를 직접 UPDATE/DELETE/INSERT하는 독립 SQL writer는 우회했습니다. 이번에는 SQL 014를 수동 마이그레이션 목록에 추가하여 guard/예약 주문/이벤트 각각의 변경에 대해 커밋 이후 원장 합계가 일치하도록 만듭니다. 운영 DB에는 마이그레이션하지 않았습니다.

## 변경 내역

- `backend/sql/014_perp_reduce_ledger_integrity.sql`: `perp_reduce_orders`의 신원/시장/계정/가격/요청 원수량/정책 해시/오라클 해시/마진 fingerprint/created_at 불변성을 **BEFORE** UPDATE/DELETE로 검사. 주문 삭제 및 CANCELLED/EXHAUSTED 주문의 사후 변조 금지. OPEN 주문의 remaining·consumed·cancelled 단조 변화, position_version 감소 거부. 기존 CHECK `requested=remaining+consumed+cancelled`는 그대로 유지.
- `perp_reduce_guards`는 DELETE/도메인 이동·한 번 앵커링된 정책 해시/수정 revision 역행 금지. 새 guard의 NULL→version/size/revision/hash 최초 앵커링은 같은 트랜잭션에서 허용.
- guard/orders/events에 모두 `DEFERRABLE INITIALLY DEFERRED` CONSTRAINT TRIGGER를 설치, **최종 커밋 시점**에 같은 chain·verifyingContract·market·collateral·account의 실제 M4 스냅샷 버전·수량·config revision과 guard를 비교. 모든 주문의 누적 CONSUME/CANCEL 이벤트 수량이 각 주문의 consumed/cancelled 필드와 일치해야 하며, 모든 OPEN 주문은 최신 position version/정책과 일치해야 함.
- M4 `perp_sim_paired_fills`에 동일 fillId로 입증된 체결 소진 이벤트는 포지션에 이미 반영된 것으로 판정하고, **입증되지 않은 A-stage shadow CONSUME**는 `guard.consumed_qty_atomic`에만 누적. `SUM(OPEN remaining)+SUM(unpaired shadow CONSUME)<=abs(현재 포지션)`을 강제. M4 paired 이벤트에서는 시장·담보토큰·체결량·매수/매도 계정을 별도 대조.
- `backend/src/perp/paired-clearing.ts`는 예약 포함 양측 모의 체결 시작 시 SQL 013 **및 014의 3개 deferrable trigger 활성화**를 검사하여 하나라도 누락/비활성이면 fail-closed. 기존 B1 전체 예약 소진 및 B2 부분/다중 예약/취소 API 정상 흐름은 유지.
- `backend/scripts/migrate.ts`에는 014를 명시적 로컬 admin migration 목록에만 추가; 운영 DB에는 자동 적용하지 않음.

## 위협 모델 및 남은 위험

- 독립적인 단일 테이블 UPDATE, 잘못된 이벤트 INSERT, 초과 용량 신규 주문 삽입은 DB가 거부. 그러나 **동일한 고권한 DB 역할이 guard+주문+이벤트를 동시에 일관된 허위 값으로 조작하면** 단순 트리거 합계 검사만으로 서명/권한을 입증할 수 없음. 추가 SQL 함수·트리거 설치/비활성화 권한을 가진 table owner·SUPERUSER 역시 방어 불가.
- 실제로 안전한 실행에는 별도 NOLOGIN schema-owner, 제한된 runtime role, 공개 SQL 대신 감사 가능한 SECURITY DEFINER 트랜잭션 API, 행 잠금 및 권한 관리, 기존 데이터 사전 감사/백업이 필요. 문서 `ROLE_POLICY.md`는 계획/검사 절차일 뿐 DB 권한을 적용하지 않음.
- 기존 DB가 이미 변조되어 있는 경우 새 CONSTRAINT TRIGGER 설치만으로 역사적 행이 자동 검증되지는 않음. 모든 guard/order/event/position/OI를 대상으로 읽기 전용 preflight consistency audit과 스키마 version 인수 필요.
- 다른 데이터 시장·계정의 업데이트는 독립 스코프로 검증. 수수료/펀딩/자금 증거금이 원자 결속되지 않았으므로 SIMULATION_ONLY·로컬 개발 범위 외 실행 금지. 실제 다중 연결 PostgreSQL 성능/데드락 검증은 M5-T4 후속.
