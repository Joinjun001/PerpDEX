# M4-T1 QA

상태: 신규 position engine 유닛 테스트 **19/19 통과**, 전체 백엔드 **203/203 통과 (실패 0개)**, TypeScript 빌드 통과.

## 검증된 로컬 불변식

- 기본 flat/롱·숏/평균가 가중 추가/부분·전부 종료/양방향 반전. 단방향 unsigned 비용 원가와 signed realized 손익의 정확한 정수 numerator.
- 올바른 Long/Short unrealized+realized 부호, 종료 시 0 원가, 반대 방향 전환 시 새 원가 재설정 및 누적 realized 보존.
- partial closing과 비정수 average price cost-원가 dust 보존 및 전체 최종 close 정확한 원가 소진. 100회 미세 실현손익이 누적 rounding 차이로 복원되는 테스트.
- 서버 신뢰 config/DRAFT·만료/chain·market·account·collateral/price source/revision/age/mark band 검사. 가격 tick·lot·nonce 외 고유 fill ID 형식, signed quantity/uint256 범위, unsigned cost 및 realized signed overflow 실패 안전.
- local version mismatch/직전 동일 fillId 방지. 비연속 replay는 본 단계 순수 엔진에서 탐지하지 못하는 사례를 재현하고 M4-T2 영속 UNIQUE/재생 방지의 필수 검증 조건으로 기록.
- 공개 주문 API/실증거금 원장/온체인 계약·실제 체결 변조 없음. 테스트 외 네트워크·DB/토큰 자산 접근도 없음. 수수료, 펀딩, 청산·보험·실시장 승인 및 영속 체결 중복 방지는 아직 미구현.

- `cd backend && npm run build`: 통과. `cd backend && npm test`: **203/203 passed, 0 failed** (기존 184 + 신규 19). `git diff --check`: 통과.
