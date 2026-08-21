"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
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
  const [kind, setKind] = useState<CatalogKind>("DROP");
  const [generalCategory, setGeneralCategory] = useState<ProductCategory | undefined>(undefined);
  const selectedCategory = categorySlug ? findCategory(categorySlug) : undefined;

  const dropsQuery = useQuery({
    queryKey: ["upcoming-drops", 30],
    queryFn: () => dropApi.getUpcomingDrops(30),
    enabled: kind === "DROP",
  });

  // 백엔드가 요청한 size와 무관하게 page당 20개로 캡하므로(docs/backend-bug-reports-v2.md §3),
  // 카테고리 필터 없이 "전체"를 보면 20개 넘는 상품은 페이지를 넘겨받아야만 볼 수 있다.
  // 그래서 size를 크게 요청하는 대신 useInfiniteQuery로 실제 페이지를 넘기며 누적한다("더 보기").
  // generalCategory가 바뀌면 queryKey가 바뀌어 React Query가 알아서 1페이지부터 새로 시작한다.
  const generalProductsQuery = useInfiniteQuery({
    queryKey: ["general-products", generalCategory],
    queryFn: ({ pageParam }) => productApi.getGeneralProductList({ category: generalCategory, page: pageParam, size: 20 }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.page.number + 1 < lastPage.page.totalPages ? lastPage.page.number + 1 : undefined,
    enabled: kind === "GENERAL",
  });

  const loadedGeneralProducts = useMemo(
    () => generalProductsQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [generalProductsQuery.data],
  );

  const products = useMemo(() => {
    if (kind === "GENERAL") {
      const items = loadedGeneralProducts.map(productToCatalogProduct);
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
  }, [kind, dropsQuery.data, loadedGeneralProducts, selectedCategory, sort]);

  const listQuery = kind === "GENERAL" ? generalProductsQuery : dropsQuery;
  // 다음 페이지를 이어붙이는 중(2페이지 이상)에는 listQuery.isLoading이 이미 false라 전체를
  // "불러오는 중" 스켈레톤으로 덮지 않는다 — 최초 로딩(아직 누적된 게 없음)만 스켈레톤 처리.
  const isInitialLoading = kind === "GENERAL" ? listQuery.isLoading && loadedGeneralProducts.length === 0 : listQuery.isLoading;

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

      <div className="mb-5 inline-flex rounded-full border p-1" style={{ borderColor: COLORS.border }}>
        {(
          [
            { key: "DROP", label: "드롭" },
            { key: "GENERAL", label: "일반상품" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setKind(key)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ background: kind === key ? COLORS.deep : "transparent", color: kind === key ? "#fff" : COLORS.text }}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "DROP" ? (
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
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setGeneralCategory(undefined)}
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
            style={{ background: !generalCategory ? COLORS.deep : COLORS.surface, color: !generalCategory ? "#fff" : COLORS.text, borderColor: COLORS.border }}
          >
            전체
          </button>
          {Object.entries(PRODUCT_CATEGORY_LABEL).map(([value, label]) => {
            const active = generalCategory === value;
            return (
              <button
                key={value}
                onClick={() => setGeneralCategory(value as ProductCategory)}
                className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold"
                style={{ background: active ? COLORS.deep : COLORS.surface, color: active ? "#fff" : COLORS.text, borderColor: COLORS.border }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-5 flex items-center justify-between border-b pb-4" style={{ borderColor: COLORS.border }}>
        <p className="text-sm" style={{ color: COLORS.muted }}>
          총{" "}
          <strong style={{ color: COLORS.text }}>
            {kind === "GENERAL" ? generalProductsQuery.data?.pages[0]?.page.totalElements ?? products.length : products.length}
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

      {isInitialLoading ? (
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:gap-x-5 md:gap-y-10 lg:grid-cols-4">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
          {kind === "GENERAL" &&
            (generalProductsQuery.hasNextPage || (generalProductsQuery.isError && loadedGeneralProducts.length > 0)) && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() =>
                    generalProductsQuery.isError ? generalProductsQuery.refetch() : generalProductsQuery.fetchNextPage()
                  }
                  disabled={generalProductsQuery.isFetchingNextPage}
                  className="rounded-full border px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: COLORS.border, color: COLORS.text }}
                >
                  {generalProductsQuery.isFetchingNextPage
                    ? "불러오는 중..."
                    : generalProductsQuery.isError
                      ? "다시 시도"
                      : "더 보기"}
                </button>
              </div>
            )}
        </>
      )}
    </main>
  );
}
