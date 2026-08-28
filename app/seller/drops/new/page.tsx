"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/back-header";
import { ProductImageUpload } from "@/components/product-image-upload";
import { COLORS } from "@/lib/theme";
import * as dropApi from "@/lib/api/drop";
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

/** 드롭 시작 시간은 매장 운영 시간대 안에서만 오픈할 수 있도록 이 값들로 제한한다. */
const DROP_START_HOURS = [9, 11, 13, 15, 17] as const;

/**
 * 드롭은 개념적으로 카테고리가 없는데(일반상품과 달리 세트/한정판 성격) 백엔드
 * DropInfoRequest.category가 @NotNull 필수라 안 보내면 C001로 등록 자체가 막힌다.
 * 판매자에게 무의미한 선택을 시키지 않기 위해 화면엔 안 보여주고 고정값만 실어 보낸다.
 */
const DROP_CATEGORY = "MEAL_BREADS" as const;

export default function NewDropPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { memberId } = useAuth();

  const mySellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    enabled: memberId !== null,
    retry: false,
  });

  // 승인된 판매자가 아니면 드롭을 등록할 수 없다(백엔드 C002) — 대시보드로 돌려보낸다.
  // isPending을 써야 한다 — enabled:false인 동안엔 isLoading이 false로 평가돼(fetch를
  // 시작조차 안 했으므로), memberId가 아직 안 채워진 첫 렌더에 data===undefined를
  // "미승인"으로 오판해 곧장 리다이렉트해버리는 버그가 났었다(2026-07-28 브라우저 검증).
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
    limitQuantity: "",
  });
  const [dropStartDate, setDropStartDate] = useState("");
  const [dropStartHour, setDropStartHour] = useState<number | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [pickupStart, setPickupStart] = useState("");
  const [pickupEnd, setPickupEnd] = useState("");
  const pickupDates = expandDateRange(pickupStart, pickupEnd);
  const dropPeriodStart =
    dropStartDate && dropStartHour !== null
      ? `${dropStartDate}T${String(dropStartHour).padStart(2, "0")}:00`
      : "";

  const registerMutation = useMutation({
    mutationFn: () =>
      dropApi.registerDrop({
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl,
        pickUpAvailableDates: pickupDates,
        dropStart: `${dropPeriodStart}:00`,
        category: DROP_CATEGORY,
        limitQuantity: Number(form.limitQuantity),
        price: Number(form.price),
        totalQuantity: Number(form.totalQuantity),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myDrops"] });
      router.push("/seller/dashboard");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.imageUrl || isImageUploading || !dropPeriodStart) return;
    registerMutation.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="드롭 등록" href="/seller/dashboard" />

      <form onSubmit={handleSubmit} className="flex-1 px-4 py-4 flex flex-col gap-3">
        <input
          required
          placeholder="상품명"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        />
        <textarea
          required
          placeholder="상품 설명"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        />
        <ProductImageUpload
          onUploaded={(imageUrl) => setForm((f) => ({ ...f, imageUrl }))}
          onUploadingChange={setIsImageUploading}
        />

        <div className="flex gap-2">
          <input
            required
            type="number"
            min={1}
            placeholder="가격"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          />
          <input
            required
            type="number"
            min={1}
            placeholder="총 수량"
            value={form.totalQuantity}
            onChange={(e) => setForm((f) => ({ ...f, totalQuantity: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          />
          <input
            required
            type="number"
            min={1}
            placeholder="1인당 제한 수량"
            value={form.limitQuantity}
            onChange={(e) => setForm((f) => ({ ...f, limitQuantity: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: COLORS.muted }}>
            드롭 시작 날짜
          </label>
          <input
            required
            type="date"
            value={dropStartDate}
            onChange={(e) => setDropStartDate(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: COLORS.muted }}>
            드롭 시작 시간
          </label>
          <div className="flex gap-2">
            {DROP_START_HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => setDropStartHour(hour)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{
                  background: dropStartHour === hour ? COLORS.accent : COLORS.surface,
                  color: dropStartHour === hour ? COLORS.bg : COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                {hour}시
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: COLORS.muted }}>
            픽업 가능 기간 (드롭 마감일 이후여야 함)
          </label>
          <div className="flex gap-2 items-center">
            <input
              required
              type="date"
              value={pickupStart}
              onChange={(e) => setPickupStart(e.target.value)}
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
              onChange={(e) => setPickupEnd(e.target.value)}
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
              : "드롭 등록에 실패했습니다."}
          </p>
        )}

        <button
          type="submit"
          disabled={
            registerMutation.isPending ||
            isImageUploading ||
            !form.imageUrl ||
            !dropPeriodStart ||
            pickupDates.length === 0
          }
          className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          {registerMutation.isPending ? "등록 중..." : isImageUploading ? "이미지 업로드 중..." : "드롭 등록"}
        </button>
      </form>
    </div>
  );
}
