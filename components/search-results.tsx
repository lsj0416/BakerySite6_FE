"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import * as dropApi from "@/lib/api/drop";
import { dropToCatalogProduct, filterProducts } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const dropsQuery = useQuery({ queryKey: ["upcoming-drops", 30], queryFn: () => dropApi.getUpcomingDrops(30) });
  const products = useMemo(
    () => filterProducts((dropsQuery.data ?? []).map(dropToCatalogProduct), initialQuery),
    [dropsQuery.data, initialQuery],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 md:px-6 md:pb-16 md:pt-12">
      <h1 className="font-serif text-3xl font-bold md:text-4xl" style={{ color: COLORS.text }}>상품 검색</h1>
      <form onSubmit={submit} className="relative mt-6 max-w-2xl">
        <label htmlFor="search-page-input" className="sr-only">상품 검색어</label>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={20} color={COLORS.muted} />
        <input
          id="search-page-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          placeholder="찾고 싶은 빵을 입력하세요"
          className="h-14 w-full rounded-xl border bg-white pl-12 pr-28 outline-none"
          style={{ borderColor: COLORS.border, color: COLORS.text }}
        />
        <button type="submit" className="absolute right-2 top-2 h-10 rounded-lg px-5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>검색</button>
      </form>

      <div className="mt-10 border-b pb-4" style={{ borderColor: COLORS.border }}>
        {initialQuery ? (
          <p style={{ color: COLORS.muted }}><strong style={{ color: COLORS.text }}>‘{initialQuery}’</strong> 검색 결과 {products.length}개</p>
        ) : (
          <p style={{ color: COLORS.muted }}>상품명이나 설명으로 빵을 찾아보세요.</p>
        )}
      </div>

      {dropsQuery.isLoading ? (
        <p className="py-16 text-center text-sm" style={{ color: COLORS.muted }}>검색 중...</p>
      ) : dropsQuery.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm" style={{ color: COLORS.muted }}>검색 결과를 불러오지 못했습니다.</p>
          <button onClick={() => dropsQuery.refetch()} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>다시 시도</button>
        </div>
      ) : initialQuery && products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-4xl">🥐</p>
          <p className="mt-4 font-semibold" style={{ color: COLORS.text }}>일치하는 상품이 없습니다.</p>
          <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>다른 단어로 검색하거나 카테고리를 둘러보세요.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      )}
    </main>
  );
}
