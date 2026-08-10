import Link from "next/link";
import { Bookmark, Grid2X2, Home, ShoppingBag, User } from "lucide-react";
import { COLORS } from "@/lib/theme";

const TABS = [
  { href: "/", label: "홈", icon: Home },
  { href: "/categories", label: "카테고리", icon: Grid2X2 },
  { href: "/wishlist", label: "찜", icon: Bookmark },
  { href: "/orders", label: "주문내역", icon: ShoppingBag },
  { href: "/mypage", label: "마이", icon: User },
] as const;

export function TabBar({ activeHref }: { activeHref: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t lg:hidden"
      style={{
        background: COLORS.surface,
        borderColor: COLORS.border,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? activeHref === "/" : activeHref.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: active ? COLORS.accent : COLORS.muted }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            <span className="text-[11px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
