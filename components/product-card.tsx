import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BreadBox } from "@/components/bread-box";
import type { CatalogProduct } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const unavailable = product.status === "SOLD_OUT" || product.status === "CLOSED";

  return (
    <Link href={product.href} className="group block min-w-0" aria-label={`${product.name} 상세 보기`}>
      <article>
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-2xl"
          style={{ background: COLORS.accentSoft }}
        >
          <BreadBox
            label={product.name}
            src={product.imageUrl}
            dim={unavailable}
            className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
            style={{ background: COLORS.surface, color: COLORS.accent }}
          >
            한정 드롭
          </span>
          <span
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            style={{ background: COLORS.surface, color: COLORS.text }}
            aria-hidden="true"
          >
            <ArrowUpRight size={17} />
          </span>
        </div>
        <div className="pt-3">
          <p className="line-clamp-1 text-[15px] font-semibold" style={{ color: COLORS.text }}>
            {product.name}
          </p>
          <p className="mt-1 text-base font-bold" style={{ color: COLORS.text }}>
            {product.price.toLocaleString()}원
          </p>
          <p className="mt-1 line-clamp-1 text-xs" style={{ color: COLORS.muted }}>
            {product.status === "ON_SALE"
              ? `${product.remainQuantity}개 남음 · 매장 픽업`
              : product.status === "SCHEDULED"
                ? "오픈 예정 · 매장 픽업"
                : "판매 종료"}
          </p>
        </div>
      </article>
    </Link>
  );
}
