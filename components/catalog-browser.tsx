"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import * as dropApi from "@/lib/api/drop";
import * as productApi from "@/lib/api/product";
import { PRODUCT_CATEGORY_LABEL, type ProductCategory } from "@/lib/api/product";
import { CATEGORIES, dropToCatalogProduct, findCategory, productToCatalogProduct } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

type SortKey = "soon" | "price-low" | "price-high";
type CatalogKind = "DROP" | "GENERAL";

export function CatalogBrowser({ categorySlug }: { categorySlug?: string }) {
  const [sort, setSort] = useState<SortKey>("soon");
  // /categories/[slug]로 들어온 경우(홈 화면 CATEGORY 타일)는 그 슬러그가 드롭 전용
  // 추론 카테고리라 드롭 목록으로 시작한다. 슬러그 없이 /categories로 바로 들어오면
  // 일반상품이 기본으로 보인다 — "드롭" 칩은 그 카테고리 줄 맨 오른쪽에만 노출.
  const [kind, setKind] = useState<CatalogKind>(categorySlug ? "DROP" : "GENERAL");
  const [generalCategory, setGeneralCategory] = useState<ProductCategory | undefined>(undefined);
  const [generalPage, setGeneralPage] = useState(0);
  const selectedCategory = categorySlug ? findCategory(categorySlug) : undefined;

  const dropsQuery = useQuery({
    queryKey: ["upcoming-drops", 30],
    queryFn: () => dropApi.getUpcomingDrops(30),
    enabled: kind === "DROP",
  });

  // 백엔드가 요청한 size와 무관하게 page당 20개로 캡하므로(docs/backend-bug-reports-v2.md §3),
  // 카테고리 필터 없이 "전체"를 보면 20개 넘는 상품은 페이지를 나눠서 봐야 한다.
  // 필터가 바뀔 때 generalPage를 0으로 되돌리는 건 필터 버튼 onClick에서 직접 처리한다
  // (useEffect로 하면 react-hooks/set-state-in-effect 린트 규칙에 걸림).
  const generalProductsQuery = useQuery({
    queryKey: ["general-products", generalCategory, generalPage],
    queryFn: () => productApi.getGeneralProductList({ category: generalCategory, page: generalPage, size: 20 }),
    enabled: kind === "GENERAL",
    placeholderData: keepPreviousData,
  });

  function selectGeneralCategory(category: ProductCategory | undefined) {
    setKind("GENERAL");
    setGeneralCategory(category);
    setGeneralPage(0);
  }

  function selectKind(next: CatalogKind) {
    setKind(next);
    setGeneralPage(0);
  }

  const products = useMemo(() => {
    if (kind === "GENERAL") {
      const items = (generalProductsQuery.data?.content ?? []).map(productToCatalogProduct);
      return [...items].sort((a, b) => {
        if (sort === "price-low") return a.price - b.price;
        if (sort === "price-high") return b.price - a.price;
        return a.id - b.id;
      });
    }
    const items = (dropsQuery.data ?? []).map(dropToCatalogProduct);
    const filtered = selectedCategory ? items.filter((item) => item.category === selectedCategory.slug) : items;
    return [...filtered].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      return a.id - b.id;
    });
  }, [kind, dropsQuery.data, generalProductsQuery.data, selectedCategory, sort]);

  const listQuery = kind === "GENERAL" ? generalProductsQuery : dropsQuery;
  const generalPageInfo = generalProductsQuery.data?.page;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 md:px-6 md:pb-16 md:pt-12">
      <div className="mb-8 md:mb-12">
        <p className="mb-3 text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.accent }}>
          OPENBAKE CATALOG
        </p>
        <h1 className="font-serif text-3xl font-bold md:text-5xl" style={{ color: COLORS.text }}>
          {selectedCategory?.label ?? "베이커리 전체보기"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 md:text-base" style={{ color: COLORS.muted }}>
          {selectedCategory?.description ?? "동네 베이커리의 개성 있는 빵과 한정 드롭을 카테고리별로 둘러보세요."}
        </p>
      </div>

      {categorySlug ? (
        // 홈 화면 CATEGORY 타일(/categories/[slug])로 들어온 경우 — 드롭 전용 추론
        // 카테고리 체계 그대로 유지.
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
          <Link
            href="/categories"
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
            style={{ background: !selectedCategory ? COLORS.deep : COLORS.surface, color: !selectedCategory ? "#fff" : COLORS.text, borderColor: COLORS.border }}
          >
            전체
          </Link>
          {CATEGORIES.map((category) => {
            const active = selectedCategory?.slug === category.slug;
            return (
              <Link
                key={category.slug}
                href={`/categories/${category.slug}`}
                className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
                style={{ background: active ? COLORS.deep : COLORS.surface, color: active ? "#fff" : COLORS.text, borderColor: COLORS.border }}
              >
                {category.label}
              </Link>
            );
          })}
        </div>
      ) : (
        // 기본 진입(/categories) — 일반상품 카테고리(백엔드 enum)가 기본이고,
        // 맨 오른쪽 "드롭" 칩을 누르면 한정 드롭 목록으로 전환된다.
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => selectGeneralCategory(undefined)}
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
            style={{
              background: kind === "GENERAL" && !generalCategory ? COLORS.deep : COLORS.surface,
              color: kind === "GENERAL" && !generalCategory ? "#fff" : COLORS.text,
              borderColor: COLORS.border,
            }}
          >
            전체
          </button>
          {Object.entries(PRODUCT_CATEGORY_LABEL).map(([value, label]) => {
            const active = kind === "GENERAL" && generalCategory === value;
            return (
              <button
                key={value}
                onClick={() => selectGeneralCategory(value as ProductCategory)}
                className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
                style={{ background: active ? COLORS.deep : COLORS.surface, color: active ? "#fff" : COLORS.text, borderColor: COLORS.border }}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={() => selectKind("DROP")}
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
            style={{ background: kind === "DROP" ? COLORS.deep : COLORS.surface, color: kind === "DROP" ? "#fff" : COLORS.text, borderColor: COLORS.border }}
          >
            드롭
          </button>
        </div>
      )}

      <div className="mb-5 flex items-center justify-between border-b pb-4" style={{ borderColor: COLORS.border }}>
        <p className="text-sm" style={{ color: COLORS.muted }}>
          총{" "}
          <strong style={{ color: COLORS.text }}>
            {kind === "GENERAL" ? generalPageInfo?.totalElements ?? products.length : products.length}
          </strong>
          개
        </p>
        <label className="relative flex items-center text-sm" style={{ color: COLORS.text }}>
          <span className="sr-only">정렬 방식</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="appearance-none bg-transparent py-2 pl-2 pr-7 text-sm font-medium outline-none">
            <option value="soon">{kind === "DROP" ? "오픈 임박순" : "기본순"}</option>
            <option value="price-low">낮은 가격순</option>
            <option value="price-high">높은 가격순</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1" size={15} />
        </label>
      </div>

      {listQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-[4/5] rounded-2xl" style={{ background: COLORS.accentSoft }} />
              <div className="mt-3 h-4 w-3/4 rounded" style={{ background: COLORS.border }} />
            </div>
          ))}
        </div>
      ) : listQuery.isError && products.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-sm" style={{ color: COLORS.muted }}>상품을 불러오지 못했습니다.</p>
          <button onClick={() => listQuery.refetch()} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>
            다시 시도
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-3xl">🥖</p>
          <p className="mt-3 font-semibold" style={{ color: COLORS.text }}>
            {kind === "DROP" ? "이 카테고리에 예정된 상품이 없습니다." : "이 카테고리에 등록된 상품이 없습니다."}
          </p>
          <Link href="/categories" className="mt-4 inline-block text-sm font-bold underline" style={{ color: COLORS.accent }}>전체 상품 보기</Link>
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:gap-x-5 md:gap-y-10 lg:grid-cols-4"
            style={{ opacity: kind === "GENERAL" && generalProductsQuery.isFetching ? 0.5 : 1 }}
          >
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>

          {kind === "GENERAL" && generalPageInfo && generalPageInfo.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                onClick={() => setGeneralPage((p) => Math.max(0, p - 1))}
                disabled={generalPage === 0 || generalProductsQuery.isFetching}
                aria-label="이전 페이지"
                className="flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-40"
                style={{ borderColor: COLORS.border, color: COLORS.text }}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: generalPageInfo.totalPages }).map((_, pageIndex) => (
                <button
                  key={pageIndex}
                  onClick={() => setGeneralPage(pageIndex)}
                  disabled={generalProductsQuery.isFetching}
                  className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold"
                  style={{
                    background: pageIndex === generalPage ? COLORS.deep : "transparent",
                    color: pageIndex === generalPage ? "#fff" : COLORS.text,
                  }}
                >
                  {pageIndex + 1}
                </button>
              ))}
              <button
                onClick={() => setGeneralPage((p) => Math.min(generalPageInfo.totalPages - 1, p + 1))}
                disabled={generalPage >= generalPageInfo.totalPages - 1 || generalProductsQuery.isFetching}
                aria-label="다음 페이지"
                className="flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-40"
                style={{ borderColor: COLORS.border, color: COLORS.text }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
