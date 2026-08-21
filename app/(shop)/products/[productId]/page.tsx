"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BackHeader } from "@/components/back-header";
import { COLORS } from "@/lib/theme";
import * as productApi from "@/lib/api/product";
import { ApiException } from "@/lib/api/types";
import { ProductDetailView } from "./product-detail-view";

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const productId = Number(params.productId);
  const productIdValid = Number.isFinite(productId) && productId > 0;

  const productQuery = useQuery({
    queryKey: ["product-info", productId],
    queryFn: () => productApi.getGeneralProduct(productId),
    enabled: productIdValid,
  });

  if (productIdValid && productQuery.data) {
    return <ProductDetailView productId={productId} product={productQuery.data} />;
  }

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <BackHeader title="상품 상세" href="/" />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          {!productIdValid
            ? "잘못된 접근입니다."
            : productQuery.isError
              ? productQuery.error instanceof ApiException
                ? productQuery.error.message
                : "상품 정보를 불러오지 못했습니다."
              : "불러오는 중..."}
        </p>
      </div>
    </div>
  );
}
