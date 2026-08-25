"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth/auth-context";

const TAB_ROUTES = new Set(["/", "/categories", "/wishlist", "/orders", "/mypage", "/search"]);

// 상품/드롭 상세는 백엔드가 공개(또는 optional-auth)로 열어둔 조회 API만 쓰므로 비회원도
// 볼 수 있게 예외를 둔다. 홈/카테고리/검색/추천은 백엔드가 아직 인증을 요구해 여기 포함하지
// 않는다(공개 전환 여부 확인 전까지는 로그인 유도가 맞다).
const GUEST_ALLOWED_PREFIXES = ["/products/", "/drops/"];

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isGuestAllowedRoute = GUEST_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const showTabBar = TAB_ROUTES.has(pathname) || pathname.startsWith("/categories/");
  const useWideLayout =
    pathname === "/" ||
    pathname === "/search" ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/drops/") ||
    pathname.startsWith("/products/");

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isGuestAllowedRoute) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, isGuestAllowedRoute, router]);

  if (isLoading) return null;
  if (!isAuthenticated && !isGuestAllowedRoute) return null;

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
