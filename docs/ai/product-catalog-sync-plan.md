# 일반상품(GENERAL) 쇼핑객 화면 연동 + 장바구니 API 동기화 계획

작성일: 2026-08-20
선행 문서: `docs/ai/product-integration-plan.md`(판매자 등록/수정/삭제/본인 목록, 완료됨 — 이 문서는 그 다음 단계인 "쇼핑객 화면 노출"을 다룸)
상태: 계획만 확정, 구현 착수 전.

## Context

백엔드에 일반상품(상시 판매, `type: GENERAL`) CRUD와 판매자 등록 화면(`app/seller/products/`)은 이미 구현돼 있지만, **쇼핑객이 보는 홈/카테고리 화면은 드롭만 조회하고 일반상품은 전혀 fetch하지 않는다.** 그래서 판매자가 상품을 등록해도(`category: MEAL_BREADS` 등으로 DB엔 정상 저장됨) 쇼핑객 화면엔 안 보인다.

조사 과정에서 이것과 별개로 **더 큰 문제**를 발견했다: 장바구니 도메인이 최근 "드롭 전용 단일 장바구니"에서 "일반상품 전용 다중 아이템 장바구니"(`/api/v1/cart/items`)로 완전히 리팩터링됐는데, **주문 생성(`OrderService.create()`)은 이 변경에 맞춰 갱신되지 않았다.** `CartClient.java`에 백엔드팀이 직접 남긴 TODO로 확인됨:

> "장바구니에 dropId가 없다... 항목이 여러 개다. CartInfo는 단일 항목을 전제한다... order 개편(후속 이슈)에서 다시 설계한다."

즉 지금은:
- **드롭 구매가 100% 깨져 있다** — `lib/api/cart.ts`의 `createCart()`가 호출하는 `POST /api/v1/cart`(구 API)가 백엔드에 더 이상 존재하지 않음(404). 드롭은 이제 장바구니를 거치지 않아야 하는데 그 대체 경로가 아직 없음.
- **일반상품 결제도 끝까지는 안 된다** — 장바구니 담기(`POST /cart/items`)까지는 정상 동작하지만, `POST /api/v1/orders`가 내부적으로 여전히 옛 단일-드롭 `CartInfo`(dropId 기반)를 기대하므로 실제 주문 생성 단계에서 실패한다.

이건 프론트에서 고칠 수 없는 백엔드 갭이고 백엔드팀도 "후속 이슈"로 이미 인지하고 있으므로, 이번 작업은 **주문 완료(결제) 이전까지**로 범위를 잡는다: 일반상품 노출(홈/카테고리) + 상세 페이지 + 장바구니 담기/조회/수정까지는 실제 동작하는 API만 쓰므로 정상 구현하고, 결제 버튼은 "준비 중"으로 명확히 막아 사용자가 실패를 겪지 않게 한다. 드롭 구매 플로우(`lib/api/cart.ts`의 기존 함수들, `drop-detail-view.tsx`)는 건드리지 않는다(이미 깨져 있고 원인이 백엔드라 FE 수정으로 고칠 수 없음) — 대신 `docs/backend-bug-reports-v2.md`에 새 항목으로 기록한다.

## 사전 확인 (구현 착수 전)

`docs/backend-bug-reports-v2.md`에 2026-08-18 기록된 §1(`POST /register` 400)·§2(`PUT /{id}` 500)·§4(presigned PUT 403) 리그레션이 지금(착수 시점)도 재현되는지 먼저 확인. 재현되면 실제 데이터로 화면을 검증할 수 없으므로(DB에 이미 있는 데이터는 API를 안 거치고 직접 시딩됐을 가능성), 조회 API(`GET /product-list`, `GET /{id}`) 자체는 이 버그들과 무관하니 구현은 그대로 진행하되, 검증은 기존 시딩 데이터로 대체한다.

## 변경 파일

### 1. `lib/api/product.ts` — 쇼핑객용 공개 조회 함수 추가 (기존 판매자용 함수는 그대로 둠)

