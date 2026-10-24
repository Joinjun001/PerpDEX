# M4-T4 TODO

- [x] 시작 Git/PROJECT_STATE/ROADMAP/M4-T3 TASK 문서 및 010·011·서비스 코드 확인
- [x] 사용자 승인 범위의 TCP 비청취 개발용 실제 PG15.19 Unix 소켓 서버 기동 및 독립 새 스키마 적용
- [x] 실 16-connection pool 동일 ID 12중1/서로 다른 경쟁 12중1 및 상호 독립 쌍 정상 동시 적용
- [x] PAIRED/UNPAIRED 최초 market insert 경합, stale counterpart version, OI 일관성
- [x] SELL 쪽 journal 실패 및 최종 영수증 실패 시 양측/OI 원자적 rollback·같은 거래 재시도
- [x] `pg_ctl restart`와 **별도 Node 프로세스**로 영속 OI/공통 receipt 및 비연속 replay 복구 검증
- [x] TypeScript build 및 전체 백엔드 `npm test` 검증
- [ ] M5-T1: 로컬 순수 IM/MM/Leverage/Equity 위험 엔진 및 `reduce-only` 후보 설계·구현
- [ ] 운영자 승인 뒤에만 실 collateral·거래 정책·스테이징/운영 DB/RPC/배포 연동
