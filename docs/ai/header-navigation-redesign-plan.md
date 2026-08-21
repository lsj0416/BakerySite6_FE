# 헤더 내비게이션 개편 (메가메뉴 카테고리 + 추천/신상품/드롭)

작성일: 2026-08-21
선행 문서: `docs/ai/product-catalog-sync-plan.md`, `docs/ai/recommendation-search-integration-plan.md`(둘 다 구현 완료됨)
상태: 계획만 확정, 구현 착수 전.

## Context

추천/검색 연동(직전 계획, 이미 대부분 구현됨 — `lib/api/recommendation.ts`, `catalog-browser.tsx`의 `keyword` prop, 홈 화면 AI RECOMMEND 실제 연동까지 확인됨)이 끝난 상태에서, 헤더의 카테고리 내비게이션을 다시 설계한다.

현재 `components/site-header.tsx`의 하단 카테고리 바(96~110행, `lg:block`만 — 데스크톱 전용)는 드롭 전용 6-슬러그(`bread`/`bagel`/...)를 전부 한 줄로 나열하고 있는데, 이건 지난 세션에 `/categories` 기본 진입을 "일반상품 우선"으로 바꾼 것과 지금 안 맞다(헤더는 여전히 옛 드롭 카테고리를 보여줌).

새 설계: "카테고리"는 기본값 "전체 상품보기"이고 호버하면 상세 카테고리(백엔드 실제 5종 일반상품 카테고리)가 드롭다운으로 나온다. 그 옆에 "추천 상품"/"신상품"/"드롭" 세 개를 독립 메뉴로 둔다("베스트 상품"은 백엔드에 판매량순 API가 없어서 이번 스코프에서 제외하기로 확정함).

## 변경 파일

### 1. `lib/api/product.ts` — `getGeneralProductList`에 `sort` 파라미터 추가

```ts
export interface GetGeneralProductListParams {
  keyword?: string;
  category?: ProductCategory;
  page?: number;
  size?: number;
  sort?: string; // 예: "id,desc" — Spring Pageable이 sort 쿼리 파라미터를 그대로 바인딩함
}
```
"신상품" 정렬에 쓸 것. `Product`엔 `createdAt` 같은 필드가 응답에 없어서 auto-increment `id` 내림차순을 "최신순" 대용으로 쓴다(백엔드 `ProductController.getGeneralProductList`가 `Pageable pageable` 파라미터를 그대로 받으므로 `sort=id,desc` 쿼리 파라미터가 Spring Data Web에 의해 자동 바인딩됨 — 컨트롤러 코드 변경 불필요, FE만 파라미터를 실어 보내면 됨).

### 2. `components/catalog-browser.tsx` — URL 기반 초기 상태 지원 + "최신순" 정렬 추가

- Props 확장: `initialCategory?: ProductCategory`, `initialKind?: "DROP" | "GENERAL"`.
- `useState` 초기값을 `categorySlug ? "DROP" : initialKind ?? "GENERAL"`, `generalCategory`도 `initialCategory`로 시드(둘 다 `useState(() => ...)` 형태로, `useEffect` 없이 마운트 시점에만 반영 — URL이 나중에 또 바뀌는 경우는 페이지 자체가 다시 마운트되므로 문제없음, 기존 `set-state-in-effect` 린트 회피 원칙과 동일).
- `SortKey`에 `"new"` 추가(라벨 "최신순"). GENERAL 조회 시 `sort === "new"`면 `getGeneralProductList({ ..., sort: "id,desc" })`로 실제 서버 정렬 요청(지금처럼 페이지 단위로 클라이언트에서 `a.id-b.id` 재정렬하던 방식은 여러 페이지에 걸쳐 정렬이 안 맞았던 약점이 있었는데 이 참에 진짜 서버 정렬로 교체). DROP 분기는 정렬 옵션 자체를 백엔드가 지원 안 하므로 `"new"`를 골라도 기존 `"soon"`과 동일하게 동작(무시).

### 3. `app/(shop)/categories/page.tsx` — 쿼리 파라미터 읽어서 `CatalogBrowser`에 전달

`search/page.tsx`(`searchParams: Promise<{...}>` 비동기 서버 컴포넌트) 패턴 그대로 따라서:
```tsx
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; kind?: string; sort?: string }>;
}) {
  const { category, kind, sort } = await searchParams;
  return (
    <CatalogBrowser
      initialCategory={category as ProductCategory | undefined}
      initialKind={kind === "DROP" ? "DROP" : undefined}
      initialSort={sort === "new" ? "new" : undefined}
    />
  );
}
```
(`initialSort`도 `CatalogBrowser`에 같이 추가 — 2번 항목의 `SortKey` 초기값 시드용.)

