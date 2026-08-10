"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import * as dropApi from "@/lib/api/drop";
import { CATEGORIES, dropToCatalogProduct, findCategory } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

type SortKey = "soon" | "price-low" | "price-high";

export function CatalogBrowser({ categorySlug }: { categorySlug?: string }) {
  const [sort, setSort] = useState<SortKey>("soon");
  const selectedCategory = categorySlug ? findCategory(categorySlug) : undefined;
  const dropsQuery = useQuery({
    queryKey: ["upcoming-drops", 30],
    queryFn: () => dropApi.getUpcomingDrops(30),
  });

  const products = useMemo(() => {
    const items = (dropsQuery.data ?? []).map(dropToCatalogProduct);
    const filtered = selectedCategory ? items.filter((item) => item.category === selectedCategory.slug) : items;
    return [...filtered].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      return a.id - b.id;
    });
  }, [dropsQuery.data, selectedCategory, sort]);

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

      <div className="mb-5 flex items-center justify-between border-b pb-4" style={{ borderColor: COLORS.border }}>
        <p className="text-sm" style={{ color: COLORS.muted }}>
          총 <strong style={{ color: COLORS.text }}>{products.length}</strong>개
        </p>
        <label className="relative flex items-center text-sm" style={{ color: COLORS.text }}>
          <span className="sr-only">정렬 방식</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="appearance-none bg-transparent py-2 pl-2 pr-7 text-sm font-medium outline-none">
            <option value="soon">오픈 임박순</option>
            <option value="price-low">낮은 가격순</option>
            <option value="price-high">높은 가격순</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1" size={15} />
        </label>
      </div>

      {dropsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-[4/5] rounded-2xl" style={{ background: COLORS.accentSoft }} />
              <div className="mt-3 h-4 w-3/4 rounded" style={{ background: COLORS.border }} />
            </div>
          ))}
        </div>
      ) : dropsQuery.isError ? (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-sm" style={{ color: COLORS.muted }}>상품을 불러오지 못했습니다.</p>
          <button onClick={() => dropsQuery.refetch()} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>
            다시 시도
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-3xl">🥖</p>
          <p className="mt-3 font-semibold" style={{ color: COLORS.text }}>이 카테고리에 예정된 상품이 없습니다.</p>
          <Link href="/categories" className="mt-4 inline-block text-sm font-bold underline" style={{ color: COLORS.accent }}>전체 상품 보기</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 md:gap-y-10 lg:grid-cols-4">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </main>
  );
}
