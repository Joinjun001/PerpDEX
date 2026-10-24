# M5-T3-C3 — 서명 주문 이후 증거금/포지션 회계

## 분할 및 범위

- **C3-A (이번 회차)**: 정책값 없는 읽기 전용 계정별 signed 주문 OPEN/CANCELED/FILLED 책임·M3 RESERVED/POSITION·M4 포지션/표시손익 교차 대조. 어떠한 체결·입출금·PnL 반영도 하지 않고 실행 권한 반환 금지.
- **C3-B (다음 우선)**: 직접 SQL이 주문과 nonce를 함께 CANCELED로 바꾸고 RELEASE 기록을 누락해도 현 SQL 015~017에서 커밋되는 취소 무결성 결함을 해결. 취소 요청의 EIP-712 인증은 서비스에서 수행하며 DB에서는 불변 취소 영수증-주문-ID-M3 RELEASE 양쪽 분개와 RESERVED 잔고를 COMMIT 제약으로 검증해야 함. 기존 서명된 취소 API 호환 및 롤백 검증 필수.
- **C3-C (후속)**: 다중 OPEN 예약 / 부분 체결 / 남은 예약 책임. 기존 SQL 017의 FLAT·전량·최종 영수증 제약을 유지하고, 정책적 의미가 합의되기 전 별도 실행 활성화 금지.
- **C3-D (후속)**: 포지션 감소와 실현 손익 계산-회계 연결, fee/funding은 승인된 정책 수치가 정해지기 전 정산 금지. 계산만 필요한 경우 기존 M4 numerator 기반 표시는 지원.

## C3-A 불변식

- 동일 trusted market context 및 검증된 오라클; market OI row를 트랜잭션에서 잠금.
- signed 주문과 영속 nonce 상태/ID/만료시간, 최초 M3 RESERVE operation 및 2개 분개를 대조.
- OPEN → 총 IM 부채를 RESERVED bucket 잔액으로 커버해야 함.
- CANCELED → nonce CANCELED + 파생된 주문별 deterministic RELEASE 작업 ID, 금액, 경로, 양쪽 분개 모두 있어야 함.
- FILLED → nonce USED + terminal execution/preparation 영수증 1개, 해당 계정의 정확한 M3 ALLOCATE 기록 및 POSITION bucket의 커버 확인.
- M4 포지션과 실현·미실현 PnL 표시는 기존 신뢰된 position/mark 함수 사용. PnL을 M3 잔고로 자동 지급하지 않으며 fee/funding은 NOT_ACCOUNTED.
- 잔여 reserved/position 금액은 출금 가능액 아님. read-only 분석은 체결 시점 실행 가능성 증명이 아니고, 다른 PG 연결의 새로운 주문 insert를 직렬화한다고 주장하지 않음.

## 제약

SIMULATION_ONLY, 로컬 /shared/PerpDEX 한정. SQL 015~017, 기존 체결·입출금 경로 변경하지 않음. 운영 DB/실체인/실자금/push/배포 금지.
