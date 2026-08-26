"use client";

import { usePathname } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { SiteHeader } from "@/components/site-header";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";

const TAB_ROUTES = new Set(["/", "/categories", "/wishlist", "/orders", "/mypage", "/search"]);

// 홈/카테고리/검색/상품·드롭 상세는 전부 백엔드가 공개(또는 optional-auth)로 열어둔
// 조회 API(product-list, drops/upcoming, autocomplete, 상품/드롭 상세)만 쓰므로 비회원도
// 볼 수 있게 예외를 둔다(2026-08-26 실제 API 응답으로 재확인). 추천(recommendations)만
// 개인화가 본질이라 의도적으로 로그인 필수로 남아있고, 각 화면에서 `enabled: isAuthenticated`로
// 게스트에게는 요청 자체를 보내지 않는다.
const GUEST_ALLOWED_PREFIXES = ["/products/", "/drops/", "/categories", "/search"];

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isGuestAllowedRoute =
    pathname === "/" || GUEST_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const { blocked } = useAuthGuard({ bypass: isGuestAllowedRoute });
  const showTabBar = TAB_ROUTES.has(pathname) || pathname.startsWith("/categories/");
  const useWideLayout =
    pathname === "/" ||
    pathname === "/search" ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/drops/") ||
    pathname.startsWith("/products/");

  if (blocked) return null;

  return (
    <div className="min-h-dvh w-full">
      <SiteHeader />
      <div
        className={`${showTabBar ? "pb-[76px] lg:pb-0" : ""} ${
          useWideLayout
            ? "min-h-0"
            : "mx-auto flex min-h-[calc(100dvh-132px)] w-full max-w-[720px] flex-col lg:min-h-[calc(100dvh-164px)]"
        }`}
      >
        {children}
      </div>
      {showTabBar && <TabBar activeHref={pathname} />}
    </div>
  );
}
