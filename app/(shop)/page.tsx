"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3, Sparkles, Wallet } from "lucide-react";
import { BreadBox } from "@/components/bread-box";
import { ProductCard } from "@/components/product-card";
import { useAuth } from "@/lib/auth/auth-context";
import * as dropApi from "@/lib/api/drop";
import * as paymentApi from "@/lib/api/payment";
import * as productApi from "@/lib/api/product";
import * as recommendationApi from "@/lib/api/recommendation";
import { CATEGORIES, dropToCatalogProduct, productToCatalogProduct, recommendationItemToCatalogProduct } from "@/lib/catalog";
import { msToHMS, pad } from "@/lib/format";
import { COLORS } from "@/lib/theme";
import { toDropStatus } from "@/lib/types";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const accountQuery = useQuery({
    queryKey: ["deposit-account"],
    queryFn: paymentApi.getDepositAccount,
    enabled: isAuthenticated,
  });
  const dropsQuery = useQuery({ queryKey: ["upcoming-drops"], queryFn: () => dropApi.getUpcomingDrops(30) });
  const drops = useMemo(() => dropsQuery.data ?? [], [dropsQuery.data]);
  const products = useMemo(() => drops.map(dropToCatalogProduct), [drops]);
  const generalProductsQuery = useQuery({
    queryKey: ["general-products"],
    queryFn: () => productApi.getGeneralProductList({ size: 8 }),
  });
  const generalProducts = useMemo(
    () => (generalProductsQuery.data?.content ?? []).map(productToCatalogProduct),
    [generalProductsQuery.data],
  );
  // 추천 API는 로그인 필요 — 비회원은 홈은 볼 수 있어도 추천 섹션은 숨긴다.
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", 4],
    queryFn: () => recommendationApi.getRecommendations(4),
    enabled: isAuthenticated,
  });
  const recommendedProducts = useMemo(
    () => (recommendationsQuery.data?.items ?? []).map(recommendationItemToCatalogProduct),
    [recommendationsQuery.data],
  );
  const featured = drops[0];
  const featuredStatus = featured ? toDropStatus(featured.dropStatus, featured.remainQuantity) : null;
  const featuredTarget = featured
    ? new Date(featuredStatus === "SCHEDULED" ? featured.dropStart : featured.dropEnd).getTime()
    : null;
  const countdown = featuredTarget ? msToHMS(featuredTarget - now.getTime()) : null;

  return (
    <main style={{ background: COLORS.bg }}>
      <section className="mx-auto grid max-w-[1200px] gap-4 px-4 py-5 sm:gap-6 md:px-6 md:py-8 lg:grid-cols-[1.08fr_.92fr] lg:py-10">
        <div className="flex min-h-[340px] flex-col justify-between rounded-[24px] px-5 py-7 sm:min-h-[400px] sm:px-8 sm:py-10 lg:min-h-[480px] lg:rounded-[28px] lg:px-10 lg:py-12" style={{ background: "linear-gradient(135deg, #F2E4D4 0%, #E8CFB4 100%)" }}>
          <div>
            <p className="text-xs font-bold tracking-[0.2em]" style={{ color: COLORS.accent }}>LOCAL BAKERY MARKET</p>
            <h1 className="mt-5 max-w-lg font-serif text-4xl font-extrabold leading-[1.12] sm:text-5xl lg:text-6xl" style={{ color: COLORS.deep }}>
              가장 맛있는 순간의 빵을 만나요
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 md:text-base" style={{ color: COLORS.muted }}>
              동네 베이커리의 일상 상품부터 수량 한정 드롭까지, 취향에 맞는 빵을 한곳에서 발견하세요.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/categories" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white" style={{ background: COLORS.deep }}>
              베이커리 둘러보기 <ArrowRight size={16} />
            </Link>
            <Link href="#drops" className="inline-flex items-center gap-2 rounded-full border bg-white/60 px-5 py-3 text-sm font-bold" style={{ color: COLORS.text, borderColor: "rgba(59,36,22,.15)" }}>
              한정 드롭 보기
            </Link>
          </div>
        </div>

        <Link href={featured ? `/drops/${featured.dropId}` : "/categories"} className="group relative min-h-[340px] overflow-hidden rounded-[24px] sm:min-h-[400px] lg:min-h-[480px] lg:rounded-[28px]" style={{ background: COLORS.accentSoft }}>
          <BreadBox label={featured?.name ?? "오늘의 베이커리"} src={featured ? productApi.productImageUrl(featured.imageUrl) : undefined} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
          <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold" style={{ color: COLORS.accent }}>오늘의 드롭</span>
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <Clock3 size={13} />
              {countdown ? `${pad(countdown.h)}:${pad(countdown.m)}:${pad(countdown.s)}` : "준비 중"}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white md:p-8">
            <p className="text-sm text-white/70">가장 가까운 한정 판매</p>
            <h2 className="mt-2 font-serif text-3xl font-bold md:text-4xl">{featured?.name ?? "새로운 드롭을 준비하고 있어요"}</h2>
            {featured && <p className="mt-3 text-lg font-bold">{featured.price.toLocaleString()}원</p>}
          </div>
        </Link>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.accent }}>CATEGORY</p>
            <h2 className="mt-2 font-serif text-2xl font-bold md:text-4xl" style={{ color: COLORS.text }}>어떤 빵을 찾으세요?</h2>
          </div>
          <Link href="/categories" className="hidden items-center gap-1 text-sm font-bold md:flex" style={{ color: COLORS.accent }}>전체보기 <ArrowRight size={15} /></Link>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
          {CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`} className="group rounded-2xl border bg-white px-2 py-5 text-center transition-transform hover:-translate-y-1 md:px-4 md:py-7" style={{ borderColor: COLORS.border }}>
              <span className="text-3xl md:text-4xl" aria-hidden="true">{category.emoji}</span>
              <p className="mt-3 text-xs font-bold md:text-sm" style={{ color: COLORS.text }}>{category.shortLabel}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y py-12 md:py-16" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.16em]" style={{ color: COLORS.accent }}><Sparkles size={14} /> AI RECOMMEND</p>
              <h2 className="mt-2 font-serif text-2xl font-bold md:text-4xl" style={{ color: COLORS.text }}>취향에 맞을 것 같은 빵</h2>
              <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>회원님의 조회·장바구니 기록을 바탕으로 골라봤어요.</p>
            </div>
            <Link href="/categories" className="hidden items-center gap-1 text-sm font-bold md:flex" style={{ color: COLORS.accent }}>더 보기 <ArrowRight size={15} /></Link>
          </div>
          {recommendationsQuery.isLoading ? (
            <p className="py-16 text-center text-sm" style={{ color: COLORS.muted }}>추천 상품을 준비 중입니다...</p>
          ) : recommendationsQuery.isError ? (
            <div className="rounded-2xl px-5 py-10 text-center" style={{ background: COLORS.bg }}>
              <p className="text-sm" style={{ color: COLORS.muted }}>추천을 준비하고 있어요.</p>
              <button onClick={() => recommendationsQuery.refetch()} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>다시 시도</button>
            </div>
          ) : recommendedProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4">{recommendedProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          ) : (
            <p className="rounded-2xl py-14 text-center text-sm" style={{ background: COLORS.bg, color: COLORS.muted }}>추천할 수 있는 상품을 준비하고 있어요.</p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.accent }}>ALWAYS AVAILABLE</p>
            <h2 className="mt-2 font-serif text-2xl font-bold md:text-4xl" style={{ color: COLORS.text }}>상시 판매</h2>
            <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>언제든 주문할 수 있는 동네 베이커리의 상시 판매 상품</p>
          </div>
          <Link href="/categories" className="hidden items-center gap-1 text-sm font-bold md:flex" style={{ color: COLORS.accent }}>전체보기 <ArrowRight size={15} /></Link>
        </div>
        {generalProductsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-[4/5] rounded-2xl" style={{ background: COLORS.accentSoft }} />
                <div className="mt-3 h-4 w-3/4 rounded" style={{ background: COLORS.border }} />
              </div>
            ))}
          </div>
        ) : generalProductsQuery.isError ? (
          <div className="rounded-2xl px-5 py-10 text-center" style={{ background: COLORS.surface }}>
            <p className="text-sm" style={{ color: COLORS.muted }}>상시 판매 상품을 불러오지 못했습니다.</p>
            <button onClick={() => generalProductsQuery.refetch()} className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>다시 시도</button>
          </div>
        ) : generalProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4">{generalProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        ) : (
          <p className="rounded-2xl py-14 text-center text-sm" style={{ background: COLORS.surface, color: COLORS.muted }}>등록된 상시 판매 상품이 없습니다.</p>
        )}
      </section>

      <section id="drops" className="scroll-mt-36 bg-[#3B2416] py-12 text-white md:py-16">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-[#DDBE9B]">LIMITED DROP</p>
              <h2 className="mt-2 font-serif text-2xl font-bold md:text-4xl">놓치면 다시 만나기 어려워요</h2>
              <p className="mt-2 text-sm text-white/65">수량과 시간이 한정된 베이커리 드롭</p>
            </div>
            <Link href="/categories" className="hidden items-center gap-1 text-sm font-bold text-[#E7C9A8] md:flex">전체 드롭 <ArrowRight size={15} /></Link>
          </div>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 lg:grid-cols-4 [&_p]:!text-white [&_article_p:last-child]:!text-white/60">
              {products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-14 text-center text-sm text-white/60">예정된 드롭이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="flex flex-col justify-between gap-5 rounded-[28px] border bg-white p-6 md:flex-row md:items-center md:p-9" style={{ borderColor: COLORS.border }}>
          <div>
            <p className="font-serif text-2xl font-bold" style={{ color: COLORS.text }}>예치금으로 빠르고 안전하게 결제하세요</p>
            <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>드롭 오픈 순간, 충전된 예치금으로 바로 구매할 수 있어요.</p>
          </div>
          <Link href="/wallet" className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white" style={{ background: COLORS.accent }}>
            <Wallet size={17} /> {accountQuery.data ? `${accountQuery.data.balance.toLocaleString()}원 관리` : "예치금 확인"}
          </Link>
        </div>
      </section>
    </main>
  );
}
