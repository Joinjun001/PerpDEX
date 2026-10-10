# M1-T2 QA

상태: PASS

| 검증 항목 | 결과 |
|---|---|
| 정상 내부 정산 | PASS |
| 비권한 호출 거부 | PASS |
| 동일 `tradeId` replay 거부 | PASS |
| 잔액 부족 정산 거부 | PASS |
| 0 수량 거부 | PASS |
| zero-address participant 거부 | PASS |
| self-transfer 거부 | PASS |
| zero `tradeId` 거부 | PASS |
| 정산 전후 `totalLiability` 불변 | PASS |
| Vault 실제 토큰 보유량 불변 | PASS |
| fuzz 회귀 | PASS |
