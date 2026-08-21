

# 추천(Recommendation) + 검색(Search) 백엔드 연동 계획

작성일: 2026-08-21
선행 문서: `docs/ai/product-integration-plan.md`(판매자 등록), `docs/ai/product-catalog-sync-plan.md`(쇼핑객 카탈로그 노출)
상태: 계획만 확정, 구현 착수 전.

## Context

백엔드에 두 기능이 이미 완성돼 있다(`origin/develop`, 로컬엔 아직 fetch만 하고 미반영):

- **추천**: 별도 `ai-service`(포트 8083, `api-gateway`가 `/api/v1/recommendations/**`를 라우팅)가 회원 행동 로그(조회/장바구니/구매확정 — 전부 백엔드가 Kafka 이벤트로 자동 수집, **FE가 따로 계측할 것 없음**) 기반으로 PERSONALIZED→POPULAR→LATEST 3단계 폴백 추천을 계산해 `GET /api/v1/recommendations`로 제공.
- **검색**: 기존 `GET /api/v1/products/product-list?keyword=&category=`(FE가 이미 호출 중, 계약 불변)가 오늘 머지된 PR로 키워드 검색(BM25)+의미 검색(임베딩 kNN)을 RRF로 병합하는 하이브리드 검색으로 내부 고도화됨.

그런데 프론트는 둘 다 아직 가짜다:

- 홈 화면/드롭 상세의 "AI RECOMMEND" 섹션은 실제 추천 API가 아니라 `dropApi.getUpcomingDrops(30)`을 그대로 재활용한 것("추천 서비스 연결 전에는 가까운 드롭을 우선 보여줍니다" 주석이 그대로 남아있음).
- `/search`(`components/search-results.tsx`)는 백엔드 검색 API를 전혀 호출하지 않고, 드롭 30개만 가져와 이름/설명 부분일치로 클라이언트에서 필터링한다(일반상품은 검색 결과에 아예 안 나옴).

이번 작업은 이 두 가짜 구현을 실제 API로 교체한다.

## 변경 파일

### 1. `lib/api/recommendation.ts` (신규)

```ts
import { apiRequest } from "@/lib/api/client";
import type { ProductCategory } from "@/lib/api/product";

export type RecommendationStrategy = "PERSONALIZED" | "POPULAR" | "LATEST";
export type RecommendationReasonCode =
  | "SIMILAR_TO_VIEWED" | "SIMILAR_TO_CART" | "SIMILAR_TO_PURCHASED"
  | "PREFERRED_CATEGORY" | "POPULAR" | "LATEST";

export interface RecommendationItem {
  productId: number;
  name: string;
  imageUrl: string;
  price: number;
  category: ProductCategory;
  remainQuantity: number;
  reasonCode: RecommendationReasonCode;
}

export interface RecommendationResult {
  strategy: RecommendationStrategy;
  items: RecommendationItem[];
}

/**
 * GET /api/v1/recommendations?size=1~20(기본 10). 인증 필요(로그인 회원 ID로 개인화).
 * ai-service 장애 시 503 AI_RECOMMENDATION_UNAVAILABLE — apiRequest가 ApiException으로 던짐,
 * 호출부에서 반드시 isError를 부드럽게 처리할 것(추천은 "있으면 좋은" 섹션이라 에러를 크게
 * 노출하지 않는다). 응답엔 항상 GENERAL 타입 상품만 담긴다(드롭은 추천 후보에서 제외됨 — 백엔드
 * 설계, 버그 아님).
 */
export function getRecommendations(size?: number) {
  const query = size !== undefined ? `?size=${size}` : "";
  return apiRequest<RecommendationResult>(`/api/v1/recommendations${query}`);
}
```

원본 DTO(`ai-service`, `origin/develop`, `git show`로 직접 확인):

```java
// RecommendationController.java — GET /api/v1/recommendations?size=
public ApiResponse<RecommendationResult> recommendations(@RequestParam(required = false) Integer size)

// RecommendationResult.java
public record RecommendationResult(RecommendationStrategy strategy, List<Item> items) {
    public record Item(Long productId, String name, String imageUrl, int price,
                        String category, int remainQuantity, RecommendationReason reasonCode) {}
}
// RecommendationStrategy: PERSONALIZED, POPULAR, LATEST
// RecommendationReason: SIMILAR_TO_VIEWED, SIMILAR_TO_CART, SIMILAR_TO_PURCHASED,
//                        PREFERRED_CATEGORY, POPULAR, LATEST
// size 검증 실패(1~20 범위 밖) → 400 C001
// RecommendationUnavailableException → 503 AI_RECOMMENDATION_UNAVAILABLE
```

