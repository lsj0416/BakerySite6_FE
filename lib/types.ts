import type { DropApiStatus } from "@/lib/api/drop";
import type { OrderItemStatus, OrderLifecycleState } from "@/lib/api/order";

export type DropStatus = "SCHEDULED" | "ON_SALE" | "SOLD_OUT" | "CLOSED";
export type OrderStatus =
  | "진행중"
  | "픽업대기"
  | "구매확정"
  | "일부확정"
  | "취소"
  | "결제실패"
  | "만료";

/** 백엔드 dropStatus(UPCOMING/ACTIVE/COMPLETED)를 화면 표시용 상태로 변환. */
export function toDropStatus(apiStatus: DropApiStatus, remainQuantity: number): DropStatus {
  if (apiStatus === "UPCOMING") return "SCHEDULED";
  if (apiStatus === "COMPLETED") return "CLOSED";
  return remainQuantity > 0 ? "ON_SALE" : "SOLD_OUT";
}

/**
 * 주문 전체 상태 표시용. 백엔드엔 주문 단위 "구매확정" 상태가 없음 — 확정은 항목
 * (OrderItem) 단위라 주문은 PAID를 유지한다. 그래서 PAID는 여기서 일단 "픽업대기"로
 * 옮기고, 항목이 확정된 주문은 화면에서 `orderConfirmStatus`로 "구매확정"/"일부확정"
 * 배지로 덮어쓴다(목록·상세 모두 항목별 itemStatus를 따로 읽어야 함).
 */
export const ORDER_STATUS_LABEL: Record<OrderLifecycleState, OrderStatus> = {
  PENDING: "진행중",
  PAID: "픽업대기",
  CANCELED: "취소",
  FAILED: "결제실패",
  EXPIRED: "만료",
};

/**
 * 주문 항목들의 구매확정 상황 요약.
 *
 * 취소된 항목은 "확정할 대상"이 아니므로 분모에서 뺀다. 확정된 항목이 하나도 없으면
 * null — 그때는 주문 상태 라벨(픽업대기 등)을 그대로 쓰면 된다.
 */
export function summarizeItemConfirmation(
  items: { itemStatus: OrderItemStatus }[],
): { status: Extract<OrderStatus, "구매확정" | "일부확정">; confirmed: number; total: number } | null {
  const active = items.filter((item) => item.itemStatus !== "CANCELED");
  const confirmed = active.filter((item) => item.itemStatus === "CONFIRMED").length;
  if (active.length === 0 || confirmed === 0) return null;
  return {
    status: confirmed === active.length ? "구매확정" : "일부확정",
    confirmed,
    total: active.length,
  };
}
