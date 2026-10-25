# UX-HL-03 결과

## 2026-10-25 UX-HL-03-A1 — 로컬 완료

- frontend/account-tabs.js: activate 시 활성 tab과 가로 스크롤 영역의 좌우 bounding 비교, 필요한 scrollLeft만 변경. 키보드 focus({preventScroll:true}) 후 가로 이동. 기존 tab/tabpanel ARIA·미연결 상태 유지.
- frontend/trade.css: 계정 탭 스크롤 영역 padding 보강.
- frontend/account-tabs.test.mjs: scroll 영역 마크업과 bounding fake DOM 지원.
- frontend/account-tab-visibility.test.mjs: 신규 8개 실행형 스크롤·ARIA/키보드 회귀 시험.
- 신규 8/8, 프런트 전체 93/93 PASS. JS 문법·백엔드 TS build·HTML 구조/ID/CSP/Git 검사 PASS.
- 실제 화면 렌더링/터치/스크린리더 미실행; API·지갑/실거래 미연결, push·배포 없음.
- 다음 UX-HL-03-A2: 브라우저/모바일 준비 시 실제 스크롤·포커스 인수. UX-HL-01-C/UX-HL-02-B2-B 역시 브라우저 가용 시 진행. 별도 인증 API가 준비되기 전까지 실계정 기록 표시 금지.

## 2026-10-25 UX-HL-03-B1 — 로컬 완료

- frontend/account-table-scroll-hint.mjs: 선택된 탭의 실제 테이블이 보이는 모바일 오버플로 상황에만 안내·키보드 스크롤 진입점/aria-describedby 표시. 관찰자 및 탭 전환 갱신, 리소스 정리 함수 제공.
- frontend/trade.html: 기존 다섯 account panel 각각에 hidden 기본 상태의 명확한 가로 스크롤 안내 추가. 기존 테이블 tbody는 모두 빈 상태.
- frontend/account-tabs.js: 기존 자동 탭 가로 위치 이동 로직과 중복하지 않고 상태 활성화 후 힌트만 재평가.
- frontend/trade.css: 안내/포커스 스타일과 hidden 우선 처리. account-tabs.test.mjs, account-tab-visibility.test.mjs 기존 가짜 DOM 확장.
- frontend/account-table-scroll-hint.test.mjs 신규 10건 포함 전체 프런트 103/103 PASS. JS/TS/HTML/CSP/git 검증 PASS.
- 실제 공개 웹사이트는 미배포, 실제 데이터/지갑/API 연동 없음. 미연결 상태에서는 힌트 표시되지 않음. 브라우저 시각/스크린리더 시험 미실행.
- 다음: UX-HL-03-B2 및 A2의 실제 브라우저/키보드/터치 인수(실행 환경 확보 시); 환경 미가용이면 ROADMAP의 독립 미완료 UX 중 안전하게 검증 가능한 작업을 새 TASK로 선정.

## 2026-10-25 UX-HL-03-C1 — 로컬 완료

- frontend/account-tabs-renderer.mjs: 잘못된 ready 계정 행이나 읽기 예외를 UI 중단 대신 명시적인 error 상태로 fail-closed 전환. 기존 또는 부분 행 노출 방지, 정상 스냅샷 렌더링 회복 가능.
- frontend/account-tabs-renderer.test.mjs: null/primitive 및 예외를 던지는 계정 행의 오류 상태/행 삭제·복구 회귀 2건 추가, 수정 전 실패 확인.
- 전체 프런트 170/170 PASS 및 JS 문법·TypeScript 빌드·HTML/CSP·git diff PASS. 실제 Chromium C2 시각/접근성 인수 미완료.
- 정적 미연결 계정 탭과 검증된 조회 계약/인증 선행 요구, 실거래·지갑·실체인·운영 DB·원격 push/배포 차단은 변경 없음.

## 2026-10-25 UX-HL-03-D1 — 계정 조회 예외 시 전체 상태 정합성 로컬 완료

