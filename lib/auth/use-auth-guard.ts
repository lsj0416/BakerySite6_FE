"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

interface UseAuthGuardOptions {
  /** true면 미인증이어도 리다이렉트하지 않는다(예: 게스트에게 열어둔 라우트). */
  bypass?: boolean;
}

/**
 * (shop)/admin/order/wallet/seller 레이아웃 5곳에 중복돼 있던 "미인증이면 /login으로"
 * 가드를 하나로 합친 것. 리다이렉트 시 현재 경로(쿼리 포함)를 returnTo로 실어 보내
 * 로그인 후 원래 화면으로 돌아올 수 있게 한다. role 등 레이아웃별 추가 조건(예: admin의
 * ADMIN 역할 확인)은 각 레이아웃이 이 훅과 별개로 처리한다 — 훅은 "인증 여부"만 책임진다.
 */
export function useAuthGuard({ bypass = false }: UseAuthGuardOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || bypass || isAuthenticated) return;
    // useSearchParams()는 정적 렌더링에 Suspense 경계를 요구하므로(레이아웃에 그걸
    // 강제하고 싶지 않음), 리다이렉트 시점(effect, 클라이언트 전용)에만 필요한
    // 쿼리 문자열을 window.location에서 직접 읽는다.
    const search = typeof window !== "undefined" ? window.location.search : "";
    const returnTo = `${pathname}${search}`;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [isLoading, bypass, isAuthenticated, pathname, router]);

  const blocked = isLoading || (!isAuthenticated && !bypass);
  return { isLoading, isAuthenticated, blocked };
}
