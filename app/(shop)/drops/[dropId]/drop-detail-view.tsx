"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, Heart, MapPin, Minus, Plus } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { DropBadge } from "@/components/drop-badge";
import { ProductCard } from "@/components/product-card";
import { useAuth } from "@/lib/auth/auth-context";
import * as dropApi from "@/lib/api/drop";
import * as recommendationApi from "@/lib/api/recommendation";
import { createPendingOrder, getPendingOrder } from "@/lib/api/order";
import { ApiException } from "@/lib/api/types";
import { toDropStatus } from "@/lib/types";
import { recommendationItemToCatalogProduct } from "@/lib/catalog";
import { pad, msToHMS, fmtDateTime, fmtPickup } from "@/lib/format";
import {
  EMPTY_WISHLIST,
  getWishlist,
  subscribeWishlist,
  toggleWishlist,
} from "@/lib/wishlist/wishlist-storage";

export function DropDetailView({ dropId, drop }: { dropId: number; drop: dropApi.DropInfo }) {
  const router = useRouter();
  const { memberId, isAuthenticated } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const wishlist = useSyncExternalStore(
    subscribeWishlist,
    () => (memberId !== null ? getWishlist(memberId) : EMPTY_WISHLIST),
    () => EMPTY_WISHLIST,
  );
  const isHearted = wishlist.includes(dropId);

  const status = toDropStatus(drop.dropStatus, drop.remainQuantity);
  const pct = drop.totalQuantity > 0 ? (drop.remainQuantity / drop.totalQuantity) * 100 : 0;

  const target =
    status === "SCHEDULED" ? new Date(drop.dropStart).getTime() : new Date(drop.dropEnd).getTime();
  const cd = msToHMS(target - now.getTime());

  // 수량/픽업일은 대기열에 들어가기 전, 상세 페이지에서 먼저 고른다 — 대기열 통과 후
  // lock-start 시점에 이 값을 그대로 실어 보낸다(재고 확인·선점은 여전히 lock-start가 함).
  const maxQty = Math.max(1, Math.min(drop.limitQuantity, drop.remainQuantity));
  const [qty, setQty] = useState(1);
  const [pickupDate, setPickupDate] = useState<string | null>(null);
  // 백엔드가 Set<LocalDate>로 내려줘서 순서가 보장 안 됨 — ISO 날짜 문자열이라 그냥 정렬하면 된다.
  const sortedPickupDates = [...drop.pickupDates].sort();
  // 첫 날짜를 기본 선택값으로 자동 지정하지 않는다 — 유저가 직접 골라야 구매하기가 눌린다.
  const effectivePickupDate = pickupDate;

  // 입장이 확정되자마자 상세 페이지에서 고른 수량만큼 재고를 바로 선점하고, 그 자리에서
  // PENDING 주문서까지 만든다 — lock-start만 해두고 주문을 안 만든 상태는 만료 배치가
  // 회수하지 못하는 유일한 구멍이라(OrderExpirationScheduler 주석 참고), 그 구멍을
  // 최소화하려면 이동 전에 주문 생성까지 같은 호출 체인 안에서 끝내야 한다. 이후 화면은
  // orderId만으로 서버 상태를 다시 조회하므로, URL에는 qty/금액을 아예 싣지 않는다.
  const reserveMutation = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!effectivePickupDate) throw new ApiException("OR005", "픽업 날짜를 선택해야 합니다.");
      await dropApi.lockStart(dropId, qty);

      try {
        const created = await createPendingOrder({ dropId, pickUpDate: effectivePickupDate });
        return created.orderId;
      } catch (err) {
        // OR006(DUPLICATE_REQUEST) = 이미 진행 중인 주문이 있어 새로 못 만듦. 자동으로
        // 결제·취소하지 않고, GET /orders/pending으로 실제로 같은 드롭 주문인지만 확인한다.
        if (!(err instanceof ApiException) || err.code !== "OR006") throw err;

        const pending = await getPendingOrder();
        const sameDropItem =
          pending?.salesType === "DROP" ? pending.items.find((item) => item.dropId === dropId) : undefined;

        if (pending && sameDropItem) return pending.orderId;

        throw new ApiException(
          "OR006",
          "다른 진행 중인 주문이 있어 이 드롭을 새로 주문할 수 없습니다. 주문 내역에서 기존 주문을 먼저 확인해주세요.",
        );
      }
    },
    onSuccess: (orderId) => {
      router.push(`/order?orderId=${orderId}`);
    },
  });

  // 대기열이 삭제되면서 "구매하기" 클릭이 곧바로 confirm-entry 호출이 됨(더 이상 enterQueue/
  // getQueueRank 2단계를 거치지 않음). 성공하면 바로 재고 선점(reserveMutation)으로 이어간다.
  const confirmMutation = useMutation({
    mutationFn: () => dropApi.confirmEntry(dropId),
    onSuccess: () => reserveMutation.mutate(),
  });

  const confirmErrorCode =
    confirmMutation.error instanceof ApiException ? confirmMutation.error.code : null;

  // DR006(ALREADY_ENTERED)은 단순 재입장이 아니라 이미 재고를 선점(RESERVED)했거나 구매를
  // 완료(COMPLETED)한 경우에만 뜬다(DropEnterService.confirmEntry 참고 — ENTERED 상태의 재입장은
  // 서버가 그냥 성공 처리함). 재고 선점까지 갔었다면 진행 중 주문이 남아있을 수 있어
  // GET /orders/pending으로 실제로 이어갈 게 있는지 확인한다(성공을 가장하지 않기 위함).
  const pendingOrderAfterAlreadyEnteredQuery = useQuery({
    queryKey: ["pending-order", "drop-detail-dr006"],
    queryFn: () => getPendingOrder(),
    enabled: confirmErrorCode === "DR006",
  });

  // DR008(DROP_NOT_ACTIVE)은 판매 전 / 판매 마감 / 품절(드롭이 COMPLETED로 바뀐 경우)을
  // 서버가 전부 같은 코드로 묶어서 던진다(DropEnterService.confirmEntry의 isAccessible 체크 —
  // 코드 자체는 원인을 구분해 주지 않음). 이 버튼은 status==="ON_SALE"일 때만 눌리므로,
  // 화면에 이미 있는 판매 시작/마감 시각과 비교해 어느 쪽인지 최선으로 구분해 안내한다.
  const dr008Message =
    now.getTime() < new Date(drop.dropStart).getTime()
      ? "아직 판매가 시작되지 않았습니다."
      : now.getTime() >= new Date(drop.dropEnd).getTime()
        ? "판매가 마감되었습니다."
        : "재고가 모두 소진되었습니다.";

  // 이 드롭의 진행 중 주문인지는 salesType과 items[].dropId를 모두 봐야 안다 — 존재 여부만으로는
  // 전혀 무관한 다른 진행 주문(다른 드롭·일반상품)까지 "이 드롭 주문"으로 잘못 안내할 수 있다.
  const pendingOrderIsForThisDrop =
    pendingOrderAfterAlreadyEnteredQuery.data?.salesType === "DROP" &&
    pendingOrderAfterAlreadyEnteredQuery.data.items.some((item) => item.dropId === dropId);

  const confirmErrorMessage =
    confirmErrorCode === "DR006"
      ? pendingOrderAfterAlreadyEnteredQuery.isLoading
        ? "이미 참여한 드롭입니다. 진행 상태를 확인하는 중..."
        : pendingOrderIsForThisDrop
          ? "이미 이 드롭의 진행 중인 주문이 있습니다. 주문 내역에서 이어서 진행해주세요."
          : "이미 참여했거나 구매가 완료된 드롭입니다."
      : confirmErrorCode === "DR008"
        ? dr008Message
        : confirmMutation.error instanceof ApiException
          ? confirmMutation.error.message
          : "입장에 실패했습니다.";

  // 추천 API는 로그인 필요 — 비회원은 상세는 볼 수 있어도 추천 섹션은 숨긴다.
  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", 3],
    queryFn: () => recommendationApi.getRecommendations(3),
    enabled: isAuthenticated,
  });
  const recommendations = useMemo(
    () => (recommendationsQuery.data?.items ?? []).map(recommendationItemToCatalogProduct),
    [recommendationsQuery.data],
  );

  const purchasing = confirmMutation.isPending || reserveMutation.isPending;

  const purchaseErrorMessage = confirmMutation.isError
    ? confirmErrorMessage
    : reserveMutation.isError
      ? reserveMutation.error instanceof ApiException
        ? reserveMutation.error.message
        : "재고 선점에 실패했습니다."
      : null;

  return (
    <div
      className="mx-auto w-full max-w-[1200px] flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start lg:gap-10 lg:px-6 lg:py-8"
      style={{ background: COLORS.bg }}
    >
      {/* Hero */}
      <div className="relative h-[300px] flex-shrink-0 lg:sticky lg:top-[164px] lg:row-span-2 lg:h-[620px] lg:overflow-hidden lg:rounded-[28px]">
        <BreadBox
          label={drop.name}
          className="absolute inset-0"
          src={drop.imageUrl}
          dim={status === "SOLD_OUT" || status === "CLOSED"}
        />

        {status === "SCHEDULED" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: "rgba(0,0,0,0.58)" }}
          >
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
              오픈까지
            </p>
            <span className="text-5xl font-bold tabular-nums font-mono" style={{ color: "#fff" }}>
              {pad(cd.h)}:{pad(cd.m)}:{pad(cd.s)}
            </span>
          </div>
        )}
        {status === "ON_SALE" && (
          <div
            className="absolute bottom-0 left-0 right-0 flex justify-between items-center px-4 py-2.5"
            style={{ background: "rgba(0,0,0,0.62)" }}
          >
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>
              판매 마감까지
            </span>
            <span className="text-sm font-bold tabular-nums font-mono" style={{ color: COLORS.accent }}>
              {pad(cd.h)}:{pad(cd.m)}:{pad(cd.s)}
            </span>
          </div>
        )}
        {(status === "SOLD_OUT" || status === "CLOSED") && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.68)" }}
          >
            <div style={{ transform: "rotate(-12deg)" }}>
              <span
                className="text-2xl font-black tracking-[0.18em]"
                style={{
                  color: COLORS.disabled,
                  border: `3px solid ${COLORS.disabled}`,
                  padding: "8px 14px",
                  display: "block",
                }}
              >
                {status === "SOLD_OUT" ? "SOLD OUT" : "판매 종료"}
              </span>
            </div>
          </div>
        )}

        {/* ON_SALE에는 상단에 어두운 오버레이가 따로 없어서, 밝은 색 빵 사진 위에서
            반투명 흰 배경 버튼이 안 보이는 걸 막기 위한 스크림 */}
        <div
          className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))" }}
        />

        <button
          onClick={() => router.push("/")}
          className="absolute top-12 left-4 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}
          aria-label="뒤로가기"
        >
          <ChevronLeft size={20} color="#fff" />
        </button>
        <button
          onClick={() => memberId !== null && toggleWishlist(memberId, dropId)}
          disabled={memberId === null}
          className="absolute top-12 right-4 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}
          aria-label="찜하기"
        >
          <Heart
            size={18}
            color={isHearted ? COLORS.accent : "#fff"}
            fill={isHearted ? COLORS.accent : "none"}
          />
        </button>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 lg:overflow-visible">
        <div className="px-4 pt-4 pb-3 lg:px-0 lg:pt-2">
          <DropBadge status={status} />
          <h1 className="text-2xl font-bold mt-3 mb-1 leading-tight font-serif" style={{ color: COLORS.text }}>
            {drop.name}
          </h1>
          <p className="text-lg font-semibold mb-2" style={{ color: COLORS.text }}>
            {drop.price.toLocaleString()}원
          </p>
          <p className="text-sm leading-relaxed" style={{ color: COLORS.muted }}>
            {drop.description}
          </p>
        </div>

        <div
          className="mx-4 mb-3 overflow-hidden rounded-xl lg:mx-0"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          {[
            ["판매 오픈", fmtDateTime(drop.dropStart)],
            ["판매 마감", fmtDateTime(drop.dropEnd)],
          ].map(([l, v]) => (
            <div
              key={l}
              className="flex justify-between items-center px-4 py-3"
              style={{ borderBottom: `1px solid ${COLORS.border}` }}
            >
              <span className="text-sm" style={{ color: COLORS.muted }}>
                {l}
              </span>
              <span className="text-sm font-medium" style={{ color: COLORS.text }}>
                {v}
              </span>
            </div>
          ))}

          {status !== "CLOSED" && (
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm" style={{ color: COLORS.muted }}>
                  남은 재고
                </span>
                {status === "SCHEDULED" ? (
                  <span className="text-xl font-bold font-serif" style={{ color: COLORS.accent }}>
                    {drop.totalQuantity}개 한정
                  </span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold" style={{ color: COLORS.accent }}>
                      {drop.remainQuantity}
                    </span>
                    <span className="text-xs" style={{ color: COLORS.muted }}>
                      / {drop.totalQuantity}
                    </span>
                  </div>
                )}
              </div>
              {status !== "SCHEDULED" && (
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.border }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: COLORS.accent }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              1인 구매 제한
            </span>
            <span className="text-sm font-medium" style={{ color: COLORS.text }}>
              {drop.limitQuantity}개 (1회 주문만)
            </span>
          </div>
        </div>

        <div
          className="mx-4 mb-4 rounded-xl p-4 lg:mx-0"
          style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={15} color={COLORS.accent} />
            <span className="text-base font-semibold" style={{ color: COLORS.text }}>
              픽업 가능 날짜
            </span>
          </div>
          {status === "ON_SALE" ? (
            <div className="flex flex-wrap gap-2">
              {sortedPickupDates.map((d) => {
                const isSel = effectivePickupDate === d;
                return (
                  <button
                    key={d}
                    onClick={() => setPickupDate((prev) => (prev === d ? null : d))}
                    className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1"
                    style={{
                      background: isSel ? COLORS.accent : COLORS.bg,
                      color: isSel ? COLORS.bg : COLORS.text,
                      border: isSel ? "none" : `1px solid ${COLORS.border}`,
                      fontWeight: isSel ? 700 : 400,
                    }}
                  >
                    {isSel && <Check size={11} />}
                    {fmtPickup(d)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortedPickupDates.map((d) => (
                <span
                  key={d}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  {fmtPickup(d)}
                </span>
              ))}
            </div>
          )}
          <p
            className="text-xs mt-3 pt-3"
            style={{ color: COLORS.muted, borderTop: `1px solid ${COLORS.border}` }}
          >
            배송 없음, 매장 방문 수령만 가능
          </p>
        </div>

        {status === "ON_SALE" && (
          <div
            className="mx-4 mb-4 flex items-center justify-between rounded-xl p-4 lg:mx-0"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              수량
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{ background: COLORS.border, color: COLORS.text }}
              >
                <Minus size={13} />
              </button>
              <span className="text-sm font-semibold w-4 text-center" style={{ color: COLORS.text }}>
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{ background: qty >= maxQty ? COLORS.surface : COLORS.accentSoft, color: COLORS.text }}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <section className="mx-4 mb-8 mt-10 border-t pt-8 lg:mx-0" style={{ borderColor: COLORS.border }}>
            <p className="text-xs font-bold tracking-[0.16em]" style={{ color: COLORS.accent }}>
              AI RECOMMEND
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold" style={{ color: COLORS.text }}>
              함께 보면 좋은 빵
            </h2>
            <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>
              회원님의 취향에 맞을 것 같은 상시 판매 상품이에요.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-2">
              {recommendations.slice(0, 2).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* CTA */}
      <div
        className="sticky bottom-0 z-20 flex-shrink-0 px-4 py-3 lg:static lg:rounded-2xl lg:border"
        style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
      >
        {purchaseErrorMessage && (
          <p className="text-xs mb-2 text-center" style={{ color: "#E0554F" }}>
            {purchaseErrorMessage}
          </p>
        )}

        {purchasing && (
          <div className="text-center py-2 mb-2">
            <p className="text-sm font-semibold" style={{ color: COLORS.accent }}>
              {reserveMutation.isPending ? "재고 선점 중..." : "입장 처리 중..."}
            </p>
          </div>
        )}

        {!isAuthenticated && (status === "SCHEDULED" || status === "ON_SALE") && (
          <Link
            href="/login"
            className="block w-full py-3.5 rounded-lg text-sm font-bold text-center"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            {status === "SCHEDULED" ? "로그인하고 찜하기" : "로그인하고 구매하기"}
          </Link>
        )}
        {isAuthenticated && status === "SCHEDULED" && (
          <button
            onClick={() => memberId !== null && toggleWishlist(memberId, dropId)}
            disabled={memberId === null}
            className="w-full py-3.5 rounded-lg text-sm font-semibold"
            style={{
              border: `1.5px solid ${isHearted ? COLORS.accent : COLORS.border}`,
              color: isHearted ? COLORS.accent : COLORS.text,
              background: "transparent",
            }}
          >
            {isHearted ? "♥ 찜 완료" : "찜하고 알림받기"}
          </button>
        )}
        {isAuthenticated && status === "ON_SALE" && (
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={purchasing || !effectivePickupDate}
            className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            {sortedPickupDates.length === 0
              ? "픽업 가능 날짜가 없습니다"
              : effectivePickupDate
                ? `${qty}개 구매하기`
                : "픽업 날짜를 선택해주세요"}
          </button>
        )}
        {(status === "SOLD_OUT" || status === "CLOSED") && (
          <button
            disabled
            className="w-full py-3.5 rounded-lg text-sm font-semibold cursor-not-allowed"
            style={{ background: COLORS.disabled, color: COLORS.muted }}
          >
            {status === "SOLD_OUT" ? "품절" : "종료된 드롭입니다"}
          </button>
        )}
      </div>
    </div>
  );
}
