# M1-T1 QA

상태: PASS

| 검증 항목 | 결과 |
|---|---|
| 정상 입금 | PASS |
| 정상 출금 | PASS |
| 0 수량 입금/출금 거부 | PASS |
| 잔액 초과 출금 거부 | PASS |
| 다중 사용자 잔액 격리 | PASS |
| `totalLiability` 증가/감소 일치 | PASS |
| fee-on-transfer 비표준 입금 거부 | PASS |
| fuzz 기반 solvency 회귀 | PASS |
| 전체 Foundry 테스트 회귀 | PASS |

검증 명령:

```bash
cd contracts
forge fmt --check
forge build
forge test
```
