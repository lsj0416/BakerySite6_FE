"use client";

import { COLORS } from "@/lib/theme";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtPickup } from "@/lib/format";
import type { OrderDetailResponse } from "@/lib/api/order";

/**
 * 진행 중 주문(회원당 1건 제한)이 있어 새 주문서를 만들지 못했을 때 띄우는 안내.
 *
 * 예전엔 이 상황에서 말없이 기존 주문서로 이동해버려서, 방금 고른 상품이 아닌 다른
 * 상품이 결제 화면에 떠 있는 것처럼 보였다(수량·픽업일도 방금 고른 값이 아니다).
 * 무엇이 왜 뜨는지 먼저 보여주고, 어느 주문을 살릴지 사용자가 고르게 한다.
 *
 * `onCancelAndReorder`를 넘기면 "이전 주문을 취소하고 새로 주문" 선택지가 생긴다.
 * ⚠️ 드롭 구매에는 넘기지 않는다 — 드롭 주문서는 lock-start로 재고를 선점해야 만들 수
 * 있는데, 이미 선점한 참여 이력이 있으면 재선점이 DR014로 실패한다(docs/drop-api.md
 * §9). 즉 드롭은 "취소하고 새로"가 도중에 깨질 수 있어 선택지로 내놓지 않는다.
 */
export function PendingOrderDialog({
  order,
  onCancelAndReorder,
  onViewExisting,
  onDismiss,
  isPending = false,
  errorMessage = null,
}: {
  /** null이면 렌더하지 않음 — 호출부에서 조건부 렌더를 반복하지 않기 위함. */
  order: OrderDetailResponse | null;
  onCancelAndReorder?: () => void;
  onViewExisting: () => void;
  onDismiss: () => void;
  isPending?: boolean;
  errorMessage?: string | null;
}) {
  if (!order) return null;

  const [first] = order.items;
  const productLabel = first
    ? `${first.productName}${order.items.length > 1 ? ` 외 ${order.items.length - 1}개` : ""}`
    : "-";
  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const canReorder = onCancelAndReorder !== undefined;

  return (
    <ConfirmDialog
      open
      title="진행 중인 주문이 있습니다"
      description={
        canReorder
          ? "결제하지 않은 주문이 남아 있어 새로 주문할 수 없어요. 이전 주문을 취소하고 새로 주문할까요?"
          : "결제하지 않은 주문이 남아 있어 새로 주문할 수 없어요. 아래 주문을 먼저 결제하거나 취소해주세요."
      }
      // 확인 버튼은 기존 주문을 지우는 쪽이므로 destructive로 칠한다.
      confirmLabel={canReorder ? "예, 취소하고 새로 주문" : "기존 주문 보기"}
      cancelLabel={canReorder ? "아니오, 기존 주문 보기" : "닫기"}
      destructive={canReorder}
      isPending={isPending}
      onConfirm={canReorder ? onCancelAndReorder : onViewExisting}
      onCancel={canReorder ? onViewExisting : onDismiss}
      // 두 버튼이 모두 무언가를 실행하므로, Esc·배경 클릭은 아무것도 하지 않고 닫기만 한다.
      onDismiss={onDismiss}
    >
      <div
        className="flex flex-col gap-1 rounded-xl p-3"
        style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
      >
        <div className="flex justify-between gap-3 text-sm">
          <span style={{ color: COLORS.muted }}>상품</span>
          <span className="text-right font-semibold" style={{ color: COLORS.text }}>
            {productLabel}
          </span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span style={{ color: COLORS.muted }}>수량</span>
          <span style={{ color: COLORS.text }}>{totalQuantity}개</span>
        </div>
        {first && (
          <div className="flex justify-between gap-3 text-sm">
            <span style={{ color: COLORS.muted }}>픽업</span>
            <span style={{ color: COLORS.text }}>{fmtPickup(first.pickUpDate)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 text-sm">
          <span style={{ color: COLORS.muted }}>주문 금액</span>
          <span className="font-semibold" style={{ color: COLORS.text }}>
            {order.totalAmount.toLocaleString()}원
          </span>
        </div>
      </div>

      {canReorder && (
        <p className="mt-2 text-xs" style={{ color: COLORS.muted }}>
          취소하면 되돌릴 수 없습니다. 아직 결제 전이라 환불은 발생하지 않습니다.
        </p>
      )}

      {errorMessage && (
        <p className="mt-2 text-xs" style={{ color: COLORS.danger }}>
          {errorMessage}
        </p>
      )}
    </ConfirmDialog>
  );
}
