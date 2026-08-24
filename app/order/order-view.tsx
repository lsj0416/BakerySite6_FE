"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import * as dropApi from "@/lib/api/drop";
import * as cartApi from "@/lib/api/cart";
import * as orderApi from "@/lib/api/order";
import * as paymentApi from "@/lib/api/payment";
import { productImageUrl } from "@/lib/api/product";
import { ApiException } from "@/lib/api/types";
import { fmtPickup } from "@/lib/format";

export function OrderView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dropId = Number(searchParams.get("dropId"));
  const dropIdValid = Number.isFinite(dropId) && dropId > 0;

  const dropQuery = useQuery({
    queryKey: ["drop-info", dropId],
    queryFn: () => dropApi.getDropInfo(dropId),
    enabled: dropIdValid,
  });

  const accountQuery = useQuery({
    queryKey: ["deposit-account"],
    queryFn: paymentApi.getDepositAccount,
  });

  const drop = dropQuery.data;
  // 수량/픽업일은 드롭 상세 페이지에서 대기열 진입 전에 이미 골라서 쿼리로 넘어온다.
  // 직접 URL로 들어오는 등 값이 없는 경우를 대비해 안전한 기본값으로 보정한다.
  const qtyParam = Number(searchParams.get("qty"));
  const qty = Number.isFinite(qtyParam) && qtyParam > 0 ? qtyParam : 1;
  // 백엔드가 Set<LocalDate>로 내려줘서 순서가 보장 안 됨 — ISO 날짜 문자열이라 그냥 정렬하면 된다.
  const pickupDate = searchParams.get("pickupDate") ?? [...(drop?.pickupDates ?? [])].sort()[0] ?? null;

  // 재고 선점(lock-start)·장바구니 생성·픽업일 저장은 전부 드롭 상세 페이지에서 대기열
  // 순번이 돌아온 직후 이미 끝났다 — 여기선 그렇게 확보된 장바구니로 결제만 한다.
  const purchaseMutation = useMutation({
    mutationFn: () => orderApi.createOrder(),
    // 결제 성공 시 서버가 이미 장바구니를 지운 뒤라(OrderService.create) 아래 언마운트
    // cleanup의 deleteCart()는 CART_NOT_FOUND로 조용히 실패할 뿐이라 skip 처리가 따로 필요 없다.
    onSuccess: (res) => router.push(`/order/complete?orderId=${res.orderId}`),
  });

  // 잔액 부족으로 충전하러 가는 경우만 "의도적으로 계속 진행"이고, 그 외에 이 페이지를
  // 벗어나면(뒤로가기, 탭 이동, 탭 닫기 등) 전부 이탈로 보고 재고 선점을 푼다. TTL이 있긴
  // 하지만(장바구니 만료 배치가 결국 회수함) 그때까지 몇 분씩 묶어두지 않기 위함.
  const skipReleaseRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // dev StrictMode는 mount→cleanup→mount를 한 번 더 도는데, 그 cleanup에서 바로
    // deleteCart를 부르면 방금 만든 예약이 실제로는 안 떠났는데도 풀려버린다. 그래서
    // cleanup에서는 바로 지우지 않고 살짝 지연시켜 예약해두고, 진짜로 다시 mount되면
    // (=StrictMode의 가짜 언마운트였다면) 여기서 그 예약을 취소한다. 진짜 언마운트라면
    // 다시 mount될 일이 없으니 타이머가 그대로 실행된다.
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    function handlePageHide() {
      if (skipReleaseRef.current) return;
      cartApi.deleteCartBeacon();
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (skipReleaseRef.current) return;
      releaseTimerRef.current = setTimeout(() => {
        cartApi.deleteCart().catch(() => {});
      }, 300);
    };
  }, []);

  if (!dropIdValid) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          잘못된 접근입니다.
        </p>
      </div>
    );
  }

  if (dropQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          불러오는 중...
        </p>
      </div>
    );
  }

  if (dropQuery.isError || !drop) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "#E0554F" }}>
          {dropQuery.error instanceof ApiException
            ? dropQuery.error.message
            : "드롭 정보를 불러오지 못했습니다."}
        </p>
      </div>
    );
  }

  const total = drop.price * qty;
  const balance = accountQuery.data?.balance ?? 0;
  const insufficient = accountQuery.data !== undefined && balance < total;
  const afterBalance = balance - total;

  function errorMessage(err: unknown) {
    if (err instanceof ApiException) return err.message;
    return "주문에 실패했습니다.";
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Product */}
        <div
          className="mx-4 mt-4 p-3 rounded-xl flex gap-3 items-center"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <BreadBox
            className="w-[72px] h-[72px] rounded-lg flex-shrink-0"
            src={productImageUrl(drop.imageUrl)}
            label={drop.name}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {drop.name}
            </p>
            <p className="text-sm" style={{ color: COLORS.text }}>
              {drop.price.toLocaleString()}원
            </p>
          </div>
          <span className="text-sm font-semibold flex-shrink-0" style={{ color: COLORS.text }}>
            {qty}개
          </span>
        </div>

        {/* Pickup date */}
        <div className="px-4 mt-5">
          <h2 className="text-base font-semibold mb-3" style={{ color: COLORS.text }}>
            픽업 날짜
          </h2>

          {pickupDate ? (
            <div
              className="p-3 rounded-xl"
              style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center gap-2">
                <Check size={13} color={COLORS.accent} />
                <span className="text-sm font-medium" style={{ color: COLORS.text }}>
                  {fmtPickup(pickupDate)} 방문
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "#E0554F" }}>
              픽업 날짜가 선택되지 않았습니다. 드롭 상세 페이지로 돌아가 다시 시도해주세요.
            </p>
          )}
        </div>

        {/* Payment summary */}
        <div
          className="mx-4 mt-4 p-4 rounded-xl"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex justify-between py-1.5">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              상품 금액
            </span>
            <span className="text-sm" style={{ color: COLORS.text }}>
              {total.toLocaleString()}원
            </span>
          </div>
          <div className="my-2" style={{ borderTop: `1px solid ${COLORS.border}` }} />
          <div className="flex justify-between items-center py-1">
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              총 결제 금액
            </span>
            <span className="text-xl font-bold" style={{ color: COLORS.text }}>
              {total.toLocaleString()}원
            </span>
          </div>
        </div>

        {/* Wallet */}
        <div
          className="mx-4 mt-3 mb-6 p-4 rounded-xl"
          style={{ background: COLORS.accentSoft, border: `1.5px solid ${insufficient ? COLORS.accent : COLORS.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              예치금 결제
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              현재 잔액
            </span>
            <span className="text-sm font-semibold" style={{ color: insufficient ? COLORS.accent : COLORS.text }}>
              {balance.toLocaleString()}원
            </span>
          </div>
          {insufficient ? (
            <div className="flex justify-between py-1">
              <span className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                {(total - balance).toLocaleString()}원 부족
              </span>
            </div>
          ) : (
            <div className="flex justify-between py-1">
              <span className="text-sm" style={{ color: COLORS.muted }}>
                결제 후 잔액
              </span>
              <span className="text-sm" style={{ color: COLORS.muted }}>
                {afterBalance.toLocaleString()}원
              </span>
            </div>
          )}
        </div>

        {purchaseMutation.isError && (
          <p className="text-xs text-center mb-4" style={{ color: "#E0554F" }}>
            {errorMessage(purchaseMutation.error)}
          </p>
        )}
      </div>

      <div
        className="px-4 py-3 flex-shrink-0"
        style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
      >
        <button
          onClick={() => {
            if (insufficient) {
              skipReleaseRef.current = true;
              const returnTo = `/order?dropId=${dropId}&qty=${qty}${pickupDate ? `&pickupDate=${pickupDate}` : ""}`;
              router.push(`/wallet/charge?returnTo=${encodeURIComponent(returnTo)}`);
            } else {
              purchaseMutation.mutate();
            }
          }}
          disabled={purchaseMutation.isPending || (!insufficient && !pickupDate)}
          className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          {purchaseMutation.isPending
            ? "결제 처리 중..."
            : insufficient
              ? "충전하고 결제하기"
              : !pickupDate
                ? "픽업 날짜를 선택해주세요"
                : `${total.toLocaleString()}원 결제하기`}
        </button>
      </div>
    </>
  );
}