```ts
export interface GetGeneralProductListParams {
  keyword?: string;
  category?: ProductCategory;
  page?: number;
  size?: number;
}

/** GET /api/v1/products/product-list — 홈/카테고리 화면용 공개 목록. sort 기본값 category ASC. */
export function getGeneralProductList(params: GetGeneralProductListParams = {}) {
  const query = new URLSearchParams();
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.category) query.set("category", params.category);
  query.set("page", String(params.page ?? 0));
  query.set("size", String(params.size ?? 20));
  return apiRequest<ProductPagedModel>(`/api/v1/products/product-list?${query}`);
}

/** GET /api/v1/products/{productId} — 상세. 인증 없이도 조회 가능하다고 문서화돼 있지만
 *  이 앱은 (shop) 레이아웃 가드로 어차피 로그인 사용자만 접근하므로 apiRequest 기본값 그대로 사용. */
export function getGeneralProduct(productId: number) {
  return apiRequest<ProductInfoResponse>(`/api/v1/products/${productId}`);
}
```

기존 `ProductPagedModel`/`ProductInfoResponse`/`ProductCategory`/`PRODUCT_CATEGORY_LABEL`/`productImageUrl`을 그대로 재사용.

### 2. `lib/api/cart.ts` — 새 다중 아이템 장바구니 API 추가 (기존 드롭 전용 함수는 손대지 않음)

`getCart()`/`Cart` 타입은 현재 아무 화면도 소비하지 않는 게 확인됐으므로(grep으로 검증 완료) 새 응답 구조로 교체해도 안전하다. `createCart`/`selectPickupDate`/`deleteCart`/`deleteCartBeacon`은 `drop-detail-view.tsx`/`order-view.tsx`가 여전히 참조하니 시그니처를 바꾸지 않는다(호출 시 404가 나겠지만 그건 백엔드가 아직 드롭용 대체 경로를 안 만들어서다 — 별도 이슈, 8번 참고).

```ts
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
  | "ORDERABLE" | "PRODUCT_DELETED" | "SOLD_OUT"
  | "INSUFFICIENT_STOCK" | "PICKUP_DATE_UNSELECTED" | "PICKUP_DATE_UNAVAILABLE";

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

// 기존 Cart 인터페이스/getCart() 구현을 아래로 교체.
export interface Cart {
  cartId: number | null;
  items: CartDetailItem[];
  totalAmount: number;
}
export function getCart() {
  return apiRequest<Cart>("/api/v1/cart");
}

export function updateCartItemQuantity(cartItemId: number, quantity: number) {
  return apiRequest<CartItem>(`/api/v1/cart/items/${cartItemId}/quantity`, { method: "PATCH", body: { quantity } });
}
export function updateCartItemPickupDate(cartItemId: number, pickUpDate: string) {
  return apiRequest<CartItem>(`/api/v1/cart/items/${cartItemId}/pickup-date`, { method: "PATCH", body: { pickUpDate } });
}
export function removeCartItem(cartItemId: number) {
  return apiRequest<void>(`/api/v1/cart/items/${cartItemId}`, { method: "DELETE" });
}
export function clearCartItems() {
  return apiRequest<void>("/api/v1/cart/items", { method: "DELETE" });
}
```

`apiRequest`의 `RequestOptions.method`가 현재 `"GET" | "POST" | "PATCH" | "DELETE"`만 허용하므로(`lib/api/client.ts`) 타입 확장 불필요.

### 3. `lib/catalog.ts` — `CatalogProduct`를 판별 유니온으로 확장

```ts
interface BaseCatalogProduct {
  id: number; name: string; description: string; imageUrl: string; price: number;
  remainQuantity: number; href: string;
}
export type CatalogProduct =
  | (BaseCatalogProduct & { kind: "DROP"; status: DropStatus; category: CategorySlug })
  | (BaseCatalogProduct & { kind: "GENERAL"; status: "ON_SALE" | "SOLD_OUT"; category: ProductCategory });
```

