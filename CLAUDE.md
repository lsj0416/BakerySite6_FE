# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code(claude.ai/code)에게 가이드를 제공합니다.

## 프로젝트 상태 (2026-08-25)

인증(이메일/구글 로그인·회원가입·토큰 재발급·로그아웃), 일반상품·드롭 카탈로그·검색·추천, 드롭 구매(입장 확정→재고 선점→주문→결제/취소), 일반상품 구매(장바구니 담기→주문→결제, 바로구매), 주문 목록/상세/취소/판매자 항목별 구매확정, 예치금 충전, 판매자 신청·승인·상품/드롭 CRUD·판매내역·정산, 관리자 승인·정산 화면이 실제 백엔드 계약과 맞물려 동작함. 정확한 완료/미완료 목록과 남은 제약은 `ROADMAP.md`의 "현재 상태" 절을 기준으로 삼을 것 — 여기서 완료된 것으로 과장해서 서술하지 않는다.

**앞으로의 작업은 `ROADMAP.md`를 기준 문서로 진행한다.** 새 세션을 시작할 때 `ROADMAP.md`부터 읽을 것.

```
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

### Node.js 버전

- 최소 지원 버전: Node.js `20.9.0`(Next.js 16 요구사항, `package.json`의 `engines.node`에 반영됨)
- 검증 환경: Node.js `24.14.1` / npm `11.11.0`
- 특정 npm 버전은 강제하지 않음. 가능하면 Node.js LTS 버전 사용을 권장.

테스트 러너는 아직 없음 — 추가되면 이 섹션에 채워 넣을 것.

`tsconfig.json`/`eslint.config.mjs`는 `docs/DarkArtisanBakeryDesign`(초기 이식 원본, 별도 Vite 프로젝트)을 타입체크·린트 대상에서 제외하도록 설정돼 있음 — 그 디렉터리는 참고용일 뿐 이 Next.js 앱의 일부가 아님.

## 이 레포가 뭔지

OpenBake(베이커리 "드롭"(한정판매) 쇼핑몰) 모바일 웹 프론트엔드(Next.js, App Router).

백엔드는 **별도 git 레포**인 `../beadv7_7_BakerySite6_BE`(형제 디렉터리)에 있는 Spring Boot 멀티모듈(root/member-service/payment-service/api-gateway/ai-service)입니다. **기본적으로 이 레포는 백엔드 코드를 건드리지 않습니다.** 프론트가 실제로 필요로 하는 동작(예: 게스트 브라우징을 위한 보안 정책 완화)이 백엔드 변경 없이는 불가능할 때만, 사용자의 명시적 승인을 받고 최소 범위로만 백엔드 레포를 수정합니다 — 실제로 이번 세션에서 CORS 설정, 게이트웨이 라우팅/보안 정책을 그렇게 수정한 사례가 있습니다.

**프론트는 API Gateway 단일 진입점(`NEXT_PUBLIC_API_BASE_URL`, 로컬 기본값 `http://localhost:8089`)으로만 통신합니다.** root/member-service/payment-service 개별 포트로 직접 호출하지 않습니다 — 각 서비스는 게이트웨이가 JWT를 검증하고 주입하는 `X-Openbake-Member-Id`/`X-Openbake-Member-Role`/`X-Openbake-Auth-Source` 내부 헤더만 신뢰하므로, 게이트웨이를 거치지 않은 요청은 보호 API가 전부 401이 납니다. 로컬에서 백엔드 전체(root/member/payment/gateway)를 띄우려면 백엔드 레포의 `run-all.sh`를 사용할 것(Docker로 DB/Redis만 띄운 뒤 4개 서비스를 순차적으로 health 확인하며 기동, foreground 실행기이므로 Ctrl+C로 종료).

## 확정된 아키텍처 결정

- shadcn/ui 컴포넌트는 처음부터 전부 설치하지 않고, 실제로 필요해질 때마다 `npx shadcn add <component>`로 하나씩 추가.
- 하단 탭바가 없는 주문 상세류 화면도 탭바 있는 화면과 *같은* 라우트 그룹에 둠 — 별도 URL 프리픽스가 아니라 공통 레이아웃 안에서 `usePathname()`으로 탭바를 숨기는 방식.
- 인증 가드는 `middleware.ts`가 아니라 클라이언트 레이아웃 가드(토큰이 `localStorage`에 있어서 Edge 미들웨어가 읽을 수 없음). `(shop)`/`admin`/`order`/`wallet`/`seller` 레이아웃 각각에 동일 패턴(`useAuth()` + `useEffect` 리다이렉트)이 적용돼 있음 — 아직 공용 훅으로 추출되지는 않음.
- `(shop)/layout.tsx`는 `/products/*`, `/drops/*` 경로만 미인증 사용자에게 예외적으로 허용(게스트 상품/드롭 상세 조회) — 그 외 라우트는 로그인 필요.
- 서버 상태 관리는 TanStack Query(대기열 순번, 충전 상태 등 폴링이 필요한 화면이 여럿 있음).

## 참고 문서 (`docs/`)

