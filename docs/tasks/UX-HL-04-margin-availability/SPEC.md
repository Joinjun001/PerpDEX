# UX-HL-04-B1 — Account Margin의 명시적 미연결 표시

## 목적
- 주문 티켓에서 Available Margin, Reserved Margin, Position Margin을 각각 독립적인 계정 지표로 제공한다.
- 지갑 인증 및 계정/증거금 조회 API가 연결되지 않은 동안 값을 0 또는 임의 수치로 제공하지 않고 — 미연결로 표시한다.
- 기존 Indicative margin은 수량·가격·레버리지 기반 MOCK 참고 계산이며 실제 사용 가능 증거금과 다름을 밝힌다.

## 구현 범위
- 주문 폼 내부 Account Margin 영역, UNAVAILABLE 출처 배지, dl/dt/dd 세 행, 화면·보조공학에 연결된 한국어 설명.
- 가변 폭의 좁은 모바일 주문 티켓에서도 읽기 쉬운 단일 행/1열 상태 UI.
- 기존 Reduce Only 비활성·Market/Limit, Long/Short 및 주문 검토 기능 유지.

## 비범위
- 실제 계정 자산, 예약/유지/포지션 증거금 계산, 서버 인증, API·지갑·서명·주문·온체인 트랜잭션.
- 승인된 계정/포지션 조회 경계가 없으므로 실제 자금 정보 기능 활성화 불가.
- 실제 브라우저·스크린리더 인수는 Linux 샌드박스 제약으로 별도 미완료.
