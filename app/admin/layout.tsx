"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, role } = useAuth();
  const { blocked } = useAuthGuard();

  // 로그인은 됐지만 ADMIN이 아닌 경우는 공용 훅의 책임 밖(그 훅은 인증 여부만 봄) —
  // 여기서 별도로 홈으로 돌려보낸다. /login으로 보내지 않으므로 returnTo는 안 붙인다.
  useEffect(() => {
    if (!isLoading && isAuthenticated && role !== "ADMIN") {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, role, router]);

  if (blocked || role !== "ADMIN") return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col">
      {children}
    </div>
  );
}
