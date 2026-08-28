"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { OrderStatusBadge } from "@/components/order-status-badge";
import * as orderApi from "@/lib/api/order";
import { productImageUrl } from "@/lib/api/product";
import { ORDER_STATUS_LABEL, summarizeItemConfirmation } from "@/lib/types";
import { fmtDateTime, fmtPickup, getDDay } from "@/lib/format";

/**
 * 화면 탭.
 *
 * 백엔드 주문 목록 필터는 PAID/CANCELED 둘뿐이고(OR008), "구매확정"은 주문 상태가 아니라
 * 항목(orderItem) 단위 상태다 — 확정돼도 주문은 PAID로 남는다. 그래서 확정 탭은 서버에
 * PAID를 그대로 요청하고, 항목 상태로 이 화면에서 갈라낸다.
 */
type FilterKey = "전체" | "픽업대기" | "구매확정" | "취소";
type ConfirmFilter = "confirmed" | "unconfirmed";

const PAGE_SIZE = 10;

/**
 * 확정 탭이 쓰는 페이지 크기(= 서버 상한 50, 넘겨도 서버가 50으로 자름).
 *
 * 확정 여부는 서버가 걸러줄 수 없어 받아온 페이지 안에서 이 화면이 거른다. 그래서 한 번에
 * 10건만 받으면 그 10건 중 조건에 맞는 것만 남아 페이지마다 보이는 수가 들쭉날쭉해지고,
 * 10건 전부 조건에 안 맞으면 빈 페이지가 된다. 상한까지 받아두면 결제 주문이 50건 이하인
 * 동안은 페이지가 아예 한 장이라 그 현상이 생기지 않는다.
 */
const CONFIRM_FILTER_PAGE_SIZE = 50;

const FILTERS: {
  key: FilterKey;
  label: string;
  orderState?: orderApi.OrderHistoryState;
  confirm?: ConfirmFilter;
}[] = [
  { key: "전체", label: "전체" },
  { key: "픽업대기", label: "픽업대기", orderState: "PAID", confirm: "unconfirmed" },
  { key: "구매확정", label: "구매확정", orderState: "PAID", confirm: "confirmed" },
  { key: "취소", label: "취소", orderState: "CANCELED" },
];

export default function OrderListPage() {
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [page, setPage] = useState(0);

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const confirmFilter = activeFilter.confirm;
  const size = confirmFilter ? CONFIRM_FILTER_PAGE_SIZE : PAGE_SIZE;

  const ordersQuery = useQuery({
    queryKey: ["orders", activeFilter.orderState ?? "전체", size, page],
    queryFn: () =>
      orderApi.getOrders({
        orderState: activeFilter.orderState,
        page,
        size,
      }),
  });

  /**
   * 목록 요약(OrderSummaryResponse)에는 구매확정 정보가 아예 없다 — 구매확정은 항목
   * (orderItem) 단위이고 확정돼도 주문 상태는 PAID 그대로라, 목록만으로는 픽업 전 주문과
   * 구매확정된 주문을 구별할 방법이 없었다(둘 다 "픽업대기"로 보였다).
   * 그래서 PAID 주문에 한해 상세를 함께 불러 항목별 itemStatus를 읽는다. 캐시 키를 상세
   * 화면과 같게(["order", id]) 두어, 목록에서 눌러 들어간 상세는 다시 받지 않는다.
   */
  const paidOrderIds = (ordersQuery.data?.content ?? [])
    .filter((order) => order.orderState === "PAID")
    .map((order) => order.orderId);

  const detailQueries = useQueries({
    queries: paidOrderIds.map((orderId) => ({
      queryKey: ["order", orderId],
      queryFn: () => orderApi.getOrderDetail(orderId),
      staleTime: 60_000,
    })),
  });

  // 상세 조회가 실패하거나 아직 안 왔으면 해당 주문은 그냥 기존 라벨로 보여준다(목록
  // 자체는 이미 떠 있으므로 확정 표시가 늦게 붙을 뿐, 화면이 막히지는 않는다).
  const confirmationByOrderId = new Map(
    paidOrderIds.flatMap((orderId, i) => {
      const items = detailQueries[i]?.data?.items;
      const summary = items ? summarizeItemConfirmation(items) : null;
      return summary ? [[orderId, summary] as const] : [];
    }),
  );

  /**
   * 확정 탭의 실제 목록. 상세를 다 받기 전에 거르면 방금 보이던 주문이 사라졌다 나타나므로,
   * 상세가 도착할 때까지는 목록 대신 로딩만 보여준다. 상세를 끝내 못 받은 주문은
   * "확정 안 됨"으로 취급한다(적어도 픽업대기 탭에서는 보이므로 목록에서 사라지지 않는다).
   */
  const detailsPending = confirmFilter !== undefined && detailQueries.some((q) => q.isPending);
  const visibleOrders = (ordersQuery.data?.content ?? []).filter((order) => {
    if (!confirmFilter) return true;
    const confirmed = confirmationByOrderId.has(order.orderId);
    return confirmFilter === "confirmed" ? confirmed : !confirmed;
  });
  // 결제 주문이 50건을 넘어 페이지가 여러 장일 때만, 이 페이지에서 전부 걸러졌을 수 있다.
  const hasMorePages = (ordersQuery.data?.totalPages ?? 0) > page + 1;

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
        {(ordersQuery.isLoading || detailsPending) && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {ordersQuery.isError && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            주문 내역을 불러오지 못했습니다.
          </p>
        )}
        {ordersQuery.data && !detailsPending && visibleOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {filter === "구매확정"
                ? "구매확정된 주문이 없습니다"
                : filter === "픽업대기"
                  ? "픽업 대기 중인 주문이 없습니다"
                  : "주문 내역이 없습니다"}
            </p>
            {confirmFilter && hasMorePages && (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                다음 페이지에 더 있을 수 있어요.
              </p>
            )}
          </div>
        )}

        {!detailsPending &&
          visibleOrders.map((order) => {
            const dDay = getDDay(order.nearestPickUpDate);
            const confirmation = confirmationByOrderId.get(order.orderId);
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
                  <OrderStatusBadge status={confirmation?.status ?? ORDER_STATUS_LABEL[order.orderState]} />
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    {fmtDateTime(order.paidAt)} 결제
                  </span>
                </div>
                <div className="flex gap-3 items-center mb-3">
                  <BreadBox
                    className="w-12 h-12 rounded-lg flex-shrink-0"
                    src={productImageUrl(order.representativeImageUrl)}
                    label={order.representativeProductName}
                  />
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
                      {confirmation?.status === "일부확정" &&
                        ` · ${confirmation.confirmed}/${confirmation.total} 구매확정`}
                    </span>
                  </div>
                  {order.orderState !== "CANCELED" && (
                    <span
                      className="text-xl font-bold"
                      style={{
                        color:
                          confirmation?.status === "구매확정"
                            ? COLORS.green
                            : dDay === 0
                              ? COLORS.accent
                              : COLORS.text,
                      }}
                    >
                      {/* 구매확정은 판매자가 픽업을 확인했다는 뜻이라 날짜와 무관하게 픽업 완료다. */}
                      {confirmation?.status === "구매확정"
                        ? "픽업완료"
                        : dDay < 0
                          ? "픽업완료"
                          : dDay === 0
                            ? "오늘 픽업!"
                            : `D-${dDay}`}
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
