"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Search, ShoppingBag, UserRound, Wallet } from "lucide-react";
import { CATEGORIES } from "@/lib/catalog";
import { COLORS } from "@/lib/theme";

export function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search");
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur" style={{ borderColor: COLORS.border }}>
      <div className="hidden bg-[#3B2416] py-2 text-center text-xs text-[#FFF8F0] md:block">
        동네 베이커리의 가장 맛있는 순간을 오픈베이크에서 만나보세요
      </div>

      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center gap-5 px-4 md:h-[84px] md:px-6">
        <Link href="/" className="shrink-0 font-serif text-2xl font-extrabold tracking-tight md:text-3xl" style={{ color: COLORS.deep }}>
          OpenBake
        </Link>

        <form onSubmit={submitSearch} className="mx-auto flex w-full max-w-[520px] items-center">
          <label htmlFor="global-search" className="sr-only">
            상품 검색
          </label>
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} color={COLORS.muted} />
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="빵, 베이커리를 검색해보세요"
              className="h-11 w-full rounded-full border bg-[#FAF7F2] pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#8B5E3C] md:h-12"
              style={{ borderColor: COLORS.border, color: COLORS.text }}
            />
          </div>
        </form>

        <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label="사용자 메뉴">
          {[
            { href: "/wallet", label: "예치금", icon: Wallet },
            { href: "/wishlist", label: "찜", icon: Bookmark },
            { href: "/orders", label: "주문", icon: ShoppingBag },
            { href: "/mypage", label: "마이", icon: UserRound },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-[#F3E9DE]"
              style={{ color: COLORS.muted }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <nav className="hidden border-t md:block" style={{ borderColor: COLORS.border }} aria-label="상품 카테고리">
        <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-7 overflow-x-auto px-6 text-sm font-semibold">
          <Link href="/categories" style={{ color: COLORS.accent }}>
            전체 카테고리
          </Link>
          {CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`} className="whitespace-nowrap hover:underline" style={{ color: COLORS.text }}>
              {category.label}
            </Link>
          ))}
          <Link href="/#drops" className="ml-auto whitespace-nowrap" style={{ color: COLORS.deep }}>
            오픈 예정 드롭
          </Link>
        </div>
      </nav>
    </header>
  );
}
