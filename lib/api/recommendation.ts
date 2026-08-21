import { apiRequest } from "@/lib/api/client";
import type { ProductCategory } from "@/lib/api/product";

export type RecommendationStrategy = "PERSONALIZED" | "POPULAR" | "LATEST";
export type RecommendationReasonCode =
  | "SIMILAR_TO_VIEWED"
  | "SIMILAR_TO_CART"
  | "SIMILAR_TO_PURCHASED"
  | "PREFERRED_CATEGORY"
  | "POPULAR"
  | "LATEST";

export interface RecommendationItem {
  productId: number;
  name: string;
  imageUrl: string;
  price: number;
  category: ProductCategory;
  remainQuantity: number;
  reasonCode: RecommendationReasonCode;
}

export interface RecommendationResult {
  strategy: RecommendationStrategy;
  items: RecommendationItem[];
}

/**
 * GET /api/v1/recommendations?size=1~20(기본 10). 인증 필요(로그인 회원 ID로 개인화).
 * ai-service 장애 시 503 AI_RECOMMENDATION_UNAVAILABLE — apiRequest가 ApiException으로 던짐,
 * 호출부에서 반드시 isError를 부드럽게 처리할 것(추천은 "있으면 좋은" 섹션이라 에러를 크게
 * 노출하지 않는다). 응답엔 항상 GENERAL 타입 상품만 담긴다(드롭은 추천 후보에서 제외됨 — 백엔드
 * 설계, 버그 아님).
 */
export function getRecommendations(size?: number) {
  const query = size !== undefined ? `?size=${size}` : "";
  return apiRequest<RecommendationResult>(`/api/v1/recommendations${query}`);
}
