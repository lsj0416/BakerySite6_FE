"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackHeader } from "@/components/back-header";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { COLORS } from "@/lib/theme";
import * as sellerApi from "@/lib/api/seller";
import * as sellerOrderApi from "@/lib/api/seller-order";
import * as orderApi from "@/lib/api/order";
import { ApiException } from "@/lib/api/types";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { fmtDateTime, fmtPickup } from "@/lib/format";

type FilterKey = "전체" | orderApi.OrderHistoryState;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "PAID", label: "픽업대기" },
  { key: "CANCELED", label: "취소" },
];

export default function SellerOrdersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [page, setPage] = useState(0);

  const sellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    retry: false,
  });

  const isApproved = sellerQuery.data?.applicationStatus === "APPROVED";
  const notApprovedSeller = sellerQuery.isSuccess && !isApproved;
  const noApplication =
    sellerQuery.isError &&
    sellerQuery.error instanceof ApiException &&
    sellerQuery.error.code === "C003";

  const ordersQuery = useQuery({
    queryKey: ["sellerOrders", filter, page],
    queryFn: () =>
      sellerOrderApi.getSellerOrders({
        orderState: filter === "전체" ? undefined : filter,
        page,
        size: 10,
      }),
    enabled: isApproved,
  });

  const confirmMutation = useMutation({
    mutationFn: (orderItemId: number) => orderApi.confirmOrderItem(orderItemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sellerOrders"] }),
  });

  function changeFilter(f: FilterKey) {
    setFilter(f);
    setPage(0);
  }

  function handleConfirm(orderItemId: number) {
    if (window.confirm("구매를 확정하시겠습니까? 확정 후에는 취소할 수 없습니다.")) {
      confirmMutation.mutate(orderItemId);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="판매내역" href="/seller/dashboard" />

      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {sellerQuery.isPending && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {(noApplication || notApprovedSeller) && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            승인된 판매자만 판매내역을 확인할 수 있습니다.
          </p>
        )}
        {sellerQuery.isError && !noApplication && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            판매자 정보를 불러오지 못했습니다.
          </p>
        )}

        {isApproved && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => changeFilter(f.key)}
                  className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap"
                  style={{
                    background: filter === f.key ? COLORS.accent : COLORS.surface,
                    color: filter === f.key ? COLORS.bg : COLORS.muted,
                    border: filter === f.key ? "none" : `1px solid ${COLORS.border}`,
                    fontWeight: filter === f.key ? 600 : 400,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {ordersQuery.isLoading && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}
            {ordersQuery.isError && (
              <p className="text-sm" style={{ color: "#E0554F" }}>
                {ordersQuery.error instanceof ApiException
                  ? ordersQuery.error.message
                  : "판매내역을 불러오지 못했습니다."}
              </p>
            )}
            {ordersQuery.data?.content.length === 0 && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                판매내역이 없습니다.
              </p>
            )}

            {ordersQuery.data?.content.map((order) => (
              <div
                key={order.orderId}
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                <div className="flex justify-between items-center">
                  <OrderStatusBadge status={ORDER_STATUS_LABEL[order.orderState]} />
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    {order.paidAt ? `${fmtDateTime(order.paidAt)} 결제` : ""}
                  </span>
                </div>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  구매자 {order.buyerName} · 판매분 {order.sellerAmount.toLocaleString()}원
                </p>

                <div className="flex flex-col gap-2 mt-1">
                  {order.items.map((item) => (
                    <div
                      key={item.orderItemId}
                      className="flex items-center justify-between gap-2 py-1.5"
                      style={{ borderTop: `1px solid ${COLORS.border}` }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: COLORS.text }}>
                          {item.productName} {item.quantity}개
                        </p>
                        <p className="text-xs" style={{ color: COLORS.muted }}>
                          {fmtPickup(item.pickUpDate)} 픽업 · {item.subtotal.toLocaleString()}원
                        </p>
                      </div>
                      {order.orderState === "PAID" && item.itemStatus === "UNCONFIRMED" ? (
                        <button
                          onClick={() => handleConfirm(item.orderItemId)}
                          disabled={confirmMutation.isPending}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{ background: COLORS.accentSoft, color: COLORS.accent }}
                        >
                          구매확정
                        </button>
                      ) : (
                        <span
                          className="flex-shrink-0 text-xs font-semibold"
                          style={{ color: item.itemStatus === "CONFIRMED" ? COLORS.green : COLORS.muted }}
                        >
                          {item.itemStatus === "CONFIRMED" ? "확정됨" : item.itemStatus === "CANCELED" ? "취소됨" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {ordersQuery.data && ordersQuery.data.totalPages > 1 && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  이전
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= ordersQuery.data.totalPages - 1}
                  className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
