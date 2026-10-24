# UX-HL-01-B2-B2-B1 백엔드 계정 조회 보안 경계 조사

기준: 2026-10-25, 저장소의 실제 backend/src/http 와 backend/src/orders/order-store.ts 읽기 전용 분석.

## 확인된 HTTP 엔드포인트

| 경로 | 실제 기능 | 프런트 계정 탭에 직접 재사용 가능한가 |
| --- | --- | --- |
| GET /api/orders | 시장·상태·limit/offset 조건으로 orders 목록 조회 | 아니오. 지갑별 계정 인증/소유자 필터 없는 public order list |
| GET /api/orders/:orderId | orderId로 서명 도메인 범위의 public order 상세 조회 | 아니오. 주문 ID 외 계정 접근 제어 없음 |
| POST /api/orders | EIP-712 서명 신규 주문·matching | 계정 조회 API 아님 |
| POST /api/orders/cancel | 서명 취소·nonce 정합성 | 계정 조회 API 아님 |

- createOrderHttpHandler는 신뢰된 주문 서명 도메인으로 한정하지만 사용자 로그인·wallet ownership proof·세션 인증·계정별 read scope 처리는 제공하지 않는다.
- PostgresOrderStore.listPublic는 chain/verifyingContract/market/status만 WHERE에 걸며 account 조건은 없다. findPublicById는 orderId만 조회한다. 클라이언트가 계정별 목록처럼 임의 필터링해서 보여주는 것은 개인 계정 전용 권한 검증을 대체할 수 없다.
- signed-sim-account-reconciliation.ts의 reconcileSignedSimAccount는 backend 내부 트랜잭션 감사 함수이며 현재 createOrderHttpHandler의 HTTP 라우트로 제공되지 않는다.
- 현재 frontend/trade.html은 connect-src none이고 account-tabs.js는 미연결 상태만 표시한다. 실제 API를 공개된 Pages에서 호출하는 설정은 없다.
- 이 분석은 코드에 존재하는 라우트와 SQL 검색 조건을 확인한 것으로, 실제 운영 API 배포·지갑 인증·권한·체인 출처를 실행 검증한 것은 아니다.

## 이번 회차 독립 검증기 — 계정 read 흐름

- frontend/account-read-flow.mjs: 외부에서 제공하는 verifySession 및 query 콜백이 모두 있어야 생성되는 오프라인 흐름. 네트워크/지갑/토큰 저장/DOM 조작 코드 없음.
- verifySession 반환 계약: Sepolia chainId 11155111, 40hex EVM 계정 주소, 선언된 LOCAL_DB 또는 VERIFIED_TESTNET source, 안전 정수 sessionVersion(1 이상). 이 반환값의 실제 진위는 검증하지 못한다. 미래의 신뢰된 서비스가 외부에서 확인해야 한다.
- 같은 sessionVersion으로 다른 계정을 허용하지 않으며 이전보다 낮은 sessionVersion으로 되돌아가는 것을 거부한다. 계정/source/버전 변경은 진행 중 조회 취소·과거 기록 초기화. 이전 요청 응답·오류는 표시하지 않는다.
- read flow는 각 요청 전후 verifySession으로 동시 계정/세션 변경을 점검하고, AbortController로 겹친 요청의 취소 신호를 전달한다. 실제 query 함수가 signal을 무시하더라도 token/세대 검사를 통해 늦은 응답을 폐기한다.
- 모델은 이미 구현된 계정 조회 계약 validateAccountQueryResponse의 행 검증, 중복, requestId, revision 검사와 coordinator의 fail-closed 상태에 의존한다.
- onChange 콜백은 상태 알림만 전달한다. 해당 콜백에 실제 DOM 연결과 데이터 허용 옵션을 넣는 것은 별도 인증 경계/서버 검증 완료 후 허용한다.
- 로컬 테스트에서는 가짜 verifySession 및 query 함수를 주입하고 동시·연속 요청·오류·연결 해제·계정 변경·세션 취소 상황을 검증한다. 실제 앱에는 이 모듈을 import하거나 생성하지 않는다.

## 실제 계정 조회 연동 전 필수 게이트

1. 서버 측 인증된 지갑 소유권 세션과 nonce·만료·replay·서명 domain 검증. EIP-712 주문 서명만으로 개인정보 조회 로그인 권한을 자동 부여하지 않는다.
2. 계정 소유권에 따라 제한된 별도 read API (positions/open-orders/order-history/trade-history/funding-history) 제공. 서버에서 account, chainId, 시장/토큰, 데이터 접근 범위 강제. public 주문 목록 API 재사용 불허.
3. API 응답 형식과 frontend/account-query-contract.mjs 5개 row 계약 정밀 비교 및 필드·단위 마이그레이션 승인. READ-ONLY, no-store, page-size, cursor/revision, 정보노출 방지·CORS/CSRF·HTTPS 등 확인.
4. LOCAL_DB 데이터와 온체인 확정 정산 데이터의 구분, 체인 재구성·가상 가격과의 차이, 기록 버전과 일관성 정책 확정.
5. 신뢰되는 verifySession/query 구현·브라우저 wallet 이벤트·해제·계정 이동·서버 오류/retry·모바일 브라우저·보조공학 E2E를 별도 환경에서 검증.
6. 이 게이트 전에는 기존 정적 Pages 데모의 account tbody를 비운 상태로 유지하고 실제 주문/온체인 기능을 활성화하지 않는다.

## 다음 미완료 UX TASK

- UX-HL-01-B2-B2-B2: 위 1~4의 실제 계정 read API 및 신뢰 경계 준비가 확인되면 실제 브라우저 adapter 연결 및 계정 전환 E2E 검증. 서버·지갑이 여전히 준비되지 않으면 독립 가능한 UX-HL-01-C의 브라우저/접근성 검증으로 전환.
