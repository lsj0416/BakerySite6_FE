"use client";

import { useAuthGuard } from "@/lib/auth/use-auth-guard";

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  const { blocked } = useAuthGuard();

  if (blocked) return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col">
      {children}
    </div>
  );
}
