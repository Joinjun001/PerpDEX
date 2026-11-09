# UX-HL-06 — F3a 로컬 구현·검증 증거 및 릴리스 게이트 매트릭스

- 작성/검증일: 2026-11-10
- 기준: 로컬 main 커밋 `4f082d8`, 시작 작업 트리 clean, `main...origin/main [ahead 9]`
- 범위: `/shared/PerpDEX` 내 정적 Simulation Preview 프런트엔드와 현재 UX-HL-06 변경만
- **판정: F3a 증거 감사 완료 / UX-HL-06 전체 인수 미완료 / 실브라우저 인수 미완료 / 실거래·Sepolia 릴리스 미승인**
- 아래 PASS는 코드·테스트·가상 DOM·정적 파일 검사에 한정되며, 픽셀 배치·사용자 브라우저·스크린리더·거래 체결을 입증하지 않습니다.

## 1. 기능별 구현·검증 매트릭스

| 범위 | 추적 가능한 커밋 | 실제 구현 근거 | 대표 회귀 근거 | 로컬 판정 | 남은 인수 |
|---|---|---|---|---|---|
| A1/A2 — 3열+계정 레이아웃·시장 헤더 | `3446d6f` | `frontend/trade.html`, `frontend/trade.css`, `frontend/main.js` | `frontend/ux-hl-06-layout.test.mjs`, `frontend/mobile-portfolio-link.test.mjs`, `frontend/hyperliquid-terminal.test.mjs` | 정적 HTML/CSS·모의 이벤트 검증 | **A3** 실제 해상도/확대/오버플로 및 포커스·CTA 가시성 |
| B1 — 생성 가격 Line/Sample OHLC | `413e5b5` | `frontend/sample-candles.mjs`, `frontend/preview-model.mjs`, `frontend/main.js` | `frontend/sample-candles.test.mjs`, `frontend/order-interactions.test.mjs`, `frontend/chart-sample-accessibility.test.mjs` | 고정 64개 샘플 및 4/8 그룹 계산·모의 토글 검증 | 실제 브라우저 SVG·확대 표시; **B2 실제 OHLCV/Volume 출처 보류** |
| C1 — Book/Trades 탭·모바일 접기 | `309d9f1` | `frontend/market-depth-tabs.js`, `frontend/mobile-market-depth.js`, `frontend/main.js` | `frontend/market-depth-tabs.test.mjs`, `frontend/mobile-market-depth.test.mjs`, `frontend/order-interactions.test.mjs` | 오프라인 ARIA 탭·로빙 포커스·무JS 표시·시장 변경 계산 검증 | 실제 키보드 포커스·보조공학·모바일 접기 (**C2b/F2b**) |
| C2a — 호가 숫자·누적 깊이·스프레드 | `709ddff` | `frontend/trade.css`, `frontend/trade.html`, `frontend/main.js` | `frontend/ux-hl-06-depth-visual.test.mjs`, `frontend/order-interactions.test.mjs` | 3열 숫자·합성 깊이·스프레드 단위/정적 대비 검사 | **C2b** 실제 폭·가독성·클리핑·스크린리더 인수 |
| D1 — 주문 Preview 레일 | `09b1eba` | `frontend/trade.html`, `frontend/trade.css`, `frontend/order-review.mjs` | `frontend/ux-hl-06-order-rail.test.mjs`, `frontend/order-interactions.test.mjs` | Side/Type/Qty/Limit/Leverage/CTA/Review 가상 이벤트 및 정적 순서 검증 | 실제 폼·검토 포커스 및 200% 확대 인수 (**F2b**) |
| D2 — 계정/위험 미연결·Limit 출처 | `aa4df30` | `frontend/main.js`, `frontend/order-review.mjs`, `frontend/trade.html` | `frontend/ux-hl-06-risk-source.test.mjs`, `frontend/order-review.test.mjs` | MOCK_SAMPLE / MOCK_DEFAULT / USER_INPUT 및 UNAVAILABLE 상태·모의 증거금 계산 검증 | 실제 도움말/상태 읽기; 계정·위험 데이터의 신뢰된 공급자 계약 없음 |
| E1 — 기존 계정 5탭·상태·표 | `bdbe07b` | `frontend/account-tabs.js`, `frontend/account-tabs-renderer.mjs`, `frontend/account-table-scroll-hint.mjs` | `frontend/ux-hl-06-account-workspace.test.mjs`, `frontend/account-tabs-renderer.test.mjs`, `frontend/account-table-scroll-hint.test.mjs` | 인증 없는 기본 상태·5개 빈 tbody/hidden 표, 분리된 조회 상태, 가상 스크롤 검사 | 실제 모바일 표 방향·스크린리더/키보드 (**F2b**), **E2 새 Balances 탭 보류** |
| F2a — 오프라인 통합 감사·출처 검토 결함 수정 | `4f082d8` | `frontend/main.js`, `frontend/trade.html` | `frontend/ux-hl-06-f2a-offline-audit.test.mjs`, `frontend/order-interactions.test.mjs` | 동일 숫자의 Limit 출처 변경 시 기존 검토 무효화 및 차트/호가/시장 교차 이벤트 검증 | 실제 브라우저 **F2b**, 전체 F3 최종 판정 미완료 |

