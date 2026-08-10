"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth/auth-context";

const TAB_ROUTES = new Set(["/", "/categories", "/wishlist", "/orders", "/mypage"]);

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const showTabBar = TAB_ROUTES.has(pathname);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-dvh w-full">
      <SiteHeader />
      <div className={showTabBar ? "min-h-0 pb-[76px] md:pb-0" : "min-h-0"}>{children}</div>
      {showTabBar && <TabBar activeHref={pathname} />}
    </div>
  );
}
