import type { DropApiStatus } from "@/lib/api/drop";
import type { OrderLifecycleState } from "@/lib/api/order";

export type DropStatus = "SCHEDULED" | "ON_SALE" | "SOLD_OUT" | "CLOSED";
export type OrderStatus = "진행중" | "픽업대기" | "취소" | "결제실패" | "만료";

/** 백엔드 dropStatus(UPCOMING/ACTIVE/COMPLETED)를 화면 표시용 상태로 변환. */
export function toDropStatus(apiStatus: DropApiStatus, remainQuantity: number): DropStatus {
  if (apiStatus === "UPCOMING") return "SCHEDULED";
  if (apiStatus === "COMPLETED") return "CLOSED";
  return remainQuantity > 0 ? "ON_SALE" : "SOLD_OUT";
}

/**
 * 주문 전체 상태 표시용. 백엔드엔 주문 단위 "구매확정" 상태가 없음 — 확정은 항목
 * (OrderItem) 단위라 주문은 PAID를 유지한다. 항목별 확정 여부는 상세 화면에서
 * itemStatus/confirmedAt으로 따로 표시한다.
 */
export const ORDER_STATUS_LABEL: Record<OrderLifecycleState, OrderStatus> = {
  PENDING: "진행중",
  PAID: "픽업대기",
  CANCELED: "취소",
  FAILED: "결제실패",
  EXPIRED: "만료",
};
