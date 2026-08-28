"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import {
  cancelOrder,
  getOrderDetail,
  payOrder,
  type OrderDetailResponse,
  type OrderPayOutcome,
} from "@/lib/api/order";
import * as paymentApi from "@/lib/api/payment";
import { productImageUrl } from "@/lib/api/product";
import { ApiException } from "@/lib/api/types";
import {
  clearProcessingMarker,
  getProcessingMarker,
  setProcessingMarker,
} from "@/lib/payment/processing-storage";
import { fmtPickup } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiException) return err.message;
  return fallback;
}

type ReservationTimeStatus =
  | { status: "not-applicable" } // 주문이 PENDING이 아니거나 아직 로딩 전 — 만료 판단 자체가 무의미함
  | { status: "missing" } // PENDING인데 reservationExpiresAt이 null(백엔드 계약상 있어야 함 — 이상 케이스)
  | { status: "invalid" } // 파싱 불가능한 문자열
  | { status: "active"; expiresAtMs: number } // 유효한 미래 시각
  | { status: "expired" }; // 유효한 과거 시각

/**
 * 드롭 주문인지 판별. salesType이 정본이지만, 항목의 dropId도 함께 본다(둘 중 하나라도
 * 드롭이면 드롭으로 취급 — 유효 시간 관련 안내를 잘못 감추는 쪽이 더 위험하므로).
 */
function isDropOrder(order: OrderDetailResponse) {
  return order.salesType === "DROP" || order.items.some((item) => item.dropId != null);
}

/**
 * reservationExpiresAt을 한 곳에서만 파싱해 파생 상태로 만든다 — 렌더 곳곳에서 new Date()를 반복하지 않기 위함.
 *
 * 주문서 유효 시간은 드롭 재고 선점에서만 의미가 있다. 일반상품 주문은 선점이 없어
 * "not-applicable"로 두고, 카운트다운·만료 안내·만료로 인한 결제 차단을 전부 건너뛴다.
 */
function classifyReservationTime(order: OrderDetailResponse | undefined, now: Date): ReservationTimeStatus {
  if (!order || order.orderState !== "PENDING" || !isDropOrder(order)) return { status: "not-applicable" };
  const raw = order.reservationExpiresAt;
  if (!raw) return { status: "missing" };
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) return { status: "invalid" };
  return now.getTime() >= ms ? { status: "expired" } : { status: "active", expiresAtMs: ms };
}