**추적 방식:** 각 행의 커밋은 `git show --stat <hash>`로 확인한 UX-HL-06 로컬 변경이며, 코드 파일과 테스트는 기준 로컬 HEAD에서 존재를 확인했습니다. 단일 테스트가 한 행의 모든 인수 기준을 증명한다는 뜻은 아닙니다. 현재 전체 프런트엔드 실행 결과는 **261/261 PASS**입니다.

## 2. 데이터 출처·지원 범위 판정

| 화면/계산 | 출처/상태 | 실제 검증 범위 | 금지된 오인·미완료 선행 |
|---|---|---|---|
| BTC/ETH/SOL 기준 가격·샘플 변화·차트 | `MOCK_SAMPLE` | `preview-model.mjs`의 생성 가격, Line 및 그룹 OHLC, 화면 모의 이벤트 | 실시간 거래소 가격·타임스탬프·거래량·시계열 데이터라고 표시 불가 |
| 가상 Book/Trades 및 합성 Spread | `MOCK_SAMPLE` | 7 매도/7 매수·9 가상 체결 예시, 누적 깊이/표시 단위·ARIA 테스트 | 실제 주문장/실체결/거래 상대방 없음 |
| Market 주문 미리보기 참조 가격 | `MOCK_SAMPLE` | 참고 금액·수량·명목가치·참고 증거금 계산 | 체결 보장·시장가 집행·유효 주문가능 잔고 아님 |
| Limit 초기 자동 입력 가격 | `MOCK_DEFAULT` | 가상 기준가 초기화, 시장 변경 시 재설정과 주문 검토 출처 | 사용자 직접 입력 가격 또는 실제 지정가 호가로 오인 불가 |
| Limit 직접 수정 가격 | `USER_INPUT` | 실제 편집 이벤트 후 출처/검토 결과 동기화, 동등 수치라도 출처 변경 시 구 검토 무효화 | 사용자가 입력했다는 사실만 의미하며 오라클·실제 시장 가격 검증 아님 |
| Available/Reserved/Position Margin | `UNAVAILABLE` | 기본 표시 ‘— 미연결’, 인증 전 데이터를 표에 노출하지 않는 정적/가상 DOM 게이트 | 실제 자산·잔고·계정 주문 가능액 조회가 아님 |
| 수수료·펀딩 지급액·청산가 | `UNAVAILABLE` 또는 `Not configured` | 제공하지 않음을 명시한 UI·disabled 정책 검사 | 미산출을 0으로 표시하거나 가짜 청산가를 계산하지 않음 |
| Account Activity 5개 이력 탭 | `disconnected` 기본, 조회 성공 시에만 `empty` 가능 | 기본 5개 표 hidden/빈 tbody, 준비된 오프라인 renderer의 검증 플래그 검사 | 미연결을 0건으로 오인하거나 실제 체결 기록을 생성하지 않음 |
| 지갑·실제 주문·RPC·실시간 연결 | **미연결/미지원** | UI 지갑 버튼/Reduce Only 등 disabled, CSP `connect-src 'none'` / `form-action 'none'` | 실제 서명·주문·체결·입금·출금·외부 RPC 연결 없음 |

`VERIFIED_TESTNET`은 후속 신뢰된 계정 데이터 계약의 가능한 출처 값이지 **현재 공개 정적 UI의 실제 가격·계정 공급자 상태가 아닙니다**. 값을 표시할 수 있는 테스트용 렌더러 경로와 실제 인증·제공자 신뢰 검증은 구분해야 합니다.

## 3. 테스트 증거와 범위의 정확한 경계

- 실행: `node --test frontend/*.test.mjs` → **261/261 PASS**, 실패 0개, 기준 커밋 `4f082d8`. `frontend` 하위 `*.test.mjs` 27개를 검사.
- JS 문법: `frontend/*.js` 및 `frontend/*.mjs`의 `node --check`는 별도로 실행하여 결과 기록. 빌드/브라우저 실행을 뜻하지 않음.
- HTML: Python `HTMLParser`로 문서 파싱, 고유 DOM ID, 5개 초기 숨김/비어 있는 계정 테이블, 필요한 식별자 및 CSP 출처 제한을 점검.
- Git: `git diff --check`, 변경 파일·작업 트리·로컬 커밋 기록 점검. 원격 상태 업데이트/배포 없음.
- 접근성: ARIA 속성·가상 DOM 키 이벤트·가상 focus·CSS 정적 검사만 확인. **실제 키보드 기본 동작, 스크린리더 음성 출력, 화면 탭 순서, 확대율·픽셀 가독성은 확인하지 못함**.
- 브라우저: Chromium Headless Shell을 보안 샌드박스 활성 상태로 실행했으나 `Chromium sandboxing failed!`, 테스트 페이지 렌더링 전에 종료. 브라우저의 캡처, 자동 탐색, 스크린리더, 실제 CSS 박스/수평 오버플로 증거 없음. 보안 옵션 우회는 수행하지 않음.

