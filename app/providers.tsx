"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ApiException } from "@/lib/api/types";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ApiException은 서버가 준 확정 응답(401/403/404/기타 도메인 에러 코드)이라
            // 재시도해도 결과가 달라지지 않는다 — 인증 실패·존재하지 않는 리소스 조회에서
            // "불러오는 중..."만 몇 초 더 끌다 같은 에러로 끝나는 걸 막는다. 그 외(네트워크
            // 순단 등)는 TanStack Query 기본값(최대 3회)을 유지한다.
            retry: (failureCount, error) => !(error instanceof ApiException) && failureCount < 3,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
