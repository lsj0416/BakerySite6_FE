"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import * as recommendationApi from "@/lib/api/recommendation";
import { recommendationItemToCatalogProduct } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

export default function RecommendedPage() {
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", 20],
    queryFn: () => recommendationApi.getRecommendations(20),
  });
  const products = useMemo(
    () => (recommendationsQuery.data?.items ?? []).map(recommendationItemToCatalogProduct),
    [recommendationsQuery.data],
  );

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 md:px-6 md:pb-16 md:pt-12">
      <div className="mb-8 md:mb-12">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.accent }}>
          <Sparkles size={14} /> AI RECOMMEND
        </p>
        <h1 className="font-serif text-3xl font-bold md:text-5xl" style={{ color: COLORS.text }}>
          취향에 맞을 것 같은 빵
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 md:text-base" style={{ color: COLORS.muted }}>
          회원님의 조회·장바구니 기록을 바탕으로 골라봤어요.
        </p>
      </div>

      {recommendationsQuery.isLoading ? (
        <p className="py-16 text-center text-sm" style={{ color: COLORS.muted }}>추천 상품을 준비 중입니다...</p>
      ) : recommendationsQuery.isError ? (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-sm" style={{ color: COLORS.muted }}>추천을 준비하고 있어요.</p>
          <button
            onClick={() => recommendationsQuery.refetch()}
            className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: COLORS.accent }}
          >
            다시 시도
          </button>
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 md:gap-x-5 md:gap-y-10 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-3xl">🥖</p>
          <p className="mt-3 font-semibold" style={{ color: COLORS.text }}>추천할 수 있는 상품을 준비하고 있어요.</p>
        </div>
      )}
    </main>
  );
}
