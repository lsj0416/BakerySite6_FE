# OpenBake FE

베이커리 "드롭"(한정판매) 쇼핑몰 모바일 웹 프론트엔드. Next.js(App Router) 기반.

백엔드는 별도 레포 [`beadv7_7_BakerySite6_BE`](../beadv7_7_BakerySite6_BE)(형제 디렉터리)에 있음.

## 문서

- `docs/frontend-migration-plan.md` — 디자인 프로토타입을 Next.js 프로덕션 프론트로 전환하는 계획 (마일스톤, 라우팅, API 연동 방식)
- `docs/DarkArtisanBakeryDesign/` — Figma에서 뽑은 인터랙티브 디자인 프로토타입 원본 (이식 대상)
- `docs/*-api.md` — 백엔드 API 명세 (코드 기준 검증됨, 백엔드 레포에서 동기화)
- `docs/enum-reference.md` — 백엔드 상태값(enum) 참조표
- `docs/backend-api-requests.md` — 프론트 개발 중 필요한데 백엔드에 아직 없는 API 요청 목록 (해결되면 해당 도메인 `*-api.md`로 정식 반영)

## 로컬 개발

백엔드가 먼저 떠 있어야 함 (`../beadv7_7_BakerySite6_BE`에서 `docker compose up -d` + `./gradlew bootRun`).

member-service/payment-service가 물리 분리되면서 백엔드가 3개 서비스로 나뉘었음(각각 8080/8081/8082 포트). 배포 환경은 nginx가 경로별로 알아서 라우팅하지만, 로컬은 nginx 없이 각 서비스 포트를 직접 호출하므로 프론트가 요청 경로에 따라 base URL을 나눠 쓴다(`lib/api/client.ts`의 `resolveBaseUrl`).

```bash
npm install
npm run dev
```

`.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_MEMBER_SERVICE_URL=http://localhost:8081
NEXT_PUBLIC_PAYMENT_SERVICE_URL=http://localhost:8082
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<백엔드 .env의 GOOGLE_CLIENT_ID와 동일한 값>
```

`NEXT_PUBLIC_GOOGLE_CLIENT_ID`는 백엔드가 ID 토큰 검증 시 audience로 대조하는 값과 반드시 일치해야 함(백엔드 `.env`의 `GOOGLE_CLIENT_ID` 참고). Client ID는 비밀값이 아니라 공개해도 되는 값(OAuth 프로토콜상 클라이언트 요청에 항상 포함됨).