### 2. `lib/catalog.ts` — 추천 아이템 → `CatalogProduct` 변환 함수 추가

```ts
export function recommendationItemToCatalogProduct(item: RecommendationItem): CatalogProduct {
  return {
    id: item.productId,
    name: item.name,
    description: "", // 추천 응답엔 설명 필드가 없음 — ProductCard가 설명을 안 쓰므로 문제 없음
    imageUrl: productImageUrl(item.imageUrl),
    price: item.price,
    remainQuantity: item.remainQuantity,
    status: item.remainQuantity > 0 ? "ON_SALE" : "SOLD_OUT",
    category: item.category,
    href: `/products/${item.productId}`,
    kind: "GENERAL",
  };
}
```

`productImageUrl`은 `lib/api/product.ts`에서 이미 import해서 쓰고 있으니 재사용.

### 3. 홈 화면(`app/(shop)/page.tsx`) — "AI RECOMMEND" 섹션 교체

```ts
const recommendationsQuery = useQuery({
  queryKey: ["recommendations", 4],
  queryFn: () => recommendationApi.getRecommendations(4),
});
const recommendedProducts = useMemo(
  () => (recommendationsQuery.data?.items ?? []).map(recommendationItemToCatalogProduct),
  [recommendationsQuery.data],
);
```

기존 `dropsQuery.isLoading/isError`를 참조하던 부분(102~123행 부근)을 `recommendationsQuery`로, `products.slice(0,4)`를 `recommendedProducts`로 교체. 설명 문구도 "추천 서비스 연결 전에는..."에서 실제 상황에 맞는 문구로 변경. 503(`AI_RECOMMENDATION_UNAVAILABLE`)은 흔히 발생할 수 있는 정상적인 열화 상태이므로, 에러 문구를 "추천을 준비하고 있어요" 톤으로 부드럽게(기존 "불러오지 못했습니다"보다) — 다만 기존 재시도 버튼 패턴 자체는 그대로 재사용.

### 4. 드롭 상세(`app/(shop)/drops/[dropId]/drop-detail-view.tsx`) — 자체 "AI RECOMMEND" 블록 교체

105~115행 부근의 `recommendationsQuery`(현재 `getUpcomingDrops(30)` 재활용)를 `recommendationApi.getRecommendations(3)` 호출로 교체하고, `dropToCatalogProduct` 매핑을 `recommendationItemToCatalogProduct`로 바꾼다. `.filter(item => item.dropId !== dropId)`로 자기 자신을 빼던 로직은 필요 없어짐(추천 결과엔 애초에 일반상품만 나오므로 지금 보고 있는 드롭과 겹칠 일이 없음).

### 5. 일반상품 상세(`app/(shop)/products/[productId]/product-detail-view.tsx`) — 추천 섹션 신규 추가

지금은 추천 블록이 아예 없다. 드롭 상세와 동일한 패턴으로 "이런 상품은 어때요" 류 섹션을 하단에 추가(`getRecommendations(3~4)`, 현재 보고 있는 상품은 `productId` 기준으로 결과에서 제외). 이 페이지 진입 자체가 이미 `productApi.getGeneralProduct(productId)`를 호출하므로(백엔드가 이 호출을 조회 이벤트로 자동 기록), 별도 계측 코드는 필요 없다.

### 6. 검색 — `CatalogBrowser`에 흡수 (신규 검색 로직을 따로 만들지 않고 기존 컴포넌트 확장)

`components/catalog-browser.tsx`가 이미 DROP/GENERAL 전환, 카테고리 필터, 페이지네이션, 로딩/에러/빈 상태를 다 갖추고 있으므로, 검색은 이 컴포넌트에 `keyword` 필터를 얹는 방식으로 흡수한다(새 검색 결과 UI를 별도로 만들지 않음).

- `CatalogBrowser` props에 `keyword?: string` 추가.
- GENERAL 분기: `getGeneralProductList({ category: generalCategory, keyword, page: generalPage, size: 20 })` — `keyword`를 queryKey에도 포함. 이게 실제 하이브리드 검색을 타는 지점.
- DROP 분기: 드롭 도메인엔 검색 API가 없으므로, `keyword`가 있으면 기존 `lib/catalog.ts`의 `filterProducts()`(이미 있는 클라이언트 사이드 부분일치 유틸, 지금은 `search-results.tsx`에서만 쓰임)를 드롭 목록에 적용.
- `keyword`가 있을 때 상단 타이틀을 "'{keyword}' 검색 결과"류로 바꾸고, 빈 상태 문구도 검색 맥락에 맞게 분기.

