# OpenBake FE

베이커리 "드롭"(한정판매) 쇼핑몰 모바일 웹 프론트엔드. Next.js(App Router) 기반.

백엔드는 별도 레포 [`beadv7_7_BakerySite6_BE`](../beadv7_7_BakerySite6_BE)(형제 디렉터리)에 있음.

## 문서

- `CLAUDE.md` — 아키텍처 결정, API 연동 함정, 참고 문서 안내
- `ROADMAP.md` — 현재 상태와 작업 우선순위(기준 문서)
- `docs/frontend-migration-plan.md` — 초기 Figma 프로토타입 → Next.js 이식 당시의 설계 기록(과거 맥락 참고용)
- `docs/DarkArtisanBakeryDesign/` — Figma에서 뽑은 인터랙티브 디자인 프로토타입 원본(이식 완료, 참고용으로만 남음)
- `docs/*-api.md` — 백엔드 API 명세(코드 기준 검증됨, 백엔드 레포에서 동기화)
- `docs/enum-reference.md` — 백엔드 상태값(enum) 참조표
- `docs/backend-api-requests.md` — 프론트 개발 중 필요한데 백엔드에 아직 없는 API 요청 목록

## 로컬 개발

백엔드가 먼저 떠 있어야 함. 프론트는 **API Gateway 하나로만** 통신하므로(개별 서비스 포트를 직접 호출하지 않음), 백엔드의 root/member-service/payment-service/api-gateway 4개가 모두 필요함.

`../beadv7_7_BakerySite6_BE`에서:

```bash
./run-all.sh   # Docker로 DB/Redis 기동 + root/member/payment/gateway를 순차 health-check하며 기동
```

foreground로 실행되는 통합 실행기이므로 그 터미널에 붙어 있어야 하며, 종료는 Ctrl+C. 게이트웨이가 `http://localhost:8089`에서 뜨면 준비 완료.

### Node.js 버전

- 최소 지원 버전: Node.js `20.9.0`(Next.js 16 요구사항, `package.json`의 `engines.node` 참고)
- 검증 환경: Node.js `24.14.1` / npm `11.11.0`
- 가능하면 Node.js LTS 버전 사용을 권장함

```bash
npm install
npm run dev
```

`.env.local`(값은 `.env.example` 참고, 실제 값은 커밋하지 말 것):

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API Gateway base URL. 로컬: `http://localhost:8089` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 백엔드가 ID 토큰 검증 시 audience로 대조하는 값과 반드시 일치해야 함(백엔드 `.env`의 `GOOGLE_CLIENT_ID` 참고). 비밀값은 아니지만(OAuth 프로토콜상 클라이언트 요청에 항상 포함됨) 값 자체는 백엔드 설정과 짝을 맞춰야 하므로 `.env.example`에는 비워둠 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss Payments 위젯 clientKey. 백엔드 `TOSS_SECRET_KEY`와 짝이 맞아야 하므로 `.env.example`에는 비워둠 |

```bash
cp .env.example .env.local
# 위 표를 참고해 .env.local 값을 채운 뒤 실행
```