## 4. UX-HL-06 미완료 인수와 재개 조건

| 인수 ID | 필요한 실증 증거 | 현 상태 | 재개 조건 |
|---|---|---|---|
| A3 | 1536×960, 1280×800, 768×1024, 390×844, 200% 확대: 차트/호가/주문/계정의 실제 박스·페이지 가로 오버플로·CTA 가시성 | **미완료** | 샌드박스가 정상 작동하는 브라우저 환경에서 뷰포트·확대별 실제 화면 확인 |
| C2b | 호가 숫자 잘림·스크롤·중간열 스프레드·모바일 접기·Book/Trades 패널의 실제 포커스 | **미완료** | 위 환경에서 스크린샷 및 키보드/보조공학 확인 |
| F1 | 해상도별 캡처·시각 비교 및 겹침/오버플로 결함 조치 | **미완료** | Chromium 등 안전한 실제 브라우저 실행 및 캡처 증거 |
| F2b | 시장 선택, Line/OHLC, Book/Trades, 모바일 토글, Preview/Escape/오류 포커스, 5개 계정 탭의 실제 키보드·스크린리더·모바일 검수 | **미완료** | 실제 사용자 에이전트·보조공학 및 검증 로그 확보 |
| F3 최종 | A3/C2b/F1/F2b 결과와 남은 결함·승인/배포 금지 상태의 통합 판정 | **미완료** | 모든 필수 브라우저 인수 근거가 확보된 후 명시적 판정. F3a 문서 정리는 최종 F3를 대체하지 않음 |

**판정 규칙:** 브라우저 샌드박스 실패가 반복되는 상황에서 F3a·오프라인 테스트만으로 UX-HL-06 `DONE`, 브라우저 `PASS`, 테스트넷 `Release-ready`라고 기록하지 않습니다.

## 5. 실거래·테스트넷 릴리스 차단 조건

아래는 UX-HL-06의 화면 코드와 별개로 `docs/releases/SEPOLIA-TESTNET-TRADING-MVP.md`와 `PROJECT_STATE.md`에서 확인한 작업 게이트입니다.

1. **M5:** 서명 주문/증거금/포지션 검증과 승인된 PostgreSQL 다중 세션·role·트리거 실제 인수 미완료. 로컬 모의 테스트를 실환경 정합성 증명으로 대체할 수 없음.
2. **M6·M7:** Funding과 청산/강제 위험 정책·원장/위험 처리 완성 및 안전 검증 필요.
3. **M8:** 선물 전용 담보 보관·잠금·청산/손익 정산과 인출 제한, 온체인·오프체인 원장 일치 확보 필요. 기존 단순 M1 Vault settle/withdraw를 재사용해 우회할 수 없음.
4. **M9:** Sepolia 지갑·체인/토큰 허용목록 검증, 승인된 테스트 토큰 입금/승인, HTTPS·DB·주문 서명/취소/nonce·오라클·정산, 두 지갑 입금부터 출금까지 E2E, 장애·재시작·중복 집행/권한 테스트, 테스트넷 공개 운영 승인 필요.
5. **UX 인수:** A3/C2b/F1/F2b 실제 브라우저 인수 아직 없음. 신뢰된 데이터 계약 없이 B2 실제 OHLCV/Volume·E2 Balances·실계정 기능을 활성화할 수 없음.
6. **작업 권한:** 원격 push·외부 배포·자격증명 사용·실제 RPC·트랜잭션 서명 및 브로드캐스트·운영 DB 변경 모두 이 자동 개발 작업의 권한 밖. 별도 승인 없이는 수행하지 않음.

정적 프런트엔드 데모의 로컬 구현·회귀 통과와 Sepolia 퍼프 DEX의 출시 승인은 **별도의 결정**입니다. 기존 웹 배포 내용이 이번 로컬 커밋을 반영했다는 근거도 없습니다.

## 6. 결론 및 후속

- **F3a 완료 범위:** 구현/테스트/미검증 항목과 릴리스 차단 조건을 로컬 근거로 대조·기록함.
- **UX-HL-06 전체 상태:** `In Progress`. A3/C2b/F1/F2b 실증 미완료, 최종 F3 통합 인수 보류.
- **현재 검증 가능한 독립 소스 결함:** 이번 감사에서 새 결함은 확인되지 않음. 불필요한 기능 추가/변경 없음.
- **후속 우선순위:** 안전한 브라우저 샌드박스에서 실제 A3/C2b/F1/F2b 검증 → 발견 결함만 수정·회귀 → 최종 F3 판정. 환경 제약이 계속된다면 별도 명시된 범위의 독립 작업만 수행하고 완료 상태를 확대 해석하지 않음.
