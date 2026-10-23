# M2-T4 RESULT

상태: In Progress — M2-T4-A 순수 매칭 코어 구현 완료, M2-T4-B DB/동시성 개발 대기

## 2026-10-24
- M2-T3의 로컬 테스트 및 재전송 멱등성 구현 완료 이후 시작 준비.
- 선행순위: M2-T4-A 순수 매칭 코어의 가격·시간 우선 동작과 부분 체결.
- 소스 변경 및 매칭 엔진 테스트는 다음 회차에서 구현한다.

## 2026-10-24 — M2-T4-A 가격·시간 우선 순수 매칭 엔진 구현

- 시작 상태: `main`, 미커밋 변경 없음, 기존 커밋 `d03cb08` 확인. PROJECT_STATE/ROADMAP/M2-T4 문서 및 주문 도메인 모델/SQL 스키마 확인.
- `backend/src/matching/engine.ts` 신규 구현:
  - 서버 부여 arrivalSequence에 따른 같은 가격 FIFO, 가격 우선 BUY/SELL 매칭, 메이커 체결가
  - 다른 시장·동일 side·미교차 주문·취소·만료·완전체결 주문 제외
  - BigInt 기반 가격 비교·부분 체결·상태 전이·원본 주문 불변성
  - 중복 ID/접수 순서, 잘못된 시각·상태·정밀 정수 값 검증
  - 반환 결과: fills/주문별 갱신된 filledQuantity·status/추가 체결량 및 잔량
- `backend/test/matching-engine.test.ts` 신규 14개 테스트: 매수·매도 호가 우선, 같은 가격 FIFO, 가격·시간 우선 순서, 무체결, 시장 분리, 취소/만료/완전체결 제외, 부분 체결, BigInt 높은 정밀도, 입력 불변/결정성, 중복 데이터 거부, invalid 값 거부, 120개 결정적 시드 기반 수량 합계 불변식.
- `npm run build` TypeScript 타입 검사 통과, 신규 테스트 `14 passed / 0 failed`. 전체 `npm test` **81 passed / 0 failed** (`--test-concurrency=1`).
- **미구현:** DB에 영속 순서 키 부여 및 원자적 체결/부분 체결 업데이트, 사용자별 자가체결 방지 정책, 실제 시장 API 연결, 정산 및 실서버 검증. 원격 Push·DB 마이그레이션·온체인 정산은 수행하지 않음.
