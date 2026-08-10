"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, role } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (role !== "ADMIN") {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, role, router]);

  if (isLoading || !isAuthenticated || role !== "ADMIN") return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col">
      {children}
    </div>
  );
}
