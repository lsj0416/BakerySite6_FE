"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { BackHeader } from "@/components/back-header";
import { COLORS } from "@/lib/theme";
import * as sellerApi from "@/lib/api/seller";
import * as dropApi from "@/lib/api/drop";
import * as productApi from "@/lib/api/product";
import * as settlementApi from "@/lib/api/settlement";
import * as sellerOrderApi from "@/lib/api/seller-order";
import { useAuth } from "@/lib/auth/auth-context";
import { fmtDateTime, fmtPickup } from "@/lib/format";
import { getBankName } from "@/lib/bank";
import { ApiException } from "@/lib/api/types";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import type { ApplicationStatus } from "@/lib/api/seller";
import type { DropApiStatus } from "@/lib/api/drop";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인 완료",
  REJECTED: "반려됨",
};

const DROP_STATUS_LABEL: Record<DropApiStatus, string> = {
  UPCOMING: "시작 전",
  ACTIVE: "진행 중",
  COMPLETED: "종료",
};

const DROP_TABS: { status: DropApiStatus; label: string }[] = [
  { status: "UPCOMING", label: "예정" },
  { status: "ACTIVE", label: "진행중" },
  { status: "COMPLETED", label: "종료" },
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SellerDashboardPage() {
  const { memberId } = useAuth();
  const queryClient = useQueryClient();
  const [dropTab, setDropTab] = useState<DropApiStatus>("UPCOMING");

  const sellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    enabled: memberId !== null,
    retry: false,
  });

  const noApplication =
    sellerQuery.isError &&
    sellerQuery.error instanceof ApiException &&
    sellerQuery.error.code === "C003";
  const seller = sellerQuery.data ?? null;
  const isApproved = seller?.applicationStatus === "APPROVED";

  const myDropsQuery = useQuery({
    queryKey: ["myDrops"],
    queryFn: () => dropApi.getMyDrops(),
    enabled: isApproved,
  });

  const myProductsQuery = useQuery({
    queryKey: ["myProducts"],
    queryFn: () => productApi.getMyProducts(0, 100),
    enabled: isApproved,
  });

  const settlementsQuery = useQuery({
    queryKey: ["mySettlements"],
    queryFn: settlementApi.getMySettlements,
    enabled: isApproved,
    retry: false,
  });

  const latestSettlement = settlementsQuery.data?.settlements.length
    ? [...settlementsQuery.data.settlements].sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0]
    : null;

  const pickupOrdersQuery = useQuery({
    queryKey: ["sellerOrders", "pickupSummary"],
    queryFn: () => sellerOrderApi.getSellerOrders({ size: 100 }),
    enabled: isApproved,
  });

  const activeItems =
    pickupOrdersQuery.data?.content
      .filter((o) => o.orderState !== "CANCELED")
      .flatMap((o) => o.items.filter((i) => i.itemStatus !== "CANCELED")) ?? [];
  const todayStr = toDateStr(new Date());
  const todayItems = activeItems.filter((i) => i.pickUpDate === todayStr);
  const todayQty = todayItems.reduce((s, i) => s + i.quantity, 0);

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const pickupChartData = next7Days.map((d) => {
    const dateStr = toDateStr(d);
    const cnt = activeItems.filter((i) => i.pickUpDate === dateStr).reduce((s, i) => s + i.quantity, 0);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, cnt, isToday: dateStr === todayStr };
  });
  const maxPickupCnt = Math.max(...pickupChartData.map((d) => d.cnt), 1);

  // "내 드롭" 목록과 같은 myDropsQuery를 재사용 — 별도 API 호출 없이 파생만 한다.
  const activeDrops = myDropsQuery.data?.filter((d) => d.dropStatus === "ACTIVE") ?? [];
  const nextUpcomingDrop = myDropsQuery.data
    ?.filter((d) => d.dropStatus === "UPCOMING")
    .sort((a, b) => a.dropStart.localeCompare(b.dropStart))[0];

  const deleteMutation = useMutation({
    mutationFn: (dropId: number) => dropApi.deleteDrop(dropId),
    // 삭제한 드롭이 홈/카테고리 목록(["upcoming-drops", ...])과 그 상세(["drop-info", dropId])
    // 캐시에 그대로 남아있으면, 삭제 직후 같은 세션에서 게스트/구매자 화면으로 이동했을 때
    // 이미 없는 드롭이 계속 보이거나(목록) 눌렀을 때 404로 깨진다(상세). invalidateQueries는
    // 접두 일치라 ["upcoming-drops"]로 넘겨도 ["upcoming-drops", 30] 등 파라미터가 붙은
    // 변형까지 전부 무효화된다.
    onSuccess: (_data, dropId) => {
      queryClient.invalidateQueries({ queryKey: ["myDrops"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-drops"] });
      queryClient.invalidateQueries({ queryKey: ["drop-info", dropId] });
    },
  });

  const productDeleteMutation = useMutation({
    mutationFn: (productId: number) => productApi.deleteProduct(productId),
    onSuccess: (_data, productId) => {
      queryClient.invalidateQueries({ queryKey: ["myProducts"] });
      queryClient.invalidateQueries({ queryKey: ["general-products"] });
      queryClient.invalidateQueries({ queryKey: ["product-info", productId] });
    },
  });

  function handleDelete(dropId: number) {
    if (window.confirm("이 드롭을 삭제하시겠습니까?")) {
      deleteMutation.mutate(dropId);
    }
  }

  function handleProductDelete(productId: number) {
    if (window.confirm("이 일반상품을 삭제하시겠습니까?")) {
      productDeleteMutation.mutate(productId);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="판매자 대시보드" href="/" />

      <div className="flex-1 px-4 py-4 flex flex-col gap-4">
        {sellerQuery.isPending && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {sellerQuery.isError && !noApplication && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            판매자 정보를 불러오지 못했습니다.
          </p>
        )}

        {noApplication && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              아직 판매자 입점 신청 내역이 없습니다.
            </p>
            <Link
              href="/seller/register"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: COLORS.accentSoft, color: COLORS.accent }}
            >
              입점 신청하기
            </Link>
          </div>
        )}

        {seller && (
          <div
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                {seller.bakeryName}
              </span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{
                  background:
                    seller.applicationStatus === "APPROVED"
                      ? COLORS.greenSoft
                      : seller.applicationStatus === "REJECTED"
                        ? "#1a1a1a"
                        : COLORS.accentSoft,
                  color:
                    seller.applicationStatus === "APPROVED"
                      ? COLORS.green
                      : seller.applicationStatus === "REJECTED"
                        ? COLORS.muted
                        : COLORS.accent,
                }}
              >
                {STATUS_LABEL[seller.applicationStatus]}
              </span>
            </div>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              사업자등록번호 {seller.businessNumber}
            </p>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              정산 계좌 {getBankName(seller.settlementBankCode)} {seller.settlementAccountNumberMasked}
              {seller.accountVerified ? " (인증됨)" : " (미인증)"}
            </p>
            {seller.applicationStatus === "REJECTED" && seller.rejectReason && (
              <p
                className="text-xs pt-2"
                style={{ color: "#E0554F", borderTop: `1px solid ${COLORS.border}` }}
              >
                반려 사유: {seller.rejectReason}
              </p>
            )}
          </div>
        )}

        {isApproved && (
          <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              드롭 현황
            </p>

            {myDropsQuery.isLoading && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}

            {!myDropsQuery.isLoading && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>
                    진행 중인 드롭
                  </span>
                  {activeDrops.length === 0 && (
                    <p className="text-sm" style={{ color: COLORS.muted }}>
                      진행 중인 드롭이 없습니다.
                    </p>
                  )}
                  {activeDrops.map((drop) => {
                    const sold = drop.totalQuantity - drop.remainQuantity;
                    const pct =
                      drop.totalQuantity > 0 ? Math.round((sold / drop.totalQuantity) * 100) : 0;
                    return (
                      <div key={drop.dropId} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: COLORS.text }}>
                            {drop.name}
                          </span>
                          <span className="text-xs" style={{ color: COLORS.muted }}>
                            판매 {sold}/{drop.totalQuantity} ({pct}%)
                          </span>
                        </div>
                        <div
                          className="w-full h-1.5 rounded-full overflow-hidden"
                          style={{ background: COLORS.accentSoft }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: COLORS.accent }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1 pt-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>
                    다음 드롭
                  </span>
                  {nextUpcomingDrop ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: COLORS.text }}>
                        {nextUpcomingDrop.name}
                      </span>
                      <span className="text-xs" style={{ color: COLORS.muted }}>
                        {fmtDateTime(nextUpcomingDrop.dropStart)} 시작
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: COLORS.muted }}>
                      예정된 드롭이 없습니다.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {isApproved && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Calendar size={15} color={COLORS.accent} />
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                오늘 픽업 예정 · {fmtPickup(todayStr)}
              </span>
            </div>
            {pickupOrdersQuery.isLoading && (
              <p className="px-4 py-3 text-sm" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}
            {!pickupOrdersQuery.isLoading && todayQty === 0 && (
              <p className="px-4 py-3 text-sm" style={{ color: COLORS.muted }}>
                오늘 픽업 예정 주문이 없습니다
              </p>
            )}
            {todayItems.map((i) => (
              <div
                key={i.orderItemId}
                className="flex justify-between items-center px-4 py-3"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <span className="text-sm" style={{ color: COLORS.text }}>
                  {i.productName}
                </span>
                <span className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                  {i.quantity}개
                </span>
              </div>
            ))}
            {todayQty > 0 && (
              <div
                className="flex justify-between items-center px-4 py-3"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  총
                </span>
                <span className="text-2xl font-bold" style={{ color: COLORS.text }}>
                  {todayQty}개
                </span>
              </div>
            )}
          </div>
        )}

        {isApproved && (
          <div
            className="p-4 rounded-xl"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <p className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>
              날짜별 픽업 집계
            </p>
            <div className="flex items-end gap-2" style={{ height: 80 }}>
              {pickupChartData.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[10px]" style={{ color: d.isToday ? COLORS.accent : COLORS.muted }}>
                    {d.cnt > 0 ? d.cnt : ""}
                  </span>
                  <div
                    className="w-full rounded-t-sm"
                    style={{
                      height: d.cnt > 0 ? `${(d.cnt / maxPickupCnt) * 52}px` : 4,
                      background: d.isToday ? COLORS.accent : COLORS.accentSoft,
                      minHeight: 4,
                    }}
                  />
                  <span className="text-[10px]" style={{ color: d.isToday ? COLORS.accent : COLORS.muted }}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isApproved && (
          <Link
            href="/seller/settlements"
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                최근 정산
              </span>
              {latestSettlement && <SettlementStatusBadge status={latestSettlement.status} />}
            </div>

            {settlementsQuery.isLoading && (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}
            {!settlementsQuery.isLoading && !latestSettlement && (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                아직 생성된 정산 내역이 없습니다.
              </p>
            )}
            {latestSettlement && (
              <div className="flex items-baseline justify-between">
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  {fmtPickup(latestSettlement.periodStart)} ~ {fmtPickup(latestSettlement.periodEnd)}
                </span>
                <span className="text-lg font-bold" style={{ color: COLORS.accent }}>
                  {latestSettlement.payoutAmount.toLocaleString()}원
                </span>
              </div>
            )}

            <span className="text-xs font-semibold" style={{ color: COLORS.accent }}>
              전체 정산 내역 보기 →
            </span>
          </Link>
        )}

        {isApproved && (
          <Link
            href="/seller/orders"
            className="w-full py-3 rounded-lg text-sm text-center"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            판매내역
          </Link>
        )}

        {isApproved && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                내 상품
              </span>
              <Link
                href="/seller/products/new"
                className="text-xs font-semibold"
                style={{ color: COLORS.accent }}
              >
                + 새 상품 등록
              </Link>
            </div>

            {myProductsQuery.isLoading && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}
            {myProductsQuery.isError && (
              <p className="text-sm" style={{ color: "#E0554F" }}>
                상품 목록을 불러오지 못했습니다.
              </p>
            )}
            {myProductsQuery.data?.content.length === 0 && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                등록한 일반상품이 없습니다.
              </p>
            )}

            {myProductsQuery.data?.content.map((product) => (
              <div
                key={product.productId}
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {product.name}
                  </span>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0"
                    style={{ background: COLORS.accentSoft, color: COLORS.accent }}
                  >
                    {productApi.PRODUCT_CATEGORY_LABEL[product.category]}
                  </span>
                </div>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  {product.price.toLocaleString()}원 · 재고 {product.remainQuantity}/
                  {product.totalQuantity}
                </p>

                <div className="flex gap-2 pt-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <Link
                    href={`/seller/products/${product.productId}/edit`}
                    className="flex-1 py-2 rounded-lg text-sm text-center"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    수정
                  </Link>
                  <button
                    onClick={() => handleProductDelete(product.productId)}
                    disabled={productDeleteMutation.isPending}
                    className="flex-1 py-2 rounded-lg text-sm disabled:opacity-60"
                    style={{ border: `1px solid ${COLORS.border}`, color: "#E0554F" }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}

            {productDeleteMutation.isError && (
              <p className="text-xs" style={{ color: "#E0554F" }}>
                {productDeleteMutation.error instanceof ApiException
                  ? productDeleteMutation.error.message
                  : "상품 삭제에 실패했습니다."}
              </p>
            )}
          </div>
        )}

        {isApproved && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                내 드롭
              </span>
              <Link
                href="/seller/drops/new"
                className="text-xs font-semibold"
                style={{ color: COLORS.accent }}
              >
                + 새 드롭 등록
              </Link>
            </div>

            {myDropsQuery.isLoading && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                불러오는 중...
              </p>
            )}
            {myDropsQuery.isError && (
              <p className="text-sm" style={{ color: "#E0554F" }}>
                드롭 목록을 불러오지 못했습니다.
              </p>
            )}

            {myDropsQuery.data && (
              <div className="flex gap-2">
                {DROP_TABS.map((tab) => (
                  <button
                    key={tab.status}
                    onClick={() => setDropTab(tab.status)}
                    className="px-3 py-1.5 rounded-full text-sm"
                    style={{
                      background: dropTab === tab.status ? COLORS.accent : COLORS.surface,
                      color: dropTab === tab.status ? COLORS.bg : COLORS.muted,
                      border: dropTab === tab.status ? "none" : `1px solid ${COLORS.border}`,
                      fontWeight: dropTab === tab.status ? 600 : 400,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {myDropsQuery.data?.filter((d) => d.dropStatus === dropTab).length === 0 && (
              <p className="text-sm" style={{ color: COLORS.muted }}>
                {DROP_TABS.find((t) => t.status === dropTab)?.label} 드롭이 없습니다.
              </p>
            )}

            {myDropsQuery.data
              ?.filter((d) => d.dropStatus === dropTab)
              .map((drop) => (
              <div
                key={drop.dropId}
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {drop.name}
                  </span>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded"
                    style={{ background: COLORS.accentSoft, color: COLORS.accent }}
                  >
                    {DROP_STATUS_LABEL[drop.dropStatus]}
                  </span>
                </div>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  {fmtDateTime(drop.dropStart)} ~ {fmtDateTime(drop.dropEnd)}
                </p>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  {drop.price.toLocaleString()}원 · 재고 {drop.remainQuantity}/{drop.totalQuantity}
                </p>

                {drop.dropStatus === "UPCOMING" && (
                  <div className="flex gap-2 pt-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <Link
                      href={`/seller/drops/${drop.dropId}/edit`}
                      className="flex-1 py-2 rounded-lg text-sm text-center"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                    >
                      수정
                    </Link>
                    <button
                      onClick={() => handleDelete(drop.dropId)}
                      disabled={deleteMutation.isPending}
                      className="flex-1 py-2 rounded-lg text-sm disabled:opacity-60"
                      style={{ border: `1px solid ${COLORS.border}`, color: "#E0554F" }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