`dropToCatalogProduct()`는 `kind: "DROP"` 명시 추가 외 변경 없음. 새 함수 추가:

```ts
export function productToCatalogProduct(product: ProductInfoResponse): CatalogProduct {
  return {
    id: product.productId,
    name: product.name,
    description: product.description,
    imageUrl: productImageUrl(product.imageUrl),
    price: product.price,
    remainQuantity: product.remainQuantity,
    status: product.remainQuantity > 0 ? "ON_SALE" : "SOLD_OUT",
    category: product.category,
    href: `/products/${product.productId}`,
    kind: "GENERAL",
  };
}
```

**카테고리 체계는 통합하지 않는다.** 드롭용 6-slug 추론 체계(`CATEGORIES`/`inferCategory`)와 백엔드의 실제 `ProductCategory`(5종)를 억지로 매핑하면 정보 손실이 크다(예: `JAM_SPREAD`를 억지로 `gift`에 끼워 넣는 식). 대신 일반상품 필터링은 실제 백엔드 enum을 그대로 쓴다(아래 5번).

### 4. `components/product-card.tsx` — `kind`에 따라 배지/상태 텍스트 분기

```tsx
const badgeLabel = product.kind === "DROP" ? "한정 드롭" : "상시 판매";
const unavailable = product.status === "SOLD_OUT" || product.status === "CLOSED";
const statusText =
  product.kind === "DROP"
    ? product.status === "ON_SALE" ? `${product.remainQuantity}개 남음 · 매장 픽업`
      : product.status === "SCHEDULED" ? "오픈 예정 · 매장 픽업" : "판매 종료"
    : product.status === "ON_SALE" ? `${product.remainQuantity}개 남음 · 매장 픽업` : "품절";
```
마크업 구조/레이아웃은 그대로 재사용.

### 5. 쇼핑객 화면에 일반상품 노출

**`app/(shop)/page.tsx`(홈)**: 기존 두 섹션(AI 추천/LIMITED DROP)은 드롭 전용으로 그대로 두고, 그 사이에 **새 섹션 "상시 판매"** 추가:
```ts
const productsQuery = useQuery({ queryKey: ["general-products"], queryFn: () => productApi.getGeneralProductList({ size: 8 }) });
const generalProducts = useMemo(() => (productsQuery.data?.content ?? []).map(catalog.productToCatalogProduct), [productsQuery.data]);
```
드롭 섹션과 동일한 로딩/에러/빈 상태 패턴을 그대로 반복.

**`components/catalog-browser.tsx`**: 상단에 `kind` 토글(드롭 / 일반상품, 로컬 state)을 추가.
- `kind === "DROP"`이면 기존 로직 그대로(드롭 API + `CATEGORIES` 슬러그 칩).
- `kind === "GENERAL"`이면 `productApi.getGeneralProductList({ category: selectedCategory })`로 조회하고, 카테고리 칩은 `Object.entries(PRODUCT_CATEGORY_LABEL)`로 렌더링(백엔드 enum 그대로). `/categories/[slug]` URL의 `slug`는 드롭 전용 의미를 유지(변경 없음) — 일반상품 카테고리 필터는 URL에 반영하지 않고 컴포넌트 로컬 state로 충분(향후 필요하면 쿼리스트링으로 확장).

### 6. 일반상품 상세 페이지 신규 — `app/(shop)/products/[productId]/`

`app/(shop)/drops/[dropId]/page.tsx` + `drop-detail-view.tsx` 패턴을 그대로 따름(URL params → `useQuery` → 위임 컴포넌트, 로딩/에러/잘못된 접근 처리).

`page.tsx`: `useQuery(["product-info", productId], () => productApi.getGeneralProduct(productId))` → `<ProductDetailView product={...} productId={...} />`.