- frontend/account-tabs-renderer.mjs: 5개 계정 탭에 대해 우선 조회 결과를 모두 확보한 다음 DOM 렌더. 탭별 조회 도중 예외가 나면 이전 행을 전부 지우고 허용된 조회 경로는 error, 미연결 기본 경로는 disconnected 표시.
- frontend/account-tabs-renderer.test.mjs: 전체 이전 ready 행 표시 후 중간 get 예외, 기본 정적 경로의 get 예외라는 신규 2건 검증(수정 전 FAIL). 기존 C1 비정상 행/정상 회복 테스트 유지.
- 전체 프런트 172/172 및 JavaScript 문법, backend TypeScript 빌드, HTML 구조/CSP/Git diff PASS.
- 실제 브라우저 D2 인수는 미완료. 공개 정적 데모에서는 계정 조회 비활성·실계정 미연결, M5~M9 선행 요구 및 원격 Push·배포·실거래 제한 불변.

## 2026-10-25 UX-HL-03-E1 — 계정 스냅샷 getter 오류 안전 처리 로컬 완료

- frontend/account-tabs-renderer.mjs: snapshot.state/records 읽기 자체가 예외를 던져도 UI 중단 대신 오류 표시, 이전 계정 행 삭제, 테이블 숨김. 정상 스냅샷은 후속 재렌더링 가능.
- frontend/account-tabs-renderer.test.mjs: 상태 getter 예외·records getter 예외와 오류 후 회복을 신규 회귀 2건으로 검증(수정 전 FAIL).
- 프런트 전체 174/174 PASS, JavaScript 문법·TypeScript 빌드·HTML/CSP/git diff PASS. 인증된 조회와 정적 미연결 UI 안전 경계 유지.
- 실브라우저 E2 인수 미완료. 원격 push·배포, 실제 주문/실체인, 지갑·운영 DB/권한 우회 미실행.

## 2026-10-25 UX-HL-03-F1 — 미검증 공급자 조회 차단 로컬 완료

- frontend/account-tabs-renderer.mjs: allowValidatedRecords 미허용 시 coordinator.get 호출을 전혀 하지 않고 전 탭 disconnected 표시·이전 계정 행 삭제.
- frontend/account-tabs-renderer.test.mjs: 공급자 호출이 금지된 기본 경로와 이전 verified ready 기록 뒤 허용 철회 시 조회 0회·전 탭 비노출을 검증하는 신규 회귀 2건(수정 전 FAIL).
- 프런트 전체 176/176 PASS 및 JS/TS/HTML/CSP/git diff PASS. 기존 검증된 스냅샷 표시·오류/복구 경로 보존.
- 실제 브라우저 F2 인수 미완료. 인증·지갑·실거래·운영 DB 및 Push/배포/안전 우회 변경 없음.

## 2026-10-25 UX-HL-03-G1 — 주문 상태·수량 계약 로컬 완료

- frontend/account-query-contract.mjs: FILLED 전체 체결 필수, OPEN 잔량 양수 필수. 기존 원자 수량·소유 계정/요청·체인·revision 검증 및 CANCELED 부분 체결 허용 유지.
- frontend/account-query-contract.test.mjs: 수정 전 FAIL이었던 상태-잔량 모순 2건을 회귀로 추가. 완전 FILLED, 부분 CANCELED, 잔량이 남은 OPEN을 정상 수락하는 대조군 포함.
- 전체 프런트 178/178 PASS, JS 문법·TypeScript build·HTML 구조·CSP·git diff 검사 PASS. UI는 여전히 정적 account unavailable; 실제 서버 연결·주문 상태 동기화 미수행.
- UX-HL-03-G2는 신뢰 가능한 계정 API 및 안전한 브라우저 환경 인수 필요. M5~M9 백엔드 상태·Push/배포·실거래/권한 게이트 불변.

