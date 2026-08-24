"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import { BackHeader } from "@/components/back-header";
import { BreadBox } from "@/components/bread-box";
import { COLORS } from "@/lib/theme";
import * as cartApi from "@/lib/api/cart";
import { productImageUrl } from "@/lib/api/product";
import { fmtPickup } from "@/lib/format";

const STATUS_LABEL: Record<cartApi.CartItemStatus, string> = {
  ORDERABLE: "",
  PRODUCT_DELETED: "판매 종료된 상품입니다",
  SOLD_OUT: "품절되었습니다",
  INSUFFICIENT_STOCK: "재고가 부족합니다",
  PICKUP_DATE_UNSELECTED: "픽업 날짜를 선택해주세요",
  PICKUP_DATE_UNAVAILABLE: "선택한 픽업 날짜가 더 이상 유효하지 않습니다",
};

export default function CartPage() {
  const queryClient = useQueryClient();
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: cartApi.getCart });

  const invalidateCart = () => queryClient.invalidateQueries({ queryKey: ["cart"] });

  const updateQuantityMutation = useMutation({
    mutationFn: ({ cartItemId, quantity }: { cartItemId: number; quantity: number }) =>
      cartApi.updateCartItemQuantity(cartItemId, quantity),
    onSuccess: invalidateCart,
  });
  const removeMutation = useMutation({
    mutationFn: (cartItemId: number) => cartApi.removeCartItem(cartItemId),
    onSuccess: invalidateCart,
  });

  const items = cartQuery.data?.items ?? [];

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <BackHeader title="장바구니" href="/" />

      {cartQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: COLORS.muted }}>불러오는 중...</p>
        </div>
      ) : cartQuery.isError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-sm" style={{ color: COLORS.muted }}>장바구니를 불러오지 못했습니다.</p>
          <button
            onClick={() => cartQuery.refetch()}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: COLORS.accent }}
          >
            다시 시도
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-3xl">🛒</p>
          <p className="text-sm" style={{ color: COLORS.muted }}>장바구니가 비어 있습니다.</p>
          <Link href="/" className="mt-1 text-sm font-bold underline" style={{ color: COLORS.accent }}>
            상품 보러 가기
          </Link>
        </div>
      ) : (
        <div className="flex-1 px-4 py-4">
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const disabled = !item.orderable;
              return (
                <div
                  key={item.cartItemId}
                  className="flex gap-3 rounded-xl p-3"
                  style={{
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                    <BreadBox label={item.productName ?? ""} src={productImageUrl(item.imageUrl)} className="h-full w-full" dim={disabled} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: COLORS.muted }}>{item.bakeryName}</p>
                    <p className="line-clamp-1 text-sm font-semibold" style={{ color: COLORS.text }}>
                      {item.productName ?? "판매 종료된 상품"}
                    </p>
                    <p className="mt-1 text-sm font-bold" style={{ color: COLORS.text }}>
                      {item.price.toLocaleString()}원
                    </p>

                    {item.pickUpAvailableDates.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.pickUpAvailableDates.map((d) => (
                          <button
                            key={d}
                            onClick={() => cartApi.updateCartItemPickupDate(item.cartItemId, d).then(invalidateCart)}
                            className="rounded-full px-2.5 py-1 text-[11px]"
                            style={{
                              background: item.pickUpDate === d ? COLORS.accent : COLORS.bg,
                              color: item.pickUpDate === d ? COLORS.bg : COLORS.text,
                              border: item.pickUpDate === d ? "none" : `1px solid ${COLORS.border}`,
                              fontWeight: item.pickUpDate === d ? 700 : 400,
                            }}
                          >
                            {fmtPickup(d)}
                          </button>
                        ))}
                      </div>
                    )}

                    {STATUS_LABEL[item.status] && (
                      <p className="mt-1.5 text-xs" style={{ color: COLORS.danger }}>
                        {STATUS_LABEL[item.status]}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateQuantityMutation.mutate({ cartItemId: item.cartItemId, quantity: Math.max(1, item.quantity - 1) })
                          }
                          disabled={item.quantity <= 1 || updateQuantityMutation.isPending}
                          className="h-6 w-6 rounded-full flex items-center justify-center disabled:opacity-40"
                          style={{ background: COLORS.border, color: COLORS.text }}
                        >
                          <Minus size={11} />
                        </button>
                        <span className="w-4 text-center text-xs font-semibold" style={{ color: COLORS.text }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantityMutation.mutate({
                              cartItemId: item.cartItemId,
                              quantity: Math.min(item.remainQuantity, item.quantity + 1),
                            })
                          }
                          disabled={item.quantity >= item.remainQuantity || updateQuantityMutation.isPending}
                          className="h-6 w-6 rounded-full flex items-center justify-center disabled:opacity-40"
                          style={{ background: COLORS.accentSoft, color: COLORS.text }}
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                      <button
                        onClick={() => removeMutation.mutate(item.cartItemId)}
                        disabled={removeMutation.isPending}
                        aria-label="삭제"
                        className="p-1.5"
                        style={{ color: COLORS.muted }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between border-t pt-4" style={{ borderColor: COLORS.border }}>
            <span className="text-sm" style={{ color: COLORS.muted }}>예상 결제 금액</span>
            <span className="text-lg font-bold" style={{ color: COLORS.text }}>
              {(cartQuery.data?.totalAmount ?? 0).toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      <div
        className="sticky bottom-0 z-20 flex-shrink-0 px-4 py-3"
        style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
      >
        <button
          disabled
          className="w-full py-3.5 rounded-lg text-sm font-semibold cursor-not-allowed"
          style={{ background: COLORS.disabled, color: COLORS.muted }}
        >
          결제 기능은 준비 중입니다
        </button>
      </div>
    </div>
  );
}
