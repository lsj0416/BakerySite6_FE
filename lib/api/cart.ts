import { apiRequest } from "@/lib/api/client";
import { getTokens } from "@/lib/auth/token-storage";

export interface CreateCartRequest {
  dropId: number;
  quantity: number;
}

export interface CreateCartResponse {
  cartId: number;
  dropId: number;
  quantity: number;
  expiresAt: string;
  createdAt: string;
}

/** lock-start로 재고를 먼저 선점한 뒤 호출해야 함 — 안 그러면 CA006. */
export function createCart(req: CreateCartRequest) {
  return apiRequest<CreateCartResponse>("/api/v1/cart", {
    method: "POST",
    body: req,
  });
}

export interface SelectPickupDateResponse {
  cartId: number;
  pickupDate: string;
}

export function selectPickupDate(pickupDate: string) {
  return apiRequest<SelectPickupDateResponse>("/api/v1/cart/pickup-date", {
    method: "PATCH",
    body: { pickupDate },
  });
}

/** 성공 시 204 No Content — 재고도 함께 복구됨. */
export function deleteCart() {
  return apiRequest<void>("/api/v1/cart", { method: "DELETE" });
}

/**
 * 탭 종료/하드 새로고침처럼 페이지 언로드 중에 쏘는 장바구니 삭제 요청(= 재고 선점 해제).
 * apiRequest는 401 재시도·JSON 파싱 등을 하는데, 언로드 시점엔 응답을 기다릴 수 없으므로
 * fetch를 keepalive로 직접 호출하는 fire-and-forget 방식으로 별도 구현한다.
 * (SPA 내 이동으로 컴포넌트가 언마운트되는 경우는 이 함수 대신 deleteCart()를 그대로 쓰면 됨 —
 * 그때는 페이지가 살아있어서 응답을 기다려도 문제없음.)
 */
export function deleteCartBeacon() {
  const stored = getTokens();
  if (!stored) return;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  fetch(`${base}/api/v1/cart`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${stored.accessToken}` },
    keepalive: true,
  }).catch(() => {});
}

// --- 일반상품 다중 아이템 장바구니 (/api/v1/cart/items) ---
// 위 드롭 전용 단일 장바구니(POST /api/v1/cart 등)와는 별개 도메인이다. 백엔드가
// 최근 다중 아이템 장바구니로 리팩터링하면서 드롭용 구 API를 대체하지 않고 남겨뒀는데,
// 그 구 API는 이제 전부 404가 난다(docs/backend-bug-reports-v2.md §5 참고).

export interface AddCartItemRequest {
  productId: number;
  quantity: number;
  pickUpDate?: string; // YYYY-MM-DD, 담을 때는 생략 가능
}

export interface CartItem {
  cartId: number;
  cartItemId: number;
  productId: number;
  quantity: number;
  pickUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export function addCartItem(body: AddCartItemRequest) {
  return apiRequest<CartItem>("/api/v1/cart/items", { method: "POST", body });
}

export type CartItemStatus =
  | "ORDERABLE"
  | "PRODUCT_DELETED"
  | "SOLD_OUT"
  | "INSUFFICIENT_STOCK"
  | "PICKUP_DATE_UNSELECTED"
  | "PICKUP_DATE_UNAVAILABLE";

export interface CartDetailItem {
  cartItemId: number;
  productId: number;
  sellerId: number;
  productName: string | null;
  bakeryName: string;
  imageUrl: string;
  price: number;
  addedPrice: number | null;
  priceChanged: boolean;
  quantity: number;
  estimatedAmount: number;
  pickUpDate: string | null;
  pickUpAvailableDates: string[];
  remainQuantity: number;
  orderable: boolean;
  status: CartItemStatus;
}

export interface Cart {
  cartId: number | null;
  items: CartDetailItem[];
  totalAmount: number;
}

export function getCart() {
  return apiRequest<Cart>("/api/v1/cart");
}

export function updateCartItemQuantity(cartItemId: number, quantity: number) {
  return apiRequest<CartItem>(`/api/v1/cart/items/${cartItemId}/quantity`, {
    method: "PATCH",
    body: { quantity },
  });
}

export function updateCartItemPickupDate(cartItemId: number, pickUpDate: string) {
  return apiRequest<CartItem>(`/api/v1/cart/items/${cartItemId}/pickup-date`, {
    method: "PATCH",
    body: { pickUpDate },
  });
}

export function removeCartItem(cartItemId: number) {
  return apiRequest<void>(`/api/v1/cart/items/${cartItemId}`, { method: "DELETE" });
}

export function clearCartItems() {
  return apiRequest<void>("/api/v1/cart/items", { method: "DELETE" });
}
