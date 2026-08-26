"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPin } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { getOrderDetail } from "@/lib/api/order";
import { fmtPickup } from "@/lib/format";

export function CompleteView() {
  const searchParams = useSearchParams();
  const orderId = Number(searchParams.get("orderId"));
  const orderIdValid = Number.isFinite(orderId) && orderId > 0;

  const orderQuery = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => getOrderDetail(orderId),
    enabled: orderIdValid,
  });
  const order = orderQuery.data;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: COLORS.greenSoft, border: `2px solid ${COLORS.green}` }}
      >
        <Check size={28} color={COLORS.green} />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2 font-serif" style={{ color: COLORS.text }}>
          결제 완료!
        </h1>
        <p className="text-sm" style={{ color: COLORS.muted }}>
          주문이 성공적으로 접수되었습니다
        </p>
      </div>

      {order && order.items.length > 0 && (
        <div className="w-full flex flex-col gap-3">
          {order.items.map((item) => (
            <div
              key={item.orderItemId}
              className="w-full p-4 rounded-xl"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex gap-3 mb-3">
                <BreadBox className="w-14 h-14 rounded-lg flex-shrink-0" src={item.imageUrl} label={item.productName} />
                <div>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {item.seller.sellerName ?? "판매자 정보 없음"}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {item.productName} {item.quantity}개
                  </p>
                  <p className="text-sm" style={{ color: COLORS.text }}>
                    {item.subtotal.toLocaleString()}원
                  </p>
                </div>
              </div>
              <div className="pt-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-2">
                  <MapPin size={13} color={COLORS.accent} />
                  <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {fmtPickup(item.pickUpDate)} 픽업
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div className="w-full flex justify-between px-1">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              총 결제 금액
            </span>
            <span className="text-sm font-bold" style={{ color: COLORS.text }}>
              {order.totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      <div className="w-full flex flex-col gap-2">
        <Link
          href="/orders"
          className="w-full py-3.5 rounded-lg text-sm font-bold text-center"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          주문 내역 보기
        </Link>
        <Link
          href="/"
          className="w-full py-3 rounded-lg text-sm text-center"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
