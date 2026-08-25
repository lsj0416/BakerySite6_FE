import { apiRequest } from "@/lib/api/client";
import type { OrderHistoryState, OrderItemStatus } from "@/lib/api/order";

export interface SellerOrderItem {
  orderItemId: number;
  productId: number;
  /** 드롭 주문에서만 채워짐. */
  dropId: number | null;
  productName: string;
  quantity: number;
  subtotal: number;
  pickUpDate: string;
  itemStatus: OrderItemStatus;
  confirmedAt: string | null;
}

/** 판매자 판매내역 한 줄. 자기 항목만 담기고 금액도 자기 몫 소계(sellerAmount)다. */
export interface SellerOrderSummaryResponse {
  orderId: number;
  buyerName: string;
  orderState: OrderHistoryState;
  sellerAmount: number;
  paidAt: string | null;
  canceledAt: string | null;
  items: SellerOrderItem[];
}

export interface SellerOrderPageResponse {
  content: SellerOrderSummaryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface GetSellerOrdersParams {
  orderState?: OrderHistoryState;
  page?: number;
  size?: number;
}

/** 판매자 본인 판매내역 목록 조회(최신순). 판매자로 등록되지 않은 계정은 403. */
export function getSellerOrders(params: GetSellerOrdersParams = {}) {
  const query = new URLSearchParams();
  if (params.orderState) query.set("orderState", params.orderState);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.size !== undefined) query.set("size", String(params.size));
  const qs = query.toString();
  return apiRequest<SellerOrderPageResponse>(`/api/v1/sellers/me/orders${qs ? `?${qs}` : ""}`);
}
