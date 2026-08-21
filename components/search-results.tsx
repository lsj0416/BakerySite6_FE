"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { COLORS } from "@/lib/theme";

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search");
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-8 md:px-6 md:pt-12">
        <h1 className="font-serif text-3xl font-bold md:text-4xl" style={{ color: COLORS.text }}>상품 검색</h1>
        <form onSubmit={submit} className="relative mt-6 max-w-2xl">
          <label htmlFor="search-page-input" className="sr-only">상품 검색어</label>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={20} color={COLORS.muted} />
          <input
            id="search-page-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="찾고 싶은 빵을 입력하세요"
            className="h-14 w-full rounded-xl border bg-white pl-12 pr-28 outline-none"
            style={{ borderColor: COLORS.border, color: COLORS.text }}
          />
          <button type="submit" className="absolute right-2 top-2 h-10 rounded-lg px-5 text-sm font-bold text-white" style={{ background: COLORS.accent }}>검색</button>
        </form>
      </div>

      {initialQuery ? (
        <CatalogBrowser keyword={initialQuery} />
      ) : (
        <p className="mx-auto w-full max-w-[1200px] px-4 py-16 text-center text-sm md:px-6" style={{ color: COLORS.muted }}>
          상품명이나 설명으로 빵을 찾아보세요.
        </p>
      )}
    </>
  );
}
