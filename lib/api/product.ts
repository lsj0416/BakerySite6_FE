import { apiRequest } from "@/lib/api/client";

export type ProductCategory =
  | "MEAL_BREADS"
  | "SWEET_BREADS"
  | "CAKES_TARTS"
  | "JAM_SPREAD"
  | "COOKIES_BAKES";

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  MEAL_BREADS: "식사빵",
  SWEET_BREADS: "간식빵",
  CAKES_TARTS: "케이크/타르트",
  JAM_SPREAD: "잼/스프레드",
  COOKIES_BAKES: "쿠키/구움과자",
};

export interface ProductInfoRequest {
  name: string;
  description: string;
  imageUrl: string;
  totalQuantity: number;
  price: number;
  pickUpAvailableDates: string[];
  category: ProductCategory;
}

export interface ProductInfoResponse extends ProductInfoRequest {
  productId: number;
  remainQuantity: number;
  type: "GENERAL" | "DROP";
}

export interface ProductPageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface ProductPagedModel {
  content: ProductInfoResponse[];
  page: ProductPageMetadata;
}

export interface ImageUploadUrlResponse {
  uploadUrl: string;
  key: string;
}

/**
 * 실제 SecurityConfig에는 products permitAll 규칙이 없으므로 이미지 URL 발급을 포함한
 * 모든 상품 API가 인증을 요구한다. 기본값 auth:true인 apiRequest를 그대로 사용한다.
 */
export function issueImageUploadUrl(contentType: string) {
  return apiRequest<ImageUploadUrlResponse>("/api/v1/products/image-upload-url", {
    method: "POST",
    body: { contentType },
  });
}

/**
 * S3 presigned URL은 백엔드 API가 아니다. Authorization을 붙이면 서명이 달라지므로
 * apiRequest를 거치지 않고 Content-Type만 포함한 raw fetch로 업로드한다.
 */
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`이미지 업로드에 실패했습니다. (${response.status})`);
  }
}

export function registerProduct(body: ProductInfoRequest) {
  return apiRequest<ProductInfoResponse>("/api/v1/products/register", {
    method: "POST",
    body,
  });
}

/** 수정 API는 현재 새 임시 이미지 key를 최종 경로로 promote하지 않는다. */
export function updateProduct(productId: number, body: ProductInfoRequest) {
  return apiRequest<ProductInfoResponse>(`/api/v1/products/${productId}`, {
    method: "PUT",
    body,
  });
}

/** 드롭 삭제와 달리 204가 아니라 ApiResponse<string>("삭제 완료")을 반환한다. */
export function deleteProduct(productId: number) {
  return apiRequest<string>(`/api/v1/products/${productId}`, { method: "DELETE" });
}

/**
 * 단일 상품 조회 API가 없어 수정 화면도 이 페이지 목록에서 상품을 찾는다.
 * 상품이 많은 판매자는 호출부에서 충분히 큰 size를 전달해야 한다.
 */
export function getMyProducts(page = 0, size = 20) {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  return apiRequest<ProductPagedModel>(`/api/v1/products/seller-product-list?${query}`);
}

export interface GetGeneralProductListParams {
  keyword?: string;
  category?: ProductCategory;
  page?: number;
  size?: number;
  /** 예: "id,desc" — Spring Pageable이 sort 쿼리 파라미터를 그대로 바인딩한다. */
  sort?: string;
}

/** GET /api/v1/products/product-list — 홈/카테고리 화면용 공개 목록. sort 기본값 category ASC. */
export function getGeneralProductList(params: GetGeneralProductListParams = {}) {
  const query = new URLSearchParams();
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.category) query.set("category", params.category);
  if (params.sort) query.set("sort", params.sort);
  query.set("page", String(params.page ?? 0));
  query.set("size", String(params.size ?? 20));
  return apiRequest<ProductPagedModel>(`/api/v1/products/product-list?${query}`, { auth: "optional" });
}

/**
 * GET /api/v1/products/{productId} — 상세. optional-auth라 게스트도 200을 받는다.
 * (shop) 레이아웃이 /products/* 를 비로그인에게 열어두므로 auth: "optional"이어야 한다
 * — 기본값(인증 필수)이면 게스트 상세 조회가 요청도 못 나가고 실패한다.
 */
export function getGeneralProduct(productId: number) {
  return apiRequest<ProductInfoResponse>(`/api/v1/products/${productId}`, { auth: "optional" });
}

const PRODUCT_IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL ??
  "https://team06-s3-bakerysite6.s3.ap-northeast-2.amazonaws.com";

/**
 * 백엔드 imageUrl은 전체 URL이 아닌 S3 key다. 버킷의 익명 GET이 막혀 있으면 조합된
 * URL도 403/404가 될 수 있으므로 배포 환경에서 공개 읽기 정책을 별도로 확인해야 한다.
 */
export function productImageUrl(key: string): string {
  if (!key || /^https?:\/\//i.test(key) || key.startsWith("blob:")) return key;
  return `${PRODUCT_IMAGE_BASE_URL.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}
