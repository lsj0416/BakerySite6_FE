"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/back-header";
import { ProductImageUpload } from "@/components/product-image-upload";
import { COLORS } from "@/lib/theme";
import * as productApi from "@/lib/api/product";
import * as sellerApi from "@/lib/api/seller";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiException } from "@/lib/api/types";
import { expandDateRange } from "@/lib/format";

const inputClass = "w-full px-4 py-3 rounded-lg text-sm outline-none";
const inputStyle = {
  background: COLORS.surface,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

export default function NewProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { memberId } = useAuth();

  const mySellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    enabled: memberId !== null,
    retry: false,
  });

  useEffect(() => {
    if (mySellerQuery.isPending) return;
    if (mySellerQuery.data?.applicationStatus !== "APPROVED") {
      router.replace("/seller/dashboard");
    }
  }, [mySellerQuery.isPending, mySellerQuery.data, router]);

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
  const [isImageUploading, setIsImageUploading] = useState(false);
  const pickupDates = expandDateRange(pickupStart, pickupEnd);

  const registerMutation = useMutation({
    mutationFn: () =>
      productApi.registerProduct({
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
    registerMutation.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="일반상품 등록" href="/seller/dashboard" />

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
          onUploaded={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))}
          onUploadingChange={setIsImageUploading}
        />

        <div className="flex gap-2">
          <input
            required
            type="number"
            min={1}
            placeholder="가격"
            value={form.price}
            onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
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

        {registerMutation.isError && (
          <p className="text-xs" style={{ color: "#E0554F" }}>
            {registerMutation.error instanceof ApiException
              ? registerMutation.error.message
              : "일반상품 등록에 실패했습니다."}
          </p>
        )}

        <button
          type="submit"
          disabled={
            registerMutation.isPending || isImageUploading || !form.imageUrl || pickupDates.length === 0
          }
          className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          {registerMutation.isPending ? "등록 중..." : isImageUploading ? "이미지 업로드 중..." : "등록"}
        </button>
      </form>
    </div>
  );
}