### 4. `app/(shop)/recommended/page.tsx` (신규) — "추천 상품" 전용 페이지

추천 API(`GET /api/v1/recommendations`)는 `Pageable`이 아니라 최대 20개짜리 단일 리스트라 `CatalogBrowser`의 페이지네이션 모델과 안 맞는다. 홈 화면 AI RECOMMEND 섹션과 완전히 같은 패턴(로딩/에러/빈 상태, `recommendationItemToCatalogProduct` + `ProductCard`)을 그대로 재사용해 새 페이지로 분리:
```tsx
"use client";
export default function RecommendedPage() {
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", 20],
    queryFn: () => recommendationApi.getRecommendations(20),
  });
  const products = useMemo(
    () => (recommendationsQuery.data?.items ?? []).map(recommendationItemToCatalogProduct),
    [recommendationsQuery.data],
  );
  // 로딩/에러(503 포함, 홈 화면과 동일 톤)/빈 상태/그리드는 홈 화면 AI RECOMMEND 블록 그대로 재사용
}
```

### 5. `components/site-header.tsx` — 하단 카테고리 바 교체

96~110행의 플랫 나열을 아래로 교체:
```tsx
<nav className="hidden border-t lg:block" ...>
  <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-7 px-6 text-sm font-semibold">
    <div className="group relative h-full flex items-center">
      <Link href="/categories" className="flex items-center gap-1" style={{ color: COLORS.accent }}>
        전체 상품보기 <ChevronDown size={14} />
      </Link>
      <div className="absolute left-0 top-full hidden w-56 rounded-xl border bg-white p-2 shadow-lg group-hover:block"
           style={{ borderColor: COLORS.border }}>
        {Object.entries(PRODUCT_CATEGORY_LABEL).map(([value, label]) => (
          <Link key={value} href={`/categories?category=${value}`}
                className="block rounded-lg px-3 py-2 hover:bg-[#F3E9DE]" style={{ color: COLORS.text }}>
            {label}
          </Link>
        ))}
      </div>
    </div>
    <Link href="/recommended" style={{ color: COLORS.text }}>추천 상품</Link>
    <Link href="/categories?sort=new" style={{ color: COLORS.text }}>신상품</Link>
    <Link href="/categories?kind=DROP" className="ml-auto" style={{ color: COLORS.deep }}>드롭</Link>
  </div>
</nav>
```
순수 CSS `group`/`group-hover:block`으로 호버 드롭다운 구현(JS 상태 불필요, 클릭 밖 감지 등 안 만들어도 됨). `CATEGORIES`(구 드롭 슬러그) import는 이 파일에서 이제 안 쓰이므로 제거, `PRODUCT_CATEGORY_LABEL`(`lib/api/product.ts`)을 새로 import.

**손대지 않는 것**: 모바일 헤더(상단 아이콘 줄)는 원래도 이 카테고리 바와 무관(`lg:block`으로 데스크톱 전용이었음) — 이번에도 그대로 둠. 홈 화면의 "CATEGORY" 타일 그리드(`app/(shop)/page.tsx`, 구 드롭 슬러그 6개→ `/categories/[slug]`)도 건드리지 않음 — 헤더 내비게이션과는 별개 진입점이라 스코프 밖.

## 구현 순서

1. `lib/api/product.ts`에 `sort` 파라미터 추가.
2. `catalog-browser.tsx`에 `initialCategory`/`initialKind`/`initialSort` prop + `"new"` 정렬 추가.
3. `app/(shop)/categories/page.tsx`를 쿼리 파라미터 읽는 비동기 서버 컴포넌트로 변경.
4. `app/(shop)/recommended/page.tsx` 신규 작성.
5. `site-header.tsx` 하단 nav를 메가메뉴+3개 링크로 교체.

## 검증

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과 확인.
2. 데스크톱 폭에서 헤더의 "전체 상품보기"에 마우스를 올렸을 때 카테고리 5개가 드롭다운으로 뜨는지, 각각 클릭 시 `/categories?category=...`로 이동해 해당 카테고리가 실제로 선택된 채로 페이지가 뜨는지 확인.
3. "드롭" 클릭 → `/categories?kind=DROP`로 이동해 드롭 목록이 기본으로 뜨는지.
4. "신상품" 클릭 → `/categories?sort=new`로 이동해 정렬이 "최신순"으로 맞춰지고, 실제로 최근 등록된 상품이 먼저 나오는지(직접 상품 하나 새로 등록해서 맨 위에 뜨는지로 확인).
5. "추천 상품" 클릭 → `/recommended`에서 홈 화면과 동일한 추천 목록이 뜨는지, 로그인 안 한 상태로 접근 시 `(shop)` 레이아웃 가드가 `/login`으로 보내는지(다른 shop 페이지와 동일하게 동작해야 함).