## 2026-10-25 UX-HL-03-H1 — 동일 revision 상충 스냅샷 방지 로컬 완료

- frontend/account-query-contract.mjs: 탭별 성공 기록 표현을 revision과 함께 보관하여 동일 revision 다른 내용은 error/빈 기록, 동일 내용은 멱등 수락. 더 높은 revision/세션 교체는 기존 동작 유지.
- frontend/account-query-contract.test.mjs: 같은 revision의 주문 ID 충돌, empty→nonempty 계정 기록 충돌 및 재조회 멱등·상위 revision 회복을 검증하는 신규 2건(수정 전 FAIL).
- 전체 프런트 180/180 PASS, JS/TypeScript/HTML/CSP/Git diff PASS. 정적 데모·계정 미연결 정책 유지.
- H2 신뢰된 서버 revision·실브라우저 인수 미완료. M5~M9 백엔드/지갑·실거래/DB·push/배포 제한 변경 없음.

## 2026-10-25 UX-HL-03-I1 — 계정 레코드 필드 캡처 및 검증 원자성 로컬 완료

- frontend/account-query-contract.mjs: validateRecord에서 제공 레코드 필드 각각을 한 번만 읽어 일반 객체로 복사한 후 검증 및 immutable normalized record 보관. 변경하는 getter로 유효성 검사와 저장 값이 달라지던 오류 제거.
- frontend/account-query-contract.test.mjs: 수량 필드와 ID가 getter 재읽기에서 바뀌는 신규 2건 회귀(수정 전 FAIL). 출력이 검증된 값이며 원본 getter 호출이 1회임을 확인.
- 프런트 전체 182/182 PASS, JS 문법·TypeScript build·HTML 구조/CSP/Git diff 검사 PASS. 인증된 계정 API/실거래/UI 연결은 하지 않음.
- I2 인증 API 및 Chromium 모바일·키보드·스크린리더 실 인수 미완료. M5~M9 백엔드·실체인·운영 DB·원격 push·배포 승인 게이트 불변.

## 2026-10-25 UX-HL-03-J1 — envelope 필드 1회 캡처 후 검증 로컬 완료

- frontend/account-query-contract.mjs: 정확한 envelope key 검사 후 7개 속성을 1회 캡처해 원본을 재읽지 않고 revision·records 상한·ID/수량·계정 소유 정보 검증/출력에 동일 값 사용.
- frontend/account-query-contract.test.mjs: 변하는 revision getter의 -1 저장 문제와 변하는 records getter의 101행 제한 우회 문제를 수정 전 FAIL 회귀 2건으로 확인하고 차단.
- frontend 전체 184/184 PASS, JavaScript 문법·TypeScript 빌드·HTML/CSP·Git diff 검사 PASS. 오프라인 MOCK·계정 데이터 unavailable 상태 유지.
- 실 브라우저 J2 및 신뢰된 계정 API 인수는 미완료. M5~M9 backend/지갑·실체인·운영 DB·push/배포 게이트 불변.

## 2026-10-25 UX-HL-03-K1 — 계정 조회 세션 출처 단일 캡처 로컬 완료

- frontend/account-query-contract.mjs: context.source를 검사하고 재읽어서 다른 출처로 바뀔 수 있던 검증값/보관값 불일치를 제거. 세션 출처를 1회 캡처 후 그 값만 허용 목록 검사 및 보관에 사용.
- frontend/account-query-contract.test.mjs: 변경 getter의 검증 후 미승인 출처 보관·forged 응답 수용을 재현한 회귀 2건(수정 전 FAIL). 확인된 승인 source의 보존 및 1회 읽기 검사.
- 프런트 전체 186/186 PASS 및 JS/TS/HTML/CSP/git diff 검증. 실계정/지갑/API 및 주문 실행은 여전히 비활성.
- 브라우저 K2/인증 계정 API 실 인수 미완료. M5~M9·DB/실거래·Sepolia 트랜잭션·원격 push/배포 제한 불변.
