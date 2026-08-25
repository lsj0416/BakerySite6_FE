"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { OrderStatusBadge } from "@/components/order-status-badge";
import * as orderApi from "@/lib/api/order";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { fmtDateTime, fmtPickup, getDDay } from "@/lib/format";

type FilterKey = "전체" | orderApi.OrderHistoryState;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "PAID", label: "픽업대기" },
  { key: "CANCELED", label: "취소" },
];

export default function OrderListPage() {
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [page, setPage] = useState(0);

  const ordersQuery = useQuery({
    queryKey: ["orders", filter, page],
    queryFn: () =>
      orderApi.getOrders({
        orderState: filter === "전체" ? undefined : filter,
        page,
        size: 10,
      }),
  });

  function changeFilter(f: FilterKey) {
    setFilter(f);
    setPage(0);
  }

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <div className="px-4 pb-4 flex-shrink-0" style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}>
        <h1 className="text-xl font-bold" style={{ color: COLORS.text }}>
          주문 내역
        </h1>
      </div>

      <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-0.5 flex-shrink-0">
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

      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pb-4">
        {ordersQuery.isLoading && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {ordersQuery.isError && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            주문 내역을 불러오지 못했습니다.
          </p>
        )}
        {ordersQuery.data?.content.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              주문 내역이 없습니다
            </p>
          </div>
        )}

        {ordersQuery.data?.content.map((order) => {
          const dDay = getDDay(order.nearestPickUpDate);
          const productLabel =
            order.otherItemCount > 0
              ? `${order.representativeProductName} 외 ${order.otherItemCount}건`
              : order.representativeProductName;
          return (
            <Link
              key={order.orderId}
              href={`/orders/${order.orderId}`}
              className="w-full text-left rounded-xl p-4 block"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex justify-between items-center mb-2.5">
                <OrderStatusBadge status={ORDER_STATUS_LABEL[order.orderState]} />
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  {fmtDateTime(order.paidAt)} 결제
                </span>
              </div>
              <div className="flex gap-3 items-center mb-3">
                <BreadBox className="w-12 h-12 rounded-lg flex-shrink-0" label={order.representativeProductName} />
                <div>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {order.representativeSellerName}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {productLabel} · {order.totalQuantity}개
                  </p>
                  <p className="text-sm" style={{ color: COLORS.text }}>
                    {order.totalAmount.toLocaleString()}원
                  </p>
                </div>
              </div>
              <div
                className="flex items-center justify-between pt-3"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} color={COLORS.muted} />
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    {fmtPickup(order.nearestPickUpDate)} 픽업
                  </span>
                </div>
                {order.orderState !== "CANCELED" && (
                  <span
                    className="text-xl font-bold"
                    style={{ color: dDay === 0 ? COLORS.accent : COLORS.text }}
                  >
                    {dDay < 0 ? "픽업완료" : dDay === 0 ? "오늘 픽업!" : `D-${dDay}`}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

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
      </div>
    </div>
  );
}
