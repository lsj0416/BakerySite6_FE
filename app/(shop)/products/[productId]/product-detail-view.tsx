"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, Minus, Plus, Sparkles } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { ProductCard } from "@/components/product-card";
import { useAuth } from "@/lib/auth/auth-context";
import * as cartApi from "@/lib/api/cart";
import * as productApi from "@/lib/api/product";
import { productImageUrl, PRODUCT_CATEGORY_LABEL } from "@/lib/api/product";
import { createPendingOrder, getPendingOrder } from "@/lib/api/order";
import * as recommendationApi from "@/lib/api/recommendation";
import { recommendationItemToCatalogProduct } from "@/lib/catalog";
import { ApiException } from "@/lib/api/types";
import { fmtPickup } from "@/lib/format";

export function ProductDetailView({
  productId,
  product,
}: {
  productId: number;
  product: productApi.ProductInfoResponse;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const soldOut = product.remainQuantity <= 0;
  const maxQty = Math.max(1, product.remainQuantity);
  const [qty, setQty] = useState(1);
  const [pickupDate, setPickupDate] = useState<string | null>(null);
  const sortedPickupDates = [...product.pickUpAvailableDates].sort();

  const addToCartMutation = useMutation({
    mutationFn: () =>
      cartApi.addCartItem({
        productId,
        quantity: qty,
        pickUpDate: pickupDate ?? undefined,
      }),
    onSuccess: () => router.push("/cart"),
  });

  // 장바구니를 거치지 않고 바로 주문서(PENDING)를 만든다. 진행 중 주문이 이미 있으면(OR006)
  // 자동으로 결제·취소하지 않고 그 주문으로 이어서 진행한다(장바구니/드롭 결제와 동일 패턴).
  const buyNowMutation = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!pickupDate) throw new ApiException("OR005", "픽업 날짜를 선택해야 합니다.");
      try {
        const created = await createPendingOrder({ productId, quantity: qty, pickUpDate: pickupDate });
        return created.orderId;
      } catch (err) {
        if (!(err instanceof ApiException) || err.code !== "OR006") throw err;
        const pending = await getPendingOrder();
        if (pending) return pending.orderId;
        throw new ApiException(
          "OR006",
          "이미 진행 중인 주문이 있습니다. 주문 내역에서 기존 주문을 먼저 확인해주세요.",
        );
      }
    },
    onSuccess: (orderId) => {
      router.push(`/order?orderId=${orderId}`);
    },
  });

  const errorMessage =
    addToCartMutation.error instanceof ApiException
      ? addToCartMutation.error.message
      : addToCartMutation.isError
        ? "장바구니에 담지 못했습니다."
        : buyNowMutation.error instanceof ApiException
          ? buyNowMutation.error.message
          : buyNowMutation.isError
            ? "주문서 생성에 실패했습니다."
            : null;

  // 추천 API는 로그인 필요 — 비회원은 상세는 볼 수 있어도 추천 섹션은 숨긴다.
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", 4],
    queryFn: () => recommendationApi.getRecommendations(4),
    enabled: isAuthenticated,
  });
  const recommendations = useMemo(
    () =>
      (recommendationsQuery.data?.items ?? [])
        .filter((item) => item.productId !== productId)
        .map(recommendationItemToCatalogProduct)
        .slice(0, 3),
    [productId, recommendationsQuery.data],
  );

  return (
    <div
      className="mx-auto w-full max-w-[1200px] flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start lg:gap-10 lg:px-6 lg:py-8"
      style={{ background: COLORS.bg }}
    >
      {/* Hero */}
      <div className="relative h-[300px] flex-shrink-0 lg:sticky lg:top-[164px] lg:row-span-2 lg:h-[620px] lg:overflow-hidden lg:rounded-[28px]">
        <BreadBox
          label={product.name}
          className="absolute inset-0"
          src={productImageUrl(product.imageUrl)}
          dim={soldOut}
        />

        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.68)" }}>
            <div style={{ transform: "rotate(-12deg)" }}>
              <span
                className="text-2xl font-black tracking-[0.18em]"
                style={{ color: COLORS.disabled, border: `3px solid ${COLORS.disabled}`, padding: "8px 14px", display: "block" }}
              >
                SOLD OUT
              </span>
            </div>
          </div>
        )}

        <div
          className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))" }}
        />

        <button
          onClick={() => router.push("/")}
          className="absolute top-12 left-4 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}
          aria-label="뒤로가기"
        >
          <ChevronLeft size={20} color="#fff" />
        </button>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 lg:overflow-visible">
        <div className="px-4 pt-4 pb-3 lg:px-0 lg:pt-2">
          <span
            className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
            style={{ background: COLORS.accentSoft, color: COLORS.accent }}
          >
            상시 판매 · {PRODUCT_CATEGORY_LABEL[product.category]}
          </span>
          <h1 className="text-2xl font-bold mt-3 mb-1 leading-tight font-serif" style={{ color: COLORS.text }}>
            {product.name}
          </h1>
          <p className="text-lg font-semibold mb-2" style={{ color: COLORS.text }}>
            {product.price.toLocaleString()}원
          </p>
          <p className="text-sm leading-relaxed" style={{ color: COLORS.muted }}>
            {product.description}
          </p>
        </div>

        <div
          className="mx-4 mb-4 overflow-hidden rounded-xl lg:mx-0"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              남은 재고
            </span>
            <span className="text-xl font-bold font-serif" style={{ color: COLORS.accent }}>
              {soldOut ? "품절" : `${product.remainQuantity}개`}
            </span>
          </div>
        </div>

        <div
          className="mx-4 mb-4 rounded-xl p-4 lg:mx-0"
          style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.border}` }}
        >
          <span className="text-base font-semibold" style={{ color: COLORS.text }}>
            픽업 가능 날짜
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            {sortedPickupDates.map((d) => {
              const isSel = pickupDate === d;
              return (
                <button
                  key={d}
                  onClick={() => setPickupDate((prev) => (prev === d ? null : d))}
                  className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1"
                  style={{
                    background: isSel ? COLORS.accent : COLORS.bg,
                    color: isSel ? COLORS.bg : COLORS.text,
                    border: isSel ? "none" : `1px solid ${COLORS.border}`,
                    fontWeight: isSel ? 700 : 400,
                  }}
                >
                  {isSel && <Check size={11} />}
                  {fmtPickup(d)}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-3 pt-3" style={{ color: COLORS.muted, borderTop: `1px solid ${COLORS.border}` }}>
            배송 없음, 매장 방문 수령만 가능
          </p>
        </div>

        {!soldOut && (
          <div
            className="mx-4 mb-4 flex items-center justify-between rounded-xl p-4 lg:mx-0"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              수량
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{ background: COLORS.border, color: COLORS.text }}
              >
                <Minus size={13} />
              </button>
              <span className="text-sm font-semibold w-4 text-center" style={{ color: COLORS.text }}>
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{ background: qty >= maxQty ? COLORS.surface : COLORS.accentSoft, color: COLORS.text }}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <section className="mx-4 mb-8 mt-10 border-t pt-8 lg:mx-0" style={{ borderColor: COLORS.border }}>
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.16em]" style={{ color: COLORS.accent }}>
              <Sparkles size={13} /> AI RECOMMEND
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold" style={{ color: COLORS.text }}>
              이런 상품은 어때요
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {recommendations.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* CTA */}
      <div
        className="sticky bottom-0 z-20 flex-shrink-0 px-4 py-3 lg:static lg:rounded-2xl lg:border"
        style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
      >
        {errorMessage && (
          <p className="text-xs mb-2 text-center" style={{ color: "#E0554F" }}>
            {errorMessage}
          </p>
        )}
        {soldOut ? (
          <button
            disabled
            className="w-full py-3.5 rounded-lg text-sm font-semibold cursor-not-allowed"
            style={{ background: COLORS.disabled, color: COLORS.muted }}
          >
            품절
          </button>
        ) : !isAuthenticated ? (
          <Link
            href="/login"
            className="block w-full py-3.5 rounded-lg text-sm font-bold text-center"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            로그인하고 구매하기
          </Link>
        ) : (
          <>
            {sortedPickupDates.length === 0 ? (
              <p className="text-xs mb-2 text-center" style={{ color: COLORS.muted }}>
                픽업 가능 날짜가 없습니다
              </p>
            ) : (
              !pickupDate && (
                <p className="text-xs mb-2 text-center" style={{ color: COLORS.muted }}>
                  픽업 날짜를 선택해주세요
                </p>
              )
            )}
            <div className="flex gap-2">
              <button
                onClick={() => addToCartMutation.mutate()}
                disabled={
                  addToCartMutation.isPending ||
                  buyNowMutation.isPending ||
                  sortedPickupDates.length === 0 ||
                  !pickupDate
                }
                className="flex-1 py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
                style={{ border: `1.5px solid ${COLORS.border}`, color: COLORS.text }}
              >
                {addToCartMutation.isPending ? "담는 중..." : "장바구니"}
              </button>
              <button
                onClick={() => buyNowMutation.mutate()}
                disabled={
                  addToCartMutation.isPending ||
                  buyNowMutation.isPending ||
                  sortedPickupDates.length === 0 ||
                  !pickupDate
                }
                className="flex-1 py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
                style={{ background: COLORS.accent, color: COLORS.bg }}
              >
                {buyNowMutation.isPending ? "주문 생성 중..." : "바로구매"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

