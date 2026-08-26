"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { BreadBox } from "@/components/bread-box";
import { DropBadge } from "@/components/drop-badge";
import { useAuth } from "@/lib/auth/auth-context";
import * as dropApi from "@/lib/api/drop";
import { productImageUrl } from "@/lib/api/product";
import { toDropStatus } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import {
  EMPTY_WISHLIST,
  getWishlist,
  removeFromWishlist,
  subscribeWishlist,
} from "@/lib/wishlist/wishlist-storage";

export default function WishlistPage() {
  const { memberId } = useAuth();
  const wishlist = useSyncExternalStore(
    subscribeWishlist,
    () => (memberId !== null ? getWishlist(memberId) : EMPTY_WISHLIST),
    () => EMPTY_WISHLIST,
  );

  const results = useQueries({
    queries: wishlist.map((dropId) => ({
      queryKey: ["drop-info", dropId],
      queryFn: () => dropApi.getDropInfo(dropId),
    })),
  });

  const items = wishlist
    .map((dropId, i) => ({ dropId, query: results[i] }))
    .filter((item) => item.query.data);

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center justify-between px-4 pb-4 flex-shrink-0"
        style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}
      >
        <span className="text-xl font-bold" style={{ color: COLORS.text }}>
          찜
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pb-4">
        {wishlist.length === 0 && (
          <div className="flex flex-col items-center justify-center h-56 gap-4">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              찜한 드롭이 없어요
            </p>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: COLORS.accentSoft, color: COLORS.accent, border: `1px solid ${COLORS.border}` }}
            >
              드롭 둘러보기
            </Link>
          </div>
        )}

        {items.map(({ dropId, query }) => {
          const drop = query.data!;
          const status = toDropStatus(drop.dropStatus, drop.remainQuantity);
          const ended = status === "SOLD_OUT" || status === "CLOSED";
          return (
            <div
              key={dropId}
              className={`rounded-xl p-4 ${ended ? "opacity-50 grayscale" : ""}`}
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex gap-3">
                <BreadBox className="w-16 h-16 rounded-lg flex-shrink-0" src={productImageUrl(drop.imageUrl)} label={drop.name} />
                <div className="flex-1">
                  <div className="mb-1">
                    <DropBadge status={status} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {drop.name}
                  </p>
                  <p className="text-sm" style={{ color: COLORS.text }}>
                    {drop.price.toLocaleString()}원
                  </p>
                  <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                    {fmtDateTime(drop.dropStart)} 오픈
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                {status === "ON_SALE" && (
                  <Link
                    href={`/drops/${dropId}`}
                    className="flex-1 py-2 rounded-lg text-sm font-bold text-center"
                    style={{ background: COLORS.accent, color: COLORS.bg }}
                  >
                    구매하기
                  </Link>
                )}
                {status === "SCHEDULED" && (
                  <Link
                    href={`/drops/${dropId}`}
                    className="flex-1 py-2 rounded-lg text-sm text-center"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    상세 보기
                  </Link>
                )}
                {ended && (
                  <button
                    onClick={() => memberId !== null && removeFromWishlist(memberId, dropId)}
                    className="flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5"
                    style={{ background: COLORS.accentSoft, color: COLORS.muted }}
                  >
                    <Trash2 size={13} /> 삭제
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
