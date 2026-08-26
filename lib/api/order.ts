import { apiRequest } from "@/lib/api/client";

export type OrderLifecycleState = "PENDING" | "PAID" | "CANCELED" | "FAILED" | "EXPIRED";

export type OrderItemStatus = "UNCONFIRMED" | "CONFIRMED" | "CANCELED";

export type SalesType = "GENERAL" | "DROP";

/** 장바구니 경로 — 담아둔 항목으로 주문. 항목마다 이미 픽업일이 붙어 있어 별도로 보내지 않음. */
export interface CartOrderCreateRequest {
  cartItemIds: number[];
  productId?: never;
  quantity?: never;
  dropId?: never;
  pickUpDate?: never;
}

/** 바로구매 경로 — 상품 상세에서 장바구니 없이 바로 주문. */
export interface DirectOrderCreateRequest {
  productId: number;
  quantity: number;
  pickUpDate: string;
  cartItemIds?: never;
  dropId?: never;
}

/** 드롭 경로 — lock-start로 선점을 마친 뒤 주문. 수량/가격은 서버가 선점값을 읽으므로 보내지 않음. */
export interface DropOrderCreateRequest {
  dropId: number;
  pickUpDate: string;
  cartItemIds?: never;
  productId?: never;
  quantity?: never;
}

/**
 * 셋 중 정확히 하나의 경로만 보낼 수 있음(백엔드가 어떤 필드가 채워졌는지로 경로를 판별,
 * 둘 이상이면 400 C001). 각 경로별 인터페이스가 다른 경로의 필드를 `never`로 막아
 * 타입 레벨에서 잘못된 조합을 구성할 수 없게 한다.
 */
export type OrderCreateRequest =
  | CartOrderCreateRequest
  | DirectOrderCreateRequest
  | DropOrderCreateRequest;

export interface OrderCreateResponseItem {
  orderItemId: number;
  productName: string;
  imageUrl: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  pickUpDate: string;
}

export interface OrderCreateResponse {
  orderId: number;
  orderState: OrderLifecycleState;
  totalAmount: number;
  reservationExpiresAt: string;
  items: OrderCreateResponseItem[];
  /** 드롭 우선권으로 자동 만료시킨 기존 진행 중 주문 ID. 없으면 null. */
  yieldedOrderId: number | null;
}

/** 주문서 생성(PENDING) — 아직 결제 아님. 회원당 진행 중 주문 1건 제한(초과 시 OR006). */
export function createPendingOrder(body: OrderCreateRequest) {
  return apiRequest<OrderCreateResponse>("/api/v1/orders", {
    method: "POST",
    body,
  });
}

export interface OrderPayRequest {
  termsAgreed: boolean;
}

export type OrderPayOutcome =
  | "PAID"
  | "PAYMENT_FAILED"
  | "OUT_OF_STOCK"
  | "PAYMENT_REVERSED"
  | "PROCESSING";

export interface OrderPayResponse {
  orderId: number;
  orderState: OrderLifecycleState;
  outcome: OrderPayOutcome;
  totalAmount: number;
  balanceAfter: number | null;
  paidAt: string | null;
  message: string | null;
}

/** 결제(예치금 차감). 약관 동의는 여기서 받음(주문서 생성 시점엔 아직 동의 전). */
export function payOrder(orderId: number, body: OrderPayRequest) {
  return apiRequest<OrderPayResponse>(`/api/v1/orders/${orderId}/pay`, {
    method: "POST",
    body,
  });
}

export interface OrderDetailResponseSeller {
  sellerId: number;
  sellerName: string | null;
  address: string | null;
  phoneNumber: string | null;
}

export interface OrderDetailResponseItem {
  orderItemId: number;
  productId: number;
  /** 드롭 주문에서만 채워짐. */
  dropId: number | null;
  productName: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  pickUpDate: string;
  itemStatus: OrderItemStatus;
  confirmedAt: string | null;
  seller: OrderDetailResponseSeller;
}

