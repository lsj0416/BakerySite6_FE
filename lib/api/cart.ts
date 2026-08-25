import { apiRequest } from "@/lib/api/client";

// --- 일반상품 다중 아이템 장바구니 (/api/v1/cart/items) ---
// 드롭 전용 단일 장바구니(POST /api/v1/cart 등)는 백엔드가 다중 아이템 장바구니로
// 리팩터링하면서 삭제됐다(404). 드롭 주문은 이제 lock-start 이후 카트를 거치지 않고
// POST /api/v1/orders {dropId}로 바로 주문서를 만든다(app/(shop)/drops/[dropId]/drop-detail-view.tsx).

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
