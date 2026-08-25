"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Phone } from "lucide-react";
import { BackHeader } from "@/components/back-header";
import { BreadBox } from "@/components/bread-box";
import { COLORS } from "@/lib/theme";
import * as orderApi from "@/lib/api/order";
import { ApiException } from "@/lib/api/types";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { fmtDateTime, fmtPickup, getDDay } from "@/lib/format";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderId = Number(params.orderId);
  const orderIdValid = Number.isFinite(orderId) && orderId > 0;

  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderApi.getOrderDetail(orderId),
    enabled: orderIdValid,
  });

  const cancelMutation = useMutation({
    mutationFn: () => orderApi.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-account"] });
      router.push("/orders");
    },
  });

  const order = orderQuery.data;

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <BackHeader title="주문 상세" href="/orders" />

      {!orderIdValid && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: COLORS.muted }}>
            잘못된 접근입니다.
          </p>
        </div>
      )}
      {orderIdValid && orderQuery.isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        </div>
      )}
      {orderIdValid && orderQuery.isError && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: "#E0554F" }}>
            {orderQuery.error instanceof ApiException
              ? orderQuery.error.message
              : "주문 정보를 불러오지 못했습니다."}
          </p>
        </div>
      )}

      {order &&
        (() => {
          const canCancel =
            order.orderState === "PAID" && order.items.every((item) => item.itemStatus !== "CONFIRMED");
          return (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="mx-4 mt-4 flex items-center justify-between">
                  <span
                    className="text-sm font-semibold px-2 py-1 rounded"
                    style={{ background: COLORS.accentSoft, color: COLORS.accent }}
                  >
                    {ORDER_STATUS_LABEL[order.orderState]}
                  </span>
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    {order.totalAmount.toLocaleString()}원 · {order.items.length}개 상품
                  </span>
                </div>

                {order.items.map((item) => {
                  const dDay = getDDay(item.pickUpDate);
                  return (
                    <div
                      key={item.orderItemId}
                      className="mx-4 mt-3 p-4 rounded-xl"
                      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                    >
                      <div className="flex gap-3">
                        <BreadBox className="w-14 h-14 rounded-lg flex-shrink-0" label={item.productName} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs" style={{ color: COLORS.muted }}>
                            {item.seller.sellerName ?? "판매자 정보 없음"}
                          </p>
                          <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                            {item.productName} {item.quantity}개
                          </p>
                          <p className="text-sm" style={{ color: COLORS.text }}>
                            {item.subtotal.toLocaleString()}원
                          </p>
                          <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
                            {fmtPickup(item.pickUpDate)} 픽업
                            {order.orderState === "PAID" &&
                              (dDay < 0 ? " · 픽업완료" : dDay === 0 ? " · 오늘 픽업!" : ` · D-${dDay}`)}
                          </p>
                          <p
                            className="mt-1 text-xs font-semibold"
                            style={{ color: item.itemStatus === "CONFIRMED" ? COLORS.green : COLORS.muted }}
                          >
                            {item.itemStatus === "CONFIRMED"
                              ? `구매확정됨${item.confirmedAt ? ` · ${fmtDateTime(item.confirmedAt)}` : ""}`
                              : item.itemStatus === "CANCELED"
                                ? "취소된 항목"
                                : "구매확정 전"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.seller.address!)}`,
                              "_blank",
                            )
                          }
                          disabled={!item.seller.address}
                          className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                          style={{ border: `1.5px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          <MapPin size={12} /> 지도 보기
                        </button>
                        <button
                          onClick={() => {
                            window.location.href = `tel:${item.seller.phoneNumber}`;
                          }}
                          disabled={!item.seller.phoneNumber}
                          className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                          style={{ border: `1.5px solid ${COLORS.border}`, color: COLORS.text }}
                        >
                          <Phone size={12} /> 전화하기
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div
                  className="mx-4 mt-3 mb-4 p-4 rounded-xl"
                  style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                >
                  <p className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>
                    결제 정보
                  </p>
                  {[
                    ["결제 금액", `${order.totalAmount.toLocaleString()}원`],
                    ["결제 수단", "예치금"],
                    ...(order.paidAt ? [["결제 일시", fmtDateTime(order.paidAt)]] : []),
                    ...(order.canceledAt ? [["취소 일시", fmtDateTime(order.canceledAt)]] : []),
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1.5">
                      <span className="text-sm" style={{ color: COLORS.muted }}>
                        {l}
                      </span>
                      <span className="text-sm" style={{ color: COLORS.text }}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>

                {order.orderState === "CANCELED" && (
                  <div
                    className="mx-4 mb-4 p-4 rounded-xl text-center"
                    style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                  >
                    <p className="text-sm" style={{ color: COLORS.muted }}>
                      취소된 주문입니다. 예치금이 환불되었습니다.
                    </p>
                  </div>
                )}

                {cancelMutation.isError && (
                  <p className="text-xs text-center mb-3 px-4" style={{ color: "#E0554F" }}>
                    {cancelMutation.error instanceof ApiException
                      ? cancelMutation.error.message
                      : "주문 취소에 실패했습니다."}
                  </p>
                )}
              </div>

              {canCancel && (
                <div
                  className="px-4 py-3 flex-shrink-0"
                  style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
                >
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="w-full py-3 rounded-lg text-sm font-medium disabled:opacity-60"
                    style={{ border: `1.5px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    {cancelMutation.isPending ? "취소 처리 중..." : "주문 취소"}
                  </button>
                </div>
              )}
            </>
          );
        })()}
    </div>
  );
}
