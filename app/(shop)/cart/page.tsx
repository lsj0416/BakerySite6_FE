"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { BackHeader } from "@/components/back-header";
import { BreadBox } from "@/components/bread-box";
import { COLORS } from "@/lib/theme";
import * as cartApi from "@/lib/api/cart";
import { createOrContinuePendingOrder } from "@/lib/api/order";
import { productImageUrl } from "@/lib/api/product";
import { ApiException } from "@/lib/api/types";
import { fmtPickup } from "@/lib/format";

const STATUS_LABEL: Record<cartApi.CartItemStatus, string> = {
  ORDERABLE: "",
  PRODUCT_DELETED: "판매 종료된 상품입니다",
  SOLD_OUT: "품절되었습니다",
  INSUFFICIENT_STOCK: "재고가 부족합니다",
  PICKUP_DATE_UNSELECTED: "픽업 날짜를 선택해주세요",
  PICKUP_DATE_UNAVAILABLE: "선택한 픽업 날짜가 더 이상 유효하지 않습니다",
};

/** 체크박스 — 라벨과 함께 쓰이므로 접근성 위해 실제 input을 숨겨 두고 시각 표현만 그린다. */
function CheckBox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const filled = checked || indeterminate;
  return (
    <label className="flex cursor-pointer items-center" style={{ opacity: disabled ? 0.4 : 1 }}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
      <span
        aria-hidden
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
        style={{
          background: filled ? COLORS.accent : COLORS.surface,
          border: `1.5px solid ${filled ? COLORS.accent : COLORS.border}`,
          color: COLORS.surface,
        }}
      >
        {indeterminate ? (
          <span style={{ width: 9, height: 2, background: COLORS.surface, borderRadius: 1 }} />
        ) : checked ? (
          <Check size={13} strokeWidth={3} />
        ) : null}
      </span>
    </label>
  );
}

