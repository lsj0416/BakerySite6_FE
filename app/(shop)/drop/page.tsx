"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { BreadBox } from "@/components/bread-box";
import { DropBadge } from "@/components/drop-badge";
import * as dropApi from "@/lib/api/drop";
import { productImageUrl } from "@/lib/api/product";
import { dateKey, fmtDateWeekday, fmtTime, msToHMS, pad } from "@/lib/format";
import { COLORS } from "@/lib/theme";
import { toDropStatus } from "@/lib/types";

export default function DropPage() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dropsQuery = useQuery({
    queryKey: ["upcoming-drops", 30],
    queryFn: () => dropApi.getUpcomingDrops(30),
  });

  // getUpcomingDrops는 dropStart 오름차순으로 내려온다 — 그대로면 이미 가장 임박한 순서.
  const drops = useMemo(() => dropsQuery.data ?? [], [dropsQuery.data]);

  // 메인으로 세울 드롭: 지금 판매 중인 게 있으면 그게 최우선(마감 임박이 구매 전환에 더 급함),
  // 없으면 가장 빨리 열리는 예정 드롭. 품절/종료된 건 메인 후보에서 제외한다.
  const mainDrop = useMemo(() => {
    const withStatus = drops.map((drop) => ({ drop, status: toDropStatus(drop.dropStatus, drop.remainQuantity) }));
    return (
      withStatus.find((d) => d.status === "ON_SALE") ?? withStatus.find((d) => d.status === "SCHEDULED")
    )?.drop;
  }, [drops]);

  const mainStatus = mainDrop ? toDropStatus(mainDrop.dropStatus, mainDrop.remainQuantity) : null;
  const mainTarget = mainDrop
    ? new Date(mainStatus === "SCHEDULED" ? mainDrop.dropStart : mainDrop.dropEnd).getTime()
    : null;
  const mainCountdown = mainTarget ? msToHMS(mainTarget - now.getTime()) : null;

  // 나머지 목록(메인으로 이미 보여준 건 중복 노출하지 않음)에서 날짜별로 묶는다.
  const groupedByDay = useMemo(() => {
    const rest = drops.filter((drop) => drop.dropId !== mainDrop?.dropId);
    const groups = new Map<string, typeof rest>();
    for (const drop of rest) {
      const key = dateKey(drop.dropStart);
      const group = groups.get(key);
      if (group) group.push(drop);
      else groups.set(key, [drop]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [drops, mainDrop]);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 md:px-6 md:pb-16 md:pt-12">
      <div className="mb-8 md:mb-12">
        <p className="mb-3 text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.accent }}>
          LIMITED DROP
        </p>
        <h1 className="font-serif text-3xl font-bold md:text-5xl" style={{ color: COLORS.text }}>
          한정 드롭
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 md:text-base" style={{ color: COLORS.muted }}>
          수량과 시간이 한정된 동네 베이커리의 드롭을 만나보세요.
        </p>
      </div>

      {dropsQuery.isLoading ? (
        <div className="mb-10 h-[280px] animate-pulse rounded-[24px]" style={{ background: COLORS.accentSoft }} />
      ) : dropsQuery.isError && drops.length === 0 ? (
        <div className="mb-10 rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-sm" style={{ color: COLORS.muted }}>드롭 목록을 불러오지 못했습니다.</p>
          <button
            onClick={() => dropsQuery.refetch()}
            className="mt-4 rounded-full px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: COLORS.accent }}
          >
            다시 시도
          </button>
        </div>
      ) : mainDrop && mainStatus ? (
        <Link
          href={`/drops/${mainDrop.dropId}`}
          className="group relative mb-10 block min-h-[260px] overflow-hidden rounded-[24px] md:min-h-[340px]"
          style={{ background: COLORS.accentSoft }}
        >
          <BreadBox
            label={mainDrop.name}
            src={productImageUrl(mainDrop.imageUrl)}
            className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold" style={{ color: COLORS.accent }}>
              {mainStatus === "ON_SALE" ? "지금 판매 중" : "다음 드롭"}
            </span>
            {mainCountdown && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <Clock3 size={13} />
                {mainStatus === "ON_SALE" ? "마감까지 " : "오픈까지 "}
                {pad(mainCountdown.h)}:{pad(mainCountdown.m)}:{pad(mainCountdown.s)}
              </span>
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white md:p-8">
            <p className="text-sm text-white/70">
              {mainStatus === "ON_SALE" ? "지금 매장에서 픽업 가능" : `${fmtTime(mainDrop.dropStart)} 오픈 예정`}
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold md:text-4xl">{mainDrop.name}</h2>
            <p className="mt-3 text-lg font-bold">{mainDrop.price.toLocaleString()}원</p>
          </div>
        </Link>
      ) : (
        <div className="mb-10 rounded-2xl border bg-white px-6 py-16 text-center" style={{ borderColor: COLORS.border }}>
          <p className="text-3xl">🥖</p>
          <p className="mt-3 font-semibold" style={{ color: COLORS.text }}>예정된 드롭이 없습니다.</p>
        </div>
      )}

      {groupedByDay.length > 0 && (
        <div className="flex flex-col gap-8">
          {groupedByDay.map(([day, dayDrops]) => (
            <div key={day}>
              <h3 className="mb-3 text-sm font-bold" style={{ color: COLORS.text }}>
                {fmtDateWeekday(dayDrops[0].dropStart)}
              </h3>
              <div className="flex flex-col gap-2">
                {dayDrops.map((drop) => {
                  const status = toDropStatus(drop.dropStatus, drop.remainQuantity);
                  return (
                    <Link
                      key={drop.dropId}
                      href={`/drops/${drop.dropId}`}
                      className="flex items-center gap-3 rounded-xl border bg-white p-3 transition-colors hover:bg-[#FAF5EE]"
                      style={{ borderColor: COLORS.border }}
                    >
                      <BreadBox
                        label={drop.name}
                        src={productImageUrl(drop.imageUrl)}
                        dim={status === "SOLD_OUT" || status === "CLOSED"}
                        className="h-16 w-16 flex-shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold" style={{ color: COLORS.text }}>
                          {drop.name}
                        </p>
                        <p className="mt-0.5 text-sm font-bold" style={{ color: COLORS.text }}>
                          {drop.price.toLocaleString()}원
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                        <DropBadge status={status} />
                        <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>
                          {fmtTime(drop.dropStart)} 오픈
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