export interface OrderDetailResponse {
  orderId: number;
  orderState: OrderLifecycleState;
  salesType: SalesType;
  items: OrderDetailResponseItem[];
  totalAmount: number;
  createdAt: string;
  paidAt: string | null;
  canceledAt: string | null;
  /** PENDING일 때만 의미 있음. */
  reservationExpiresAt: string | null;
}

/** 진행 중(PENDING) 주문 조회. 없으면 data가 null(정상 상태, 오류 아님). */
export function getPendingOrder() {
  return apiRequest<OrderDetailResponse | null>("/api/v1/orders/pending");
}

/** 주문 상세 재조회(GET /orders/{orderId}). 본인 주문만, 타인 주문이면 403. */
export function getOrderDetail(orderId: number) {
  return apiRequest<OrderDetailResponse>(`/api/v1/orders/${orderId}`);
}

export interface OrderCancelResponse {
  orderId: number;
  orderState: OrderLifecycleState;
  refundAmount: number;
  balanceAfter: number | null;
  endedAt: string;
}

/**
 * 주문 취소. 서버가 상태로 갈라 처리 — PENDING이면 즉시 EXPIRED(환불 없음, 드롭이면
 * 재고 복구), PAID면 전액 환불 후 CANCELED. 항목이 하나라도 구매확정됐으면 OR002.
 */
export function cancelOrder(orderId: number) {
  return apiRequest<OrderCancelResponse>(`/api/v1/orders/${orderId}/cancel`, {
    method: "PATCH",
  });
}

export interface OrderConfirmResponse {
  orderId: number;
  orderItemId: number;
  itemStatus: OrderItemStatus;
  confirmedAt: string;
}

/** 항목 단위 구매확정(판매자). 주문이 아니라 orderItemId를 확정함. 남의 항목이면 403. */
export function confirmOrderItem(orderItemId: number) {
  return apiRequest<OrderConfirmResponse>(`/api/v1/orders/items/${orderItemId}/confirm`, {
    method: "PATCH",
  });
}

/**
 * 주문 목록(GET /orders)에 필터로 줄 수 있는 상태. PENDING/FAILED/EXPIRED는 이 화면에
 * 노출하지 않는 상태라 백엔드가 필터로도 받아주지 않음(OR008). PENDING은 별도 화면
 * (getPendingOrder)이고, FAILED/EXPIRED는 "주문한 적 없는" 것으로 취급해 노출 안 함.
 */
export type OrderHistoryState = "PAID" | "CANCELED";

/** 항목이 여럿이면 대표 상품명 + 나머지 건수로 줄여 보여주는 목록 한 줄. */
export interface OrderSummaryResponse {
  orderId: number;
  representativeProductName: string;
  /** 대표 상품을 뺀 나머지 항목 수. 0이면 단일 항목 주문. */
  otherItemCount: number;
  representativeSellerName: string;
  /** 모든 항목의 수량 합. */
  totalQuantity: number;
  totalAmount: number;
  orderState: OrderHistoryState;
  /** 가장 이른 픽업 날짜. 항목마다 다를 수 있음. */
  nearestPickUpDate: string;
  paidAt: string;
}

export interface OrderPageResponse {
  content: OrderSummaryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface GetOrdersParams {
  orderState?: OrderHistoryState;
  page?: number;
  size?: number;
}

/** 주문 목록(최신순). PAID/CANCELED만 나옴 — 구매확정 여부는 상세의 항목별 itemStatus로 확인. */
export function getOrders(params: GetOrdersParams = {}) {
  const query = new URLSearchParams();
  if (params.orderState) query.set("orderState", params.orderState);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.size !== undefined) query.set("size", String(params.size));
  const qs = query.toString();
  return apiRequest<OrderPageResponse>(`/api/v1/orders${qs ? `?${qs}` : ""}`);
}
