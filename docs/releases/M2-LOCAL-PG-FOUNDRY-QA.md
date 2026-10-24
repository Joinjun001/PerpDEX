# M2 실제 PostgreSQL·Foundry 로컬 검증 (승인된 개발용 QA)

기준일: 2026-10-24. 운영/스테이징 서버·실체인·원격 Git 변경 없이 `/shared/PerpDEX`에서 수행한 개발용 검증을 기록한다.

## 승인 및 범위

- 사용자 명시 승인: "PostgreSQL과 Foundry 로컬 테스트를 허용할게".
- 허용: 개발용 PostgreSQL 서버 및 Foundry의 로컬 빌드/테스트, 전용 테스트 DB 내 신규 테이블/스키마와 일회용 테스트 지갑 생성.
- 금지 유지: 운영 DB 접속·변경, 외부 TCP 수신, 실제 토큰 전송/체인 RPC/브로드캐스트, 자격증명 사용, 원격 push, 배포.

## 실제 실행 환경

- Foundry `forge` 1.8.5 (`/root/.foundry/bin/forge`). 추가 설치 없이 `cd contracts && forge build && forge test -vv` 실행. 총 **35/35 tests passed**, 4개 스위트 중 Solidity `AccountingInvariant`는 **256 runs × 500 calls = 128,000 calls**, reverts 0. 4개 fuzz test도 각각 256회 통과.
- PostgreSQL 서버/클라이언트 **15.19 (Debian)** `.deb` 패키지만 `apt-get download`로 받아 `/tmp/perpdex-pg-packages/root`에 **unpack**. 시스템 전역 설치·systemd 등록·운영 서비스 시작 없음.
- `initdb`로 `/tmp/perpdex-pg-check/data`의 임시 클러스터를 생성하고 OS 사용자 `nobody`로 실행. `/tmp/perpdex-pg-check/socket`에 권한 0700인 Unix domain socket 사용. `listen_addresses`는 빈 문자열(TCP 비활성). PostgreSQL 내 `inet_server_addr()`는 NULL.
- 테스트 전용 DB 이름 `perpdex_autopilot_test`를 생성. 테스트 코드는 DB 호스트·사용자·DB 이름을 고정하고, `/tmp/perpdex-pg-*/socket` 패턴이 아닌 실행을 거부한다. 암호·URL·운영 설정은 읽지 않는다.

## 실제 PostgreSQL 다중 연결 검증

```bash
cd /shared/PerpDEX/backend
npm run build
PERPDEX_TEST_PG_SOCKET=/tmp/perpdex-pg-check/socket npm run test:postgres-local
```

- `backend/qa/postgres-local.test.ts`를 **2회 연속 실행하고 서버 재시작 후 한 번 더 실행하여 각 4/4 통과**. 각 실행은 난수 고유 스키마 `perpdex_qa_*`를 하나만 새로 만들어 데이터 혼합 없이 `001~007.sql` 마이그레이션. 실 운영 스키마는 수정하지 않는다.
- 검증 1: 모든 SQL 001~007 FK/인덱스/7개 필수 테이블이 실제 PostgreSQL 15에서 정상 생성되고, 서버·DB가 로컬 소켓 전용임을 확인.
- 검증 2: `pg.Pool` 복수 연결에서 실 EIP-712 주문/nonce 동시 중복 예약(요청 5개 중 하나만 성공), 주문 접수/시장별 매칭/체결 원장의 정확한 수량과 단일 commit 경계 확인.
- 검증 3: 영속 Outbox 다중 등록 멱등성, 별도 `pg.PoolClient`의 `SELECT ... FOR UPDATE` 잠금 중 다른 연결의 `FOR UPDATE SKIP LOCKED`가 잠긴 행을 건너뛰는지, 재선점/완료 상태 확인.
- 검증 4: 실 PostgreSQL 주문 체결 쓰기에서 강제로 SQL CHECK 오류 발생시 nonce·주문·오더북/체결이 한 트랜잭션으로 롤백되고, 같은 정상 서명을 수정 없이 다시 보내 성공하는지 확인.

## 검증 결과 및 잔여 게이트

- Foundry: **35/35 passed**, Solidity invariant 128,000 calls / 0 revert.
- 실제 PostgreSQL 15: **4/4 passed × 3 separate runs (including one after PostgreSQL restart)**. 이번 검증은 여러 PG 연결/동시 작업이지만, **별도 OS 프로세스 여러 개가 각각 API를 띄운 분산 테스트는 아님**.
- Backend 기존 PGlite/HTTP/E2E 전체 회귀: **149/149 passed**, TypeScript build 성공.
- **미검증**: 실 스테이징/운영 DB의 접근제어·백업/복구·부하·장애 주입/멀티프로세스, 실제 Vault 배포·체인 거래·정산 정책/수수료/마진·청산 위험 모델, RPC receipt finality/재조직. 로컬 Foundry 통과는 네트워크 배포 승인 아님.
- 테스트 DB 서버는 검증 종료 후 `pg_ctl -D /tmp/perpdex-pg-check/data -m fast -w stop`으로 **정상 종료**했고 사설 Unix 소켓 제거를 확인했다. 임시 SQL 바이너리는 개발용 `/tmp` 경로이며 소스·Git 커밋에 포함하지 않는다.
