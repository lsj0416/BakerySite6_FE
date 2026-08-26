"use client";

import { useAuthGuard } from "@/lib/auth/use-auth-guard";

// SELLER는 JWT role이 아니라(role은 CUSTOMER/ADMIN뿐) Seller.applicationStatus로만 판정되므로,
// 여기서는 로그인 여부만 막고 승인 상태 확인은 각 페이지가 getMySeller()로 개별 처리한다.
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const { blocked } = useAuthGuard();

  if (blocked) return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col">
      {children}
    </div>
  );
}