`product-detail-view.tsx` (신규, 드롭 상세 대비 단순함 — 대기열/카운트다운/락 로직 전부 불필요, 상시 판매라 항상 구매 가능 상태만 존재):
- 히어로 이미지, 이름/가격/설명, `remainQuantity` 표시.
- 픽업일 선택: `product.pickUpAvailableDates`에서 직접 선택(드롭처럼 장바구니 조회를 거칠 필요 없음 — 상세 응답에 이미 포함됨).
- 수량 선택(1 ~ `remainQuantity`, 드롭의 `limitQuantity` 같은 1인당 제한 없음 — 백엔드 응답에 그 필드 자체가 없음).
- "장바구니 담기" 버튼 → `cartApi.addCartItem({ productId, quantity, pickUpDate })`(`useMutation`) → 성공 시 `/cart`로 이동하거나 "장바구니에 담았습니다 · 장바구니 보기" 토스트/링크 표시.

### 7. 장바구니 페이지 신규 — `app/(shop)/cart/page.tsx`

- `useQuery(["cart"], cartApi.getCart)`로 `items` 렌더링(상품명/이미지/단가/수량/픽업일/`orderable`/`status`).
- 수량 변경(`updateCartItemQuantity`), 픽업일 변경(`updateCartItemPickupDate`), 항목 삭제(`removeCartItem`) — 각각 `useMutation` 후 `["cart"]` invalidate.
- `orderable === false` 항목은 카드에 `status`에 따른 안내 문구(품절/재고부족/픽업일 미선택 등) 표시하고 흐리게 처리(드롭 카드의 `unavailable` 패턴과 동일).
- **"주문하기" 버튼은 비활성 + "결제 기능은 준비 중입니다" 안내** — Context에서 설명한 백엔드 갭(`OrderService.create()`가 다중 아이템 장바구니를 아직 지원 안 함) 때문에 지금 연결해도 100% 실패한다. 활성화는 백엔드 후속 작업 완료 후 별도로 진행.

### 8. 문서 갱신

**`docs/backend-bug-reports-v2.md`**에 새 항목 추가(§5):
- `OrderService.create()`가 `CartPort`/`CartInfo`(옛 단일-드롭 계약)를 그대로 쓰고 있어, 다중 아이템 일반상품 장바구니로 주문 생성 시 항상 실패(첫 항목만 보고 `dropId=null`로 `dropPort.getDrop(null)` 호출 등)한다는 것.
- 드롭 구매 플로우(`POST /api/v1/cart` 등 구 API)가 `CartController` 리팩터링으로 전부 404난다는 것 — `lib/api/cart.ts`의 `createCart`/`selectPickupDate`/`deleteCart`가 현재 어떤 경로도 성공할 수 없음.
- 근거로 `CartClient.java`의 TODO 주석을 인용.

## 검증

1. `npx tsc --noEmit`, `npm run lint` 통과.
2. 로컬 백엔드 기동 후, 판매자 계정으로 상품이 이미 등록돼 있는 상태(사전 확인 단계에서 등록 리그레션이 재현 안 되면 직접 등록)에서 홈 화면에 "상시 판매" 섹션이 뜨는지 확인.
3. `/categories`에서 "일반상품" 토글 → 카테고리 칩(백엔드 enum 라벨)으로 필터링되는지 확인.
4. 상품 카드 클릭 → `/products/{id}` 상세 페이지 → 픽업일/수량 선택 → "장바구니 담기" → `/cart`에서 방금 담은 항목이 보이는지 확인(브라우저 Network 탭으로 `POST /cart/items` 201, `GET /cart` 200 확인).
5. `/cart`에서 수량/픽업일 변경, 항목 삭제가 실제로 반영되는지 확인. "주문하기" 버튼이 비활성 상태로 명확한 안내를 보여주는지 확인(백엔드 갭이므로 실제 결제 성공까지는 검증 대상 아님).
6. 드롭 상세 페이지(`/drops/[dropId]`)가 이번 변경으로 컴파일/동작에 영향받지 않는지 확인(`lib/api/cart.ts`의 기존 함수 시그니처 불변이므로 회귀 없어야 함).