export default function CartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: cartApi.getCart });

  /**
   * 선택 해제한 항목만 기억한다(선택된 항목이 아니라). 장바구니에 새로 담긴 상품은
   * 기본으로 선택된 상태여야 자연스러운데, "선택된 id 집합"을 들고 있으면 새 항목이
   * 항상 해제 상태로 들어와 사용자가 매번 다시 체크해야 한다.
   */
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

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
  const pickupDateMutation = useMutation({
    mutationFn: ({ cartItemId, pickUpDate }: { cartItemId: number; pickUpDate: string }) =>
      cartApi.updateCartItemPickupDate(cartItemId, pickUpDate),
    onSuccess: invalidateCart,
  });

  const items = useMemo(() => cartQuery.data?.items ?? [], [cartQuery.data]);
  const isSelected = (id: number) => !deselected.has(id);

  /** 판매자(상호)별로 묶는다. 서버 응답 순서를 유지해 화면이 튀지 않게 한다. */
  const groups = useMemo(() => {
    const bySeller = new Map<number, { bakeryName: string; items: cartApi.CartDetailItem[] }>();
    for (const item of items) {
      const g = bySeller.get(item.sellerId) ?? { bakeryName: item.bakeryName, items: [] };
      g.items.push(item);
      bySeller.set(item.sellerId, g);
    }
    return [...bySeller.entries()].map(([sellerId, g]) => ({ sellerId, ...g }));
  }, [items]);

  /** 실제로 주문에 실릴 항목 = 체크됐고 + 서버가 주문 가능하다고 본 것. */
  const checkoutItems = items.filter((i) => isSelected(i.cartItemId) && i.orderable);
  const selectedTotal = checkoutItems.reduce((sum, i) => sum + i.estimatedAmount, 0);

  /** 픽업일만 없어서 못 나가는 항목 — 버튼 문구를 그 사유로 바꾸기 위해 따로 센다. */
  const blockedByPickup = items.filter(
    (i) => isSelected(i.cartItemId) && !i.orderable && i.status === "PICKUP_DATE_UNSELECTED",
  );

  const selectableIds = items.map((i) => i.cartItemId);
  const allSelected = selectableIds.length > 0 && selectableIds.every(isSelected);
  const someSelected = selectableIds.some(isSelected);

  const toggleOne = (id: number) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: number[], selected: boolean) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const checkoutMutation = useMutation({
    mutationFn: async (): Promise<number> => {
      const cartItemIds = checkoutItems.map((item) => item.cartItemId);
      if (cartItemIds.length === 0) {
        throw new ApiException("C001", "주문할 상품을 선택해주세요.");
      }
      return createOrContinuePendingOrder({ cartItemIds });
    },
    onSuccess: (orderId) => {
      router.push(`/order?orderId=${orderId}`);
    },
  });

  const checkoutLabel = () => {
    if (checkoutMutation.isPending) return "주문 생성 중...";
    if (checkoutItems.length === 0) {
      if (blockedByPickup.length > 0) return "픽업 날짜를 선택해주세요";
      return "주문할 상품을 선택해주세요";
    }
    return `${selectedTotal.toLocaleString()}원 주문하기 (${checkoutItems.length}개)`;
  };

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
          {/* 전체 선택 */}
          <div
            className="mb-3 flex items-center justify-between rounded-xl px-3 py-2.5"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-2.5">
              <CheckBox
                checked={allSelected}
                indeterminate={!allSelected && someSelected}
                onChange={() => setMany(selectableIds, !allSelected)}
                label="전체 선택"
              />
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                전체 선택 ({selectableIds.filter(isSelected).length}/{selectableIds.length})
              </span>
            </div>
            <button
              onClick={() => {
                const ids = items.filter((i) => isSelected(i.cartItemId)).map((i) => i.cartItemId);
                ids.forEach((id) => removeMutation.mutate(id));
              }}
              disabled={!someSelected || removeMutation.isPending}
              className="text-xs disabled:opacity-40"
              style={{ color: COLORS.muted }}
            >
              선택 삭제
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const groupIds = group.items.map((i) => i.cartItemId);
              const groupAll = groupIds.every(isSelected);
              const groupSome = groupIds.some(isSelected);
              return (
                <section
                  key={group.sellerId}
                  className="rounded-xl"
                  style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                >
                  {/* 판매자 헤더 */}
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5"
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <CheckBox
                      checked={groupAll}
                      indeterminate={!groupAll && groupSome}
                      onChange={() => setMany(groupIds, !groupAll)}
                      label={`${group.bakeryName} 전체 선택`}
                    />
                    <span className="text-sm font-bold" style={{ color: COLORS.text }}>
                      {group.bakeryName}
                    </span>
                    <span className="text-xs" style={{ color: COLORS.muted }}>
                      {group.items.length}개
                    </span>
                  </div>

                  <div className="flex flex-col">
                    {group.items.map((item, idx) => {
                      const unavailable = !item.orderable;
                      const needsPickup = item.status === "PICKUP_DATE_UNSELECTED";
                      return (
                        <div
                          key={item.cartItemId}
                          className="flex gap-3 p-3"
                          style={{
                            borderTop: idx === 0 ? "none" : `1px solid ${COLORS.border}`,
                          }}
                        >
                          <div className="pt-1">
                            <CheckBox
                              checked={isSelected(item.cartItemId)}
                              onChange={() => toggleOne(item.cartItemId)}
                              label={`${item.productName ?? "상품"} 선택`}
                            />
                          </div>

                          <div
                            className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg"
                            style={{ opacity: unavailable ? 0.6 : 1 }}
                          >
                            <BreadBox
                              label={item.productName ?? ""}
                              src={productImageUrl(item.imageUrl)}
                              className="h-full w-full"
                              dim={unavailable}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-semibold" style={{ color: COLORS.text }}>
                              {item.productName ?? "판매 종료된 상품"}
                            </p>
                            <p className="mt-1 text-sm font-bold" style={{ color: COLORS.text }}>
                              {item.price.toLocaleString()}원
                            </p>

                            {item.pickUpAvailableDates.length > 0 && (
                              <div className="mt-2">
                                <p
                                  className="mb-1 text-[11px]"
                                  style={{ color: needsPickup ? COLORS.danger : COLORS.muted }}
                                >
                                  {item.pickUpDate ? "픽업 날짜 (변경 가능)" : "픽업 날짜를 선택해주세요"}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.pickUpAvailableDates.map((d) => (
                                    <button
                                      key={d}
                                      onClick={() =>
                                        pickupDateMutation.mutate({ cartItemId: item.cartItemId, pickUpDate: d })
                                      }
                                      disabled={pickupDateMutation.isPending}
                                      className="rounded-full px-2.5 py-1 text-[11px] disabled:opacity-50"
                                      style={{
                                        background: item.pickUpDate === d ? COLORS.accent : COLORS.bg,
                                        color: item.pickUpDate === d ? COLORS.surface : COLORS.text,
                                        border: item.pickUpDate === d ? "none" : `1px solid ${COLORS.border}`,
                                        fontWeight: item.pickUpDate === d ? 700 : 400,
                                      }}
                                    >
                                      {fmtPickup(d)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 픽업일 미선택은 위 안내가 이미 하고 있으니 중복 표시하지 않는다. */}
                            {STATUS_LABEL[item.status] && !needsPickup && (
                              <p className="mt-1.5 text-xs" style={{ color: COLORS.danger }}>
                                {STATUS_LABEL[item.status]}
                              </p>
                            )}

                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    updateQuantityMutation.mutate({
                                      cartItemId: item.cartItemId,
                                      quantity: Math.max(1, item.quantity - 1),
                                    })
                                  }
                                  disabled={item.quantity <= 1 || updateQuantityMutation.isPending}
                                  aria-label="수량 줄이기"
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
                                  aria-label="수량 늘리기"
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
                </section>
              );
            })}
          </div>

          <div
            className="mt-5 flex items-center justify-between border-t pt-4"
            style={{ borderColor: COLORS.border }}
          >
            <span className="text-sm" style={{ color: COLORS.muted }}>
              결제 예정 금액 (선택 {checkoutItems.length}개)
            </span>
            <span className="text-lg font-bold" style={{ color: COLORS.text }}>
              {selectedTotal.toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div
          className="sticky bottom-0 z-20 flex-shrink-0 px-4 py-3"
          style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
        >
          {checkoutMutation.isError && (
            <p className="text-xs text-center mb-2" style={{ color: COLORS.danger }}>
              {checkoutMutation.error instanceof ApiException
                ? checkoutMutation.error.message
                : "주문서 생성에 실패했습니다."}
            </p>
          )}
          {blockedByPickup.length > 0 && (
            <p className="text-xs text-center mb-2" style={{ color: COLORS.danger }}>
              픽업 날짜를 정하지 않은 상품 {blockedByPickup.length}개는 주문할 수 없습니다.
            </p>
          )}
          <button
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending || checkoutItems.length === 0}
            className="w-full py-3.5 rounded-lg text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: COLORS.accent, color: COLORS.surface }}
          >
            {checkoutLabel()}
          </button>
        </div>
      )}
    </div>
  );
}