`**app/(shop)/search/page.tsx**`: `[[ORCA_RICH_MD:c8dbb7aab0ae74e575b1d5a6a46d9c74:inline-html:%3CSearchResults%20initialQuery%3D%7Bquery%7D%20%2F%3E]]` 대신, 검색창 UI(입력 상태 + `/search?q=` 이동, 지금 `search-results.tsx` 상단에 있는 부분)만 남긴 얇은 컴포넌트 + `[[ORCA_RICH_MD:c8dbb7aab0ae74e575b1d5a6a46d9c74:inline-html:%3CCatalogBrowser%20keyword%3D%7Bquery%7D%20%2F%3E]]`로 교체. `components/search-results.tsx`의 데이터 페칭/필터링 로직(드롭 30개만 가져와 클라이언트 필터링하던 부분)은 삭제 — `CatalogBrowser`가 대신함.

**스코프 제외 (명시):** 자동완성/타이핑 중 제안 UI는 이번에 안 만든다 — 이 레포에 디바운스 유틸/패턴이 전혀 없어서(grep 확인 완료) 새로 만들어야 하는 별도 작업이고, 백엔드 `autocomplete` 엔드포인트도 Swagger 문서가 다른 API 설명이 잘못 붙어있는 상태(사소한 백엔드 문서 버그, 기능엔 영향 없음). 필요해지면 후속 작업으로.

### 7. 문서

`docs/ai/`에 짧은 메모 추가(기존 두 계획 문서와 같은 위치): 추천 결과엔 드롭이 절대 안 나온다는 것(백엔드 설계), `/api/v1/recommendations`는 인증 필수라는 것, 503은 정상적인 열화 상태로 다뤄야 한다는 것을 기록해서 나중에 "왜 드롭이 추천에 안 뜨지?" 같은 질문이 버그 리포트로 잘못 올라가는 걸 방지.

## 구현 순서

1. `lib/api/recommendation.ts` 작성.
2. `lib/catalog.ts`에 `recommendationItemToCatalogProduct` 추가.
3. 홈 화면 AI RECOMMEND 섹션 교체.
4. 드롭 상세 AI RECOMMEND 블록 교체.
5. 일반상품 상세에 추천 섹션 신규 추가.
6. `CatalogBrowser`에 `keyword` prop 추가(GENERAL은 백엔드 검색, DROP은 기존 `filterProducts` 클라이언트 필터).
7. `/search/page.tsx` + 검색창 컴포넌트를 `CatalogBrowser` 기반으로 교체, `search-results.tsx`의 구 로직 제거.
8. `docs/ai/`에 메모 추가.

## 검증

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과 확인.
2. 로컬 백엔드를 `origin/develop`(ai-service 포함) 기준으로 띄운 뒤, 로그인 상태에서 홈 화면 AI RECOMMEND 섹션에 실제 추천 결과(`strategy`가 처음엔 행동 로그가 없어 POPULAR나 LATEST로 뜰 것)가 보이는지 확인. 상품을 몇 개 조회/장바구니 담기 해본 뒤 다시 홈에 들어가서 PERSONALIZED로 바뀌는지(캐시 15분이라 바로 안 바뀔 수 있음, 문서화만 해두고 실제 확인은 선택).
3. 드롭 상세/일반상품 상세 페이지에서도 추천 섹션이 뜨는지, 지금 보고 있는 상품이 추천 목록에서 빠지는지 확인.
4. ai-service를 잠시 내려서(또는 개발 중 재현 어려우면 코드 리뷰로 대체) 503이 왔을 때 홈 화면이 깨지지 않고 부드러운 안내 문구로 대체되는지 확인.
5. `/search?q=크루아상`처럼 실제 존재하는 상품 키워드로 검색해서, 일반상품이 결과에 나오는지(예전엔 절대 안 나왔음), 카테고리 칩/드롭 칩 필터링이 검색 결과에도 그대로 적용되는지, 페이지네이션이 동작하는지 확인.
6. 오타(`크로아상` 등)로 검색해도 결과가 나오는지(하이브리드 검색의 오타 허용 확인, `fuzziness: AUTO`).

