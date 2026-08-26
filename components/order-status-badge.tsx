import { COLORS } from "@/lib/theme";
import type { OrderStatus } from "@/lib/types";

const STATUS_MAP: Record<OrderStatus, { bg: string; fg: string }> = {
  진행중: { bg: COLORS.accentSoft, fg: COLORS.info },
  픽업대기: { bg: COLORS.accentSoft, fg: COLORS.accent },
  취소: { bg: "#1a1a1a", fg: COLORS.muted },
  결제실패: { bg: COLORS.accentSoft, fg: COLORS.danger },
  만료: { bg: "#1a1a1a", fg: COLORS.muted },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { bg, fg } = STATUS_MAP[status];
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}
