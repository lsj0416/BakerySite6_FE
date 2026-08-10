"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth/auth-context";

const TAB_ROUTES = new Set(["/", "/categories", "/wishlist", "/orders", "/mypage", "/search"]);

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const showTabBar = TAB_ROUTES.has(pathname) || pathname.startsWith("/categories/");
  const useWideLayout =
    pathname === "/" ||
    pathname === "/search" ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/drops/");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

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