export function OrderView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdParam = Number(searchParams.get("orderId"));
  const orderIdValid = Number.isFinite(orderIdParam) && orderIdParam > 0;
  const orderId = orderIdValid ? orderIdParam : null;

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // 결제 전 필수 약관 동의. 새 주문/다른 orderId로 이동하면 다시 동의해야 하므로 orderId가
  // 바뀔 때마다 초기화한다(새로고침은 useState 초기값 자체가 항상 false라 별도 처리 불필요 —
  // localStorage 등에 영속화하지 않는다). effect가 아니라 렌더 중 비교로 리셋한다 —
  // "다른 key로 바뀌면 state를 리셋"하는 케이스의 React 권장 패턴(리렌더 캐스케이드 방지).
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsAgreedForOrderId, setTermsAgreedForOrderId] = useState(orderId);
  if (orderId !== termsAgreedForOrderId) {
    setTermsAgreedForOrderId(orderId);
    setTermsAgreed(false);
  }

  const orderQuery = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => {
      if (orderId === null) throw new ApiException("C001", "잘못된 접근입니다.");
      return getOrderDetail(orderId);
    },
    enabled: orderId !== null,
  });
  const order = orderQuery.data;

  const accountQuery = useQuery({
    queryKey: ["deposit-account"],
    queryFn: paymentApi.getDepositAccount,
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // PROCESSING 마커는 React state가 아니라 localStorage에 있다 — 새로고침으로 이 컴포넌트가
  // 다시 마운트돼도 "결제 결과를 아직 못 받았다"는 사실을 잃지 않기 위함. PENDING이라는
  // 서버 상태만으로는 "아직 시도 안 함"과 "시도했는데 결과 미확정"을 구분할 수 없다.
  const [processingMarker, setLocalProcessingMarker] = useState(() =>
    orderId !== null ? getProcessingMarker(orderId) : null,
  );

  // orderState가 종료 상태로 확정되면 PROCESSING 마커는 더 이상 의미가 없다. React state를
  // 여기서 직접 갱신하지 않고(effect 안 setState는 캐스케이드 렌더를 유발) localStorage만
  // 정리한다 — 화면에 쓸 값은 아래 effectiveProcessingMarker가 order 상태로 매 렌더 다시 계산한다.
  const isTerminalOrderState =
    order?.orderState === "PAID" ||
    order?.orderState === "FAILED" ||
    order?.orderState === "EXPIRED" ||
    order?.orderState === "CANCELED";
  const effectiveProcessingMarker = isTerminalOrderState ? null : processingMarker;

  useEffect(() => {
    if (orderId === null || !isTerminalOrderState) return;
    clearProcessingMarker(orderId);
  }, [orderId, isTerminalOrderState]);

  /**
   * 결제하지 않은 주문서를 두고 나가려 할 때 확인 다이얼로그를 띄우기 위한 뒤로가기 가드.
   *
   * 화면 위에 더미 히스토리 항목을 하나 쌓아둔다. 사용자가 뒤로가기를 하면 그 더미가
   * 먼저 소비되므로 화면은 그대로 남고, 그 사이에 다이얼로그를 띄울 수 있다. 헤더의
   * 뒤로가기 버튼도 결국 history.back()이라(BackHeader) popstate 하나로 둘 다 잡힌다.
   *
   * ⚠️ 탭 닫기·새로고침은 이 방식으로 잡히지 않는다(beforeunload에서 비동기 취소 요청을
   * 기다릴 수 없고, sendBeacon은 Authorization 헤더를 못 싣는다). 그쪽은 서버의 주문
   * 만료 배치가 회수하는 것이 정답이므로 여기서 흉내내지 않는다.
   */
  const guardArmedRef = useRef(false);
  // 결제 결과를 기다리는 중(PROCESSING)에는 가드를 걸지 않는다 — 그 상태에서 취소를
  // 제안하면 이미 나간 결제와 경합할 수 있다.
  const exitGuardActive = order?.orderState === "PENDING" && effectiveProcessingMarker === null;

  useEffect(() => {
    if (!exitGuardActive) return;

    window.history.pushState({ openbakeOrderExitGuard: true }, "");
    guardArmedRef.current = true;

    const handlePopState = () => {
      // 이미 "나가기"를 확정한 뒤의 back이면 그대로 통과시킨다.
      if (!guardArmedRef.current) return;
      guardArmedRef.current = false; // 더미 항목은 방금 소비됐다
      setExitDialogOpen(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [exitGuardActive]);

  /** 다이얼로그를 그냥 닫고 화면에 머무는 경우 — 다음 뒤로가기도 잡도록 더미를 새로 쌓는다. */
  function stayOnOrder() {
    setExitDialogOpen(false);
    window.history.pushState({ openbakeOrderExitGuard: true }, "");
    guardArmedRef.current = true;
  }

  /** 주문은 그대로 두고 화면만 벗어난다(PENDING 유지 — 나중에 이어서 결제 가능). */
  function leaveKeepingOrder() {
    guardArmedRef.current = false;
    setExitDialogOpen(false);
    router.back();
  }

  // 결제가 서버에서 확정됐다면(다른 탭에서 새로고침을 눌렀거나 등) 버튼을 누르게 두지 않고 바로 이동.
  useEffect(() => {
    if (order?.orderState === "PAID") {
      router.push(`/order/complete?orderId=${orderId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderState]);

  const reservation = classifyReservationTime(order, now);
  const expired = reservation.status === "expired";
  // PENDING인데 reservationExpiresAt이 없거나(missing) 파싱 불가능(invalid)하면 만료 여부를
  // 신뢰할 수 없다 — 둘 다 "확인 불가"로 묶어 결제를 막는다(만료가 아니라고 단정하지 않음).
  const reservationUnknown = reservation.status === "missing" || reservation.status === "invalid";

  useEffect(() => {
    if (expired) orderQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const payMutation = useMutation({
    mutationFn: () => {
      if (orderId === null) throw new ApiException("C001", "잘못된 접근입니다.");
      // 버튼 disabled만 믿지 않고 mutationFn 자체에서도 막는다 — 신뢰 못 하는 시각에서
      // 결제가 나가면 안 되므로 이중 방어.
      if (reservationUnknown) {
        throw new ApiException(
          "C001",
          "주문서 유효 시간을 확인할 수 없습니다. 주문 상태를 다시 확인해주세요.",
        );
      }
      // 버튼 disabled만 믿지 않고 여기서도 막는다 — DOM 조작이나 빠른 연속 클릭으로
      // 체크 안 된 상태에서 결제 함수가 실행되는 걸 막기 위한 이중 방어.
      if (!termsAgreed) {
        throw new ApiException("C001", "약관에 동의해야 결제할 수 있습니다.");
      }
      return payOrder(orderId, { termsAgreed });
    },
    onSuccess: (res) => {
      if (orderId === null) return;
      if (res.outcome === "PAID") {
        clearProcessingMarker(orderId);
        setLocalProcessingMarker(null);
        router.push(`/order/complete?orderId=${orderId}`);
        return;
      }
      if (res.outcome === "PAYMENT_FAILED") {
        // 서버가 명시적으로 확정한 실패 — PROCESSING 마커를 만들지 않고 같은 주문으로 재결제 허용.
        return;
      }
      if (res.outcome === "OUT_OF_STOCK" || res.outcome === "PAYMENT_REVERSED") {
        clearProcessingMarker(orderId);
        setLocalProcessingMarker(null);
        orderQuery.refetch();
        return;
      }
      // PROCESSING — 결과를 못 받았다. 다시 결제 버튼을 보여주지 않도록 마커를 남긴다.
      setProcessingMarker(orderId);
      setLocalProcessingMarker(getProcessingMarker(orderId));
    },
  });

  // disabled={payBlocked}만으로는 진짜 동시 더블클릭을 못 막는다(리렌더 전에 두 onClick이
  // 같은 클로저에서 실행될 수 있음 — 이 세션에서 여러 버튼에 동일 패턴으로 실제 재현·수정됨).
  // 결제처럼 되돌리기 어려운 액션이라 여기서도 ref로 한 번 더 막는다.
  const payClickLockRef = useRef(false);
  function handlePayClick() {
    if (payClickLockRef.current) return;
    payClickLockRef.current = true;
    payMutation.mutate(undefined, { onSettled: () => { payClickLockRef.current = false; } });
  }

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (orderId === null) throw new ApiException("C001", "잘못된 접근입니다.");
      return cancelOrder(orderId);
    },
    onSuccess: () => {
      // 서버 취소 응답을 받은 뒤에만 이동한다.
      const dropId = order?.items.find((item) => item.dropId != null)?.dropId;
      router.push(dropId ? `/drops/${dropId}` : "/cart");
    },
  });

  /** 이탈 확인 다이얼로그의 "취소하고 나가기" — 취소 응답을 받은 뒤에만 화면을 벗어난다. */
  const cancelAndLeaveMutation = useMutation({
    mutationFn: () => {
      if (orderId === null) throw new ApiException("C001", "잘못된 접근입니다.");
      return cancelOrder(orderId);
    },
    onSuccess: () => {
      guardArmedRef.current = false;
      setExitDialogOpen(false);
      router.back();
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => orderQuery.refetch(),
  });

  if (!orderIdValid) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          잘못된 접근입니다.
        </p>
      </div>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          불러오는 중...
        </p>
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "#E0554F" }}>
          {errorMessage(orderQuery.error, "주문 정보를 불러오지 못했습니다.")}
        </p>
      </div>
    );
  }

  if (order.orderState === "PAID") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          결제 완료 화면으로 이동합니다...
        </p>
      </div>
    );
  }

  if (order.items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          주문 항목을 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  // 드롭 주문이면 dropId가 붙은 항목이 있고, 일반상품 주문이면 없다 — 이 값의 유무로
  // "취소 후 돌아갈 곳"만 분기한다(드롭 상세 vs 장바구니). 결제 화면 자체는 GENERAL/DROP
  // 양쪽 다 order.items를 그대로 렌더링해 공통으로 처리한다.
  const dropItem = order.items.find((item) => item.dropId != null) ?? null;
  const backHref = dropItem ? `/drops/${dropItem.dropId}` : "/cart";

  if (order.orderState === "FAILED" || order.orderState === "EXPIRED" || order.orderState === "CANCELED") {
    const label =
      order.orderState === "FAILED"
        ? "결제에 실패해 주문이 종료됐습니다."
        : order.orderState === "EXPIRED"
          ? // 일반상품 화면에는 "유효 시간"이라는 개념 자체를 노출하지 않는다.
            dropItem
            ? "주문서 유효 시간이 지나 자동으로 종료됐습니다."
            : "주문이 종료됐습니다."
          : "취소된 주문입니다.";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm" style={{ color: COLORS.muted }}>
          {label}
        </p>
        <Link
          href={backHref}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          {dropItem ? "드롭으로 돌아가기" : "장바구니로 돌아가기"}
        </Link>
      </div>
    );
  }

  const balance = accountQuery.data?.balance ?? null;
  // reservation.status가 "active"일 때만 유효한 ms 값을 가지므로, 그 외에는 항상 0 —
  // NaN이 remainMin/remainSec까지 전파될 경로가 없다.
  const remainMs = reservation.status === "active" ? Math.max(0, reservation.expiresAtMs - now.getTime()) : 0;
  const remainMin = Math.floor(remainMs / 60000);
  const remainSec = Math.floor((remainMs % 60000) / 1000);

  const payOutcome: OrderPayOutcome | null = payMutation.data?.outcome ?? null;
  const payOutcomeMessage =
    payOutcome === "PAYMENT_FAILED"
      ? (payMutation.data?.message ?? "결제에 실패했습니다.")
      : payMutation.isError
        ? errorMessage(payMutation.error, "결제에 실패했습니다.")
        : null;

  // 결제/취소 어느 한쪽이라도 진행 중이거나 PROCESSING 마커가 있으면 결제·취소 버튼 둘 다
  // 막는다(서버는 stale 응답만 걸러줄 뿐 동시 요청 자체는 안 막으므로). 주문서 만료는
  // 결제만 막는다 — 만료됐어도 서버가 5분 배치를 돌기 전까지는 취소로 즉시 반납할 수 있다.
  const bothBlocked = payMutation.isPending || cancelMutation.isPending || effectiveProcessingMarker !== null;

  /**
   * 예치금이 결제 금액에 못 미치는 상태. 예전엔 결제를 눌러 PAYMENT_FAILED를 받은
   * 뒤에야 충전 버튼이 나왔는데, 잔액이 이미 화면에 있으니 미리 알려주는 편이 낫다.
   */
  const insufficientBalance = balance !== null && balance < order.totalAmount;
  // 잔액 조회가 아직 안 끝났으면(balance === null) "충분한지" 자체를 모르는 상태라
  // 결제를 막는다 — 로딩 중에 결제 버튼이 먼저 활성화됐다가 잔액 도착 후 다시 막히는
  // 깜빡임을 방지한다.
  const balanceUnknown = balance === null;
  const payBlocked =
    bothBlocked || expired || reservationUnknown || !termsAgreed || balanceUnknown || insufficientBalance;
  const cancelBlocked = bothBlocked;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-4 mt-4 flex flex-col gap-3">
          {order.items.map((item) => (
            <div
              key={item.orderItemId}
              className="p-3 rounded-xl flex gap-3 items-center"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <BreadBox
                className="w-[72px] h-[72px] rounded-lg flex-shrink-0"
                src={productImageUrl(item.imageUrl)}
                label={item.productName}
              />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  {item.productName}
                </p>
                <p className="text-sm" style={{ color: COLORS.text }}>
                  {item.unitPrice.toLocaleString()}원
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Check size={12} color={COLORS.accent} />
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    {fmtPickup(item.pickUpDate)} 픽업
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: COLORS.text }}>
                {item.quantity}개
              </span>
            </div>
          ))}
        </div>

        <div
          className="mx-4 mt-4 p-4 rounded-xl"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex justify-between py-1.5">
            <span className="text-sm" style={{ color: COLORS.muted }}>
              상품 금액
            </span>
            <span className="text-sm" style={{ color: COLORS.text }}>
              {order.totalAmount.toLocaleString()}원
            </span>
          </div>
          <div className="my-2" style={{ borderTop: `1px solid ${COLORS.border}` }} />
          <div className="flex justify-between items-center py-1">
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              총 결제 금액
            </span>
            <span className="text-xl font-bold" style={{ color: COLORS.text }}>
              {order.totalAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        {balance !== null && (
          <div
            className="mx-4 mt-3 p-4 rounded-xl"
            style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex justify-between py-1">
              <span className="text-sm" style={{ color: COLORS.muted }}>
                현재 잔액
              </span>
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                {balance.toLocaleString()}원
              </span>
            </div>
            {insufficientBalance && (
              <div className="flex justify-between py-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span className="text-sm" style={{ color: COLORS.danger }}>
                  부족한 금액
                </span>
                <span className="text-sm font-bold" style={{ color: COLORS.danger }}>
                  {(order.totalAmount - balance).toLocaleString()}원
                </span>
              </div>
            )}
          </div>
        )}

        {reservation.status === "active" && (
          <p className="text-xs text-center mt-3" style={{ color: COLORS.muted }}>
            {`주문서 유효 시간 ${remainMin}:${String(remainSec).padStart(2, "0")} 남음`}
          </p>
        )}

        {reservation.status === "expired" && (
          <p className="text-xs text-center mt-3" style={{ color: "#E0554F" }}>
            주문서 유효 시간이 지났습니다.
          </p>
        )}

        {reservationUnknown && (
          <p className="text-xs text-center mt-3" style={{ color: "#E0554F" }}>
            주문서 유효 시간을 확인할 수 없습니다. 주문 상태를 다시 확인해주세요.
          </p>
        )}

        {effectiveProcessingMarker && (
          <p className="text-xs text-center mt-3" style={{ color: COLORS.accent }}>
            결제 처리 결과를 확인 중입니다. 다시 결제하지 마세요.
          </p>
        )}

        {payOutcomeMessage && (
          <p className="text-xs text-center mt-3" style={{ color: "#E0554F" }}>
            {payOutcomeMessage}
          </p>
        )}
      </div>

      <div
        className="px-4 py-3 flex-shrink-0 flex flex-col gap-2"
        style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
      >
        {effectiveProcessingMarker ? (
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            {refreshMutation.isPending ? "확인 중..." : "결제 상태 새로고침"}
          </button>
        ) : (
          <>
            {/* 잔액과 무관하게 항상 노출한다 — 결제 전에 미리 충전하러 갈 수 있어야 한다. */}
            <button
              onClick={() => {
                const returnTo = `/order?orderId=${orderId}`;
                router.push(`/wallet/charge?returnTo=${encodeURIComponent(returnTo)}`);
              }}
              disabled={bothBlocked}
              className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              예치금 충전하기
            </button>
            {reservationUnknown && (
              <button
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                {refreshMutation.isPending ? "확인 중..." : "주문 상태 새로고침"}
              </button>
            )}

            <label className="flex cursor-pointer items-start gap-2.5 px-0.5 py-1 select-none">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                aria-required="true"
                className="sr-only"
              />
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                style={{
                  background: termsAgreed ? COLORS.accent : COLORS.surface,
                  border: `1.5px solid ${termsAgreed ? COLORS.accent : COLORS.border}`,
                }}
              >
                {termsAgreed && <Check size={13} strokeWidth={3} color={COLORS.bg} />}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: COLORS.text }}>
                <span style={{ color: COLORS.accent, fontWeight: 700 }}>[필수]</span> 주문 상품 정보 및
                결제 진행에 동의합니다.
              </span>
            </label>

            <button
              onClick={handlePayClick}
              disabled={payBlocked}
              className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
              style={{ background: COLORS.accent, color: COLORS.bg }}
            >
              {payMutation.isPending
                ? "결제 처리 중..."
                : reservationUnknown
                  ? "주문 상태를 확인해주세요"
                  : expired
                    ? "주문서가 만료됐습니다"
                    : `${order.totalAmount.toLocaleString()}원 결제하기`}
            </button>
            <button
              onClick={() => setCancelDialogOpen(true)}
              disabled={cancelBlocked}
              className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              {cancelMutation.isPending ? "취소 처리 중..." : "주문 취소"}
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        title="주문을 취소하시겠어요?"
        confirmLabel="취소하기"
        cancelLabel="닫기"
        destructive
        isPending={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelDialogOpen(false)}
      >
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.muted }}>주문번호</span>
            <span style={{ color: COLORS.text }}>{order.orderId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.muted }}>상품</span>
            <span style={{ color: COLORS.text }}>
              {order.items[0].productName}
              {order.items.length > 1 ? ` 외 ${order.items.length - 1}개` : ""}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.muted }}>총 수량</span>
            <span style={{ color: COLORS.text }}>
              {order.items.reduce((sum, item) => sum + item.quantity, 0)}개
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: COLORS.muted }}>주문 금액</span>
            <span style={{ color: COLORS.text }}>{order.totalAmount.toLocaleString()}원</span>
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: COLORS.muted }}>
          아직 결제되지 않아 환불 없이 취소됩니다.
          {dropItem && " 취소하면 선점했던 재고가 반환됩니다."}
        </p>
        {cancelMutation.isError && (
          <p className="mt-2 text-xs" style={{ color: "#E0554F" }}>
            {errorMessage(cancelMutation.error, "주문 취소에 실패했습니다.")}
          </p>
        )}
      </ConfirmDialog>

      {/*
        두 버튼 모두 화면을 벗어난다 — 머무르려면 Esc·배경 클릭(onDismiss)으로 닫는다.
        그래서 취소 버튼이 "닫기"가 아니라 "나중에 이어서 결제"일 수 있다.
      */}
      <ConfirmDialog
        open={exitDialogOpen}
        title="주문서를 나가시겠어요?"
        description="아직 결제가 끝나지 않았습니다. 주문을 취소하고 나갈지, 그대로 두고 나중에 이어서 결제할지 선택해주세요."
        confirmLabel="취소하고 나가기"
        cancelLabel="나중에 이어서 결제"
        destructive
        isPending={cancelAndLeaveMutation.isPending}
        onConfirm={() => cancelAndLeaveMutation.mutate()}
        onCancel={leaveKeepingOrder}
        onDismiss={stayOnOrder}
      >
        <p className="text-xs" style={{ color: COLORS.muted }}>
          {dropItem
            ? "취소하면 선점했던 재고가 반환되며 되돌릴 수 없습니다."
            : "취소하면 되돌릴 수 없습니다. 아직 결제 전이라 환불은 발생하지 않습니다."}
        </p>
        {cancelAndLeaveMutation.isError && (
          <p className="mt-2 text-xs" style={{ color: "#E0554F" }}>
            {errorMessage(cancelAndLeaveMutation.error, "주문 취소에 실패했습니다.")}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