백엔드 레포의 `docs/`에서 복사해온 것들입니다(그쪽은 `.gitignore`로 제외돼 있어서, 여기가 유일하게 git으로 추적되는 위치). 복사 시점까지는 실제 백엔드 코드와 대조 검증된 문서들이지만, **백엔드가 바뀌면 백엔드 레포에서 다시 복사해 동기화해야 함**(시간이 지나면 어긋날 수 있음 — 실제로 이번 세션에서 여러 곳이 문서와 어긋난 채로 발견됐다, 아래 참고).

- `*-api.md`(member-auth, seller, cart, order, drop, payment, settlement) — 도메인별 엔드포인트/요청/응답/에러코드 레퍼런스. API가 문서대로 동작할 거라고 가정하지 말고, 의심되면 백엔드 실제 Controller/DTO/Service 소스를 직접 확인할 것.
- `enum-reference.md` — 백엔드 enum 값 전체, 그리고 도메인 간 "이름은 같은데 값이 다른" 함정 표.
- `frontend-migration-plan.md` — 초기 Figma 프로토타입 → Next.js 이식 당시(M0~M6)의 라우팅/API 클라이언트 설계 기록. 이식은 오래전에 끝났고 현재 작업 우선순위는 `ROADMAP.md`가 기준이지만, 그 시절 확정된 위 "아키텍처 결정" 절의 배경 맥락으로는 여전히 유효.

## 코드 작성 전에 알아둘 만한 API 연동 함정

- **모든 API 응답은 하나의 envelope 형태**: 성공 시 `{success, data}`, 실패 시 `{success:false, error:{code, message}}`. 에러 코드는 도메인별 prefix(`ME`, `CA`, `OR`, `DR`, `P`, `SE`, `ST`, 공통은 `C001`/`C003`). 단 `GET /drops/{dropId}/info`는 예외적으로 이 래퍼 없이 데이터가 최상위로 옴.
- **주문은 2단계**: `POST /orders`(주문서 생성, PENDING — 가격/재고는 여기서 안 깎임)와 `POST /orders/{id}/pay`(실제 결제, 예치금 차감+재고 확정)가 분리돼 있음. `OrderCreateRequest`는 `cartItemIds`(장바구니 경로) / `productId`+`quantity`(바로구매) / `dropId`(드롭) 셋 중 정확히 하나만 보냄(`lib/api/order.ts` 타입 참고). 회원당 진행 중 주문은 1건 제한(초과 시 `OR006` — `GET /orders/pending`으로 이어서 진행할지 확인).
- **주문 확정은 항목(orderItem) 단위**: 주문 전체 상태(`OrderState`: `PENDING/PAID/CANCELED/FAILED/EXPIRED`)에 `CONFIRMED`는 없음. 구매확정은 `PATCH /orders/items/{orderItemId}/confirm`(판매자가 픽업 확인 시 호출)이고, 주문은 확정 이후에도 `PAID`를 유지한다. 항목이 하나라도 확정됐으면 주문 취소 불가(`OR002`).
- **주문 목록 필터는 `PAID`/`CANCELED`만 허용**(`OR008`) — `PENDING`은 별도 화면(`GET /orders/pending`), `FAILED`/`EXPIRED`는 "주문한 적 없는 것"으로 취급해 목록에 노출 안 함. 목록 응답(`OrderSummaryResponse`)은 항목이 여럿이면 대표 상품명 + 나머지 건수로 줄인 요약이지 배열이 아님(상세 조회만 `items[]` 배열).
- **드롭 구매는 카트를 거치지 않음**: `lock-start`(재고 선점) 이후 곧바로 `POST /orders {dropId}`로 주문서를 만듦. 드롭 전용 카트 API(`POST /api/v1/cart` 등)는 백엔드에서 삭제됐음(404) — `lib/api/cart.ts`는 이제 일반상품 다중 아이템 장바구니(`/api/v1/cart/items`)만 다룸.
- **비회원(게스트) 접근 가능 API는 제한적**: `GET /products/{id}`, `GET /drops/{id}/info`(상세), `GET /products/product-list`, `GET /products/autocomplete`, `GET /drops/upcoming`(목록·검색·자동완성)는 optional-auth로 열려 있어 Authorization 헤더 없이도 200이 옴. **추천(`GET /recommendations`)은 개인화가 본질이라 의도적으로 로그인 필수로 남겨둠** — 게스트 화면에서는 이 쿼리 자체를 `enabled: isAuthenticated`로 막아야 함(안 그러면 401 요청이 그대로 나감).
- 백엔드에 wishlist(찜) API 자체가 없음 — `lib/wishlist/wishlist-storage.ts`로 `localStorage`에만 저장(의도된 설계, 기기 간 동기화 안 됨).
- 백엔드에 드롭 참여 이력(`GET /drops/history`) API도 없음.
- 클라이언트발 `Idempotency-Key` HTTP 헤더 계약 자체가 없음(전부 서버가 자체 생성하는 바디 필드) — 프론트가 이 헤더를 만들어 보낼 필요/방법이 없음.
- 주문 취소 시 드롭 마감 이후에도 취소가 성공하는 등 일부 백엔드 검증 공백이 남아있음 — `docs/order-api.md`의 ⚠️ 표시 문단 참고.
