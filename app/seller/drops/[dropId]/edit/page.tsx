"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { BackHeader } from "@/components/back-header";
import { ProductImageUpload } from "@/components/product-image-upload";
import { COLORS } from "@/lib/theme";
import * as dropApi from "@/lib/api/drop";
import { productImageUrl } from "@/lib/api/product";
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
 * DropInfoRequest.category가 @NotNull 필수라 안 보내면 C001로 수정 자체가 막힌다.
 * 판매자에게 무의미한 선택을 시키지 않기 위해 화면엔 안 보여주고 고정값만 실어 보낸다.
 */
const DROP_CATEGORY = "MEAL_BREADS" as const;

/** "2026-08-01T10:00:00" -> "2026-08-01T10:00" (datetime-local input이 받는 포맷) */
function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

export default function EditDropPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ dropId: string }>();
  const dropId = Number(params.dropId);

  // 판매자당 드롭 수가 적어 단건 조회 API 없이 목록에서 찾는 방식으로 처리한다.
  const myDropsQuery = useQuery({
    queryKey: ["myDrops"],
    queryFn: () => dropApi.getMyDrops(),
  });
  const drop = myDropsQuery.data?.find((d) => d.dropId === dropId) ?? null;

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
  const [initialized, setInitialized] = useState(false);
  const dropPeriodStart =
    dropStartDate && dropStartHour !== null
      ? `${dropStartDate}T${String(dropStartHour).padStart(2, "0")}:00`
      : "";

  useEffect(() => {
    function sync() {
      if (drop && !initialized) {
        setForm((f) => ({
          ...f,
          name: drop.name,
          description: drop.description,
          imageUrl: drop.imageUrl,
          price: String(drop.price),
          totalQuantity: String(drop.totalQuantity),
          limitQuantity: String(drop.limitQuantity),
        }));
        const [existingStartDate, existingStartTime] = toDatetimeLocal(drop.dropStart).split("T");
        setDropStartDate(existingStartDate ?? "");
        const existingStartHour = Number(existingStartTime?.slice(0, 2));
        setDropStartHour(
          DROP_START_HOURS.includes(existingStartHour as (typeof DROP_START_HOURS)[number])
            ? existingStartHour
            : null,
        );
        // 기존 데이터가 예전 방식(개별 날짜, 사이 날짜가 빠질 수 있음)으로 등록됐을 수 있어
        // 최솟값~최댓값을 범위로 되돌린다 — 저장 시 그 사이 모든 날짜로 다시 채워진다.
        const existing = [...drop.pickUpAvailableDates].sort();
        setPickupStart(existing[0] ?? "");
        setPickupEnd(existing[existing.length - 1] ?? "");
        setInitialized(true);
      }
    }
    sync();
  }, [drop, initialized]);

  const updateMutation = useMutation({
    mutationFn: () =>
      dropApi.updateDrop(dropId, {
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
    updateMutation.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="드롭 수정" href="/seller/dashboard" />

      {myDropsQuery.isLoading && (
        <p className="px-4 py-4 text-sm" style={{ color: COLORS.muted }}>
          불러오는 중...
        </p>
      )}
      {!myDropsQuery.isLoading && !drop && (
        <p className="px-4 py-4 text-sm" style={{ color: "#E0554F" }}>
          드롭을 찾을 수 없습니다.
        </p>
      )}

      {drop && (
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
            existingPreviewUrl={productImageUrl(form.imageUrl)}
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
          <p className="text-xs" style={{ color: COLORS.accent }}>
            ⚠️ 저장하면 남은 재고가 총 수량 값으로 초기화됩니다(이미 판매된 수량은 반영되지 않음).
          </p>

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

          {updateMutation.isError && (
            <p className="text-xs" style={{ color: "#E0554F" }}>
              {updateMutation.error instanceof ApiException
                ? updateMutation.error.message
                : "드롭 수정에 실패했습니다."}
            </p>
          )}

          <button
            type="submit"
            disabled={
              updateMutation.isPending ||
              isImageUploading ||
              !form.imageUrl ||
              !dropPeriodStart ||
              pickupDates.length === 0
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
