"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { BackHeader } from "@/components/back-header";
import { ProductImageUpload } from "@/components/product-image-upload";
import { COLORS } from "@/lib/theme";
import * as productApi from "@/lib/api/product";
import { ApiException } from "@/lib/api/types";
import { expandDateRange } from "@/lib/format";

const inputClass = "w-full px-4 py-3 rounded-lg text-sm outline-none";
const inputStyle = {
  background: COLORS.surface,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

export default function EditProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ productId: string }>();
  const productId = Number(params.productId);

  // 백엔드에 단일 조회 API가 없으므로 넉넉한 페이지 크기로 본인 목록을 받아 찾는다.
  const myProductsQuery = useQuery({
    queryKey: ["myProducts"],
    queryFn: () => productApi.getMyProducts(0, 100),
  });
  const product = myProductsQuery.data?.content.find((item) => item.productId === productId) ?? null;

  const [form, setForm] = useState({
    name: "",
    description: "",
    imageUrl: "",
    price: "",
    totalQuantity: "",
    category: "MEAL_BREADS" as productApi.ProductCategory,
  });
  const [pickupStart, setPickupStart] = useState("");
  const [pickupEnd, setPickupEnd] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageChanged, setIsImageChanged] = useState(false);
  const pickupDates = expandDateRange(pickupStart, pickupEnd);

  useEffect(() => {
    function syncProduct() {
      if (!product || initialized) return;

      setForm({
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        price: String(product.price),
        totalQuantity: String(product.totalQuantity),
        category: product.category,
      });
      const existingDates = [...product.pickUpAvailableDates].sort();
      setPickupStart(existingDates[0] ?? "");
      setPickupEnd(existingDates[existingDates.length - 1] ?? "");
      setInitialized(true);
    }
    syncProduct();
  }, [product, initialized]);

  const updateMutation = useMutation({
    mutationFn: () =>
      productApi.updateProduct(productId, {
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl,
        price: Number(form.price),
        totalQuantity: Number(form.totalQuantity),
        pickUpAvailableDates: pickupDates,
        category: form.category,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myProducts"] });
      router.push("/seller/dashboard");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.imageUrl || isImageUploading) return;
    updateMutation.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="일반상품 수정" href="/seller/dashboard" />

      {myProductsQuery.isLoading && (
        <p className="px-4 py-4 text-sm" style={{ color: COLORS.muted }}>
          불러오는 중...
        </p>
      )}
      {myProductsQuery.isError && (
        <p className="px-4 py-4 text-sm" style={{ color: "#E0554F" }}>
          상품 목록을 불러오지 못했습니다.
        </p>
      )}
      {!myProductsQuery.isLoading && !myProductsQuery.isError && !product && (
        <p className="px-4 py-4 text-sm" style={{ color: "#E0554F" }}>
          상품을 찾을 수 없습니다. 상품이 100개를 넘는 경우 목록 첫 페이지에서는 수정할 수 없습니다.
        </p>
      )}

      {product && (
        <form onSubmit={handleSubmit} className="flex-1 px-4 py-4 flex flex-col gap-3">
          <input
            required
            placeholder="상품명"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className={inputClass}
            style={inputStyle}
          />
          <textarea
            required
            placeholder="상품 설명"
            rows={3}
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className={inputClass}
            style={inputStyle}
          />

          <ProductImageUpload
            existingPreviewUrl={productApi.productImageUrl(product.imageUrl)}
            onUploaded={(imageUrl) => {
              setForm((current) => ({ ...current, imageUrl }));
              setIsImageChanged(true);
            }}
            onUploadingChange={setIsImageUploading}
          />
          {isImageChanged && (
            <p className="text-xs" style={{ color: COLORS.accent }}>
              ⚠️ 현재 백엔드는 수정 시 새 이미지를 최종 경로로 옮기지 않습니다. 저장 후 임시 이미지가
              정리되면 화면에서 보이지 않을 수 있습니다.
            </p>
          )}

          <div className="flex gap-2">
            <input
              required
              type="number"
              min={1}
              placeholder="가격"
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
              className={inputClass}
              style={inputStyle}
            />
            <input
              required
              type="number"
              min={1}
              placeholder="총 수량"
              value={form.totalQuantity}
              onChange={(event) =>
                setForm((current) => ({ ...current, totalQuantity: event.target.value }))
              }
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: COLORS.muted }}>
              카테고리
            </label>
            <select
              required
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as productApi.ProductCategory,
                }))
              }
              className={inputClass}
              style={inputStyle}
            >
              {Object.entries(productApi.PRODUCT_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: COLORS.muted }}>
              픽업 가능 기간
            </label>
            <div className="flex gap-2 items-center">
              <input
                required
                type="date"
                value={pickupStart}
                onChange={(event) => setPickupStart(event.target.value)}
                className={inputClass}
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: COLORS.muted }}>
                ~
              </span>
              <input
                required
                type="date"
                value={pickupEnd}
                onChange={(event) => setPickupEnd(event.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              {pickupDates.length > 0
                ? `${pickupDates.length}일간(${pickupDates[0]} ~ ${pickupDates[pickupDates.length - 1]}) 매일 픽업 가능`
                : "종료일이 시작일보다 빠를 수 없습니다."}
            </p>
          </div>

          {updateMutation.isError && (
            <p className="text-xs" style={{ color: "#E0554F" }}>
              {updateMutation.error instanceof ApiException
                ? updateMutation.error.message
                : "일반상품 수정에 실패했습니다."}
            </p>
          )}

          <button
            type="submit"
            disabled={
              updateMutation.isPending || isImageUploading || !form.imageUrl || pickupDates.length === 0
            }
            className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            {updateMutation.isPending ? "저장 중..." : isImageUploading ? "이미지 업로드 중..." : "저장"}
          </button>
        </form>
      )}
    </div>
  );
}
