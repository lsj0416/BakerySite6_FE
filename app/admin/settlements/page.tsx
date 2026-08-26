"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackHeader } from "@/components/back-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { COLORS } from "@/lib/theme";
import * as settlementApi from "@/lib/api/settlement";
import type { SettlementStatus } from "@/lib/api/settlement";
import { ApiException } from "@/lib/api/types";
import { PayoutStatusBadge, SettlementStatusBadge } from "@/components/settlement-status-badge";

type SettlementStatusFilter = SettlementStatus | "ALL";

const SETTLEMENT_STATUS_TABS: { key: SettlementStatusFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "READY", label: "정산 대기" },
  { key: "ON_HOLD", label: "보류" },
  { key: "PAYING", label: "지급 중" },
  { key: "COMPLETED", label: "지급 완료" },
  { key: "FAILED", label: "지급 실패" },
];

const inputStyle = {
  background: COLORS.surface,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

const ERROR_COLOR = "#E0554F";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiException ? error.message : fallback;
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultPeriod() {
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { periodStart: formatDate(periodStart), periodEnd: formatDate(periodEnd) };
}

type Tab = "batch" | "payout";

export default function AdminSettlementsPage() {
  const [tab, setTab] = useState<Tab>("batch");

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="정산 관리" href="/" />

      <div className="flex px-4 pt-4 gap-2">
        {(
          [
            { key: "batch", label: "배치 실행" },
            { key: "payout", label: "지급 관리" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={
              tab === item.key
                ? { background: COLORS.accent, color: COLORS.bg }
                : { border: `1px solid ${COLORS.border}`, color: COLORS.text }
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {tab === "batch" ? <BatchTab /> : <PayoutTab />}
      </div>
    </div>
  );
}

function BatchTab() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(defaultPeriod);

  const runMutation = useMutation({
    mutationFn: () => settlementApi.runMonthlyBatch(period),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements", "batches"] });
    },
  });

  const listQuery = useQuery({
    queryKey: ["settlements", "batches"],
    queryFn: () => settlementApi.getBatchExecutions(0, 20),
    refetchInterval: (query) => {
      const executions = query.state.data?.executions ?? [];
      const hasRunning = executions.some((e) => e.status === "STARTING" || e.status === "STARTED");
      return hasRunning ? 5000 : false;
    },
  });

  return (
    <>
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
      >
        <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
          월 정산 배치 실행
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={period.periodStart}
            onChange={(e) => setPeriod((p) => ({ ...p, periodStart: e.target.value }))}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <input
            type="date"
            value={period.periodEnd}
            onChange={(e) => setPeriod((p) => ({ ...p, periodEnd: e.target.value }))}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <p className="text-xs" style={{ color: COLORS.muted }}>
          시작일 포함 ~ 종료일 미포함 구간의 정산 대상을 집계합니다.
        </p>
        {runMutation.isError && (
          <p className="text-xs" style={{ color: ERROR_COLOR }}>
            {errorMessage(runMutation.error, "배치 실행에 실패했습니다.")}
          </p>
        )}
        {runMutation.isSuccess && (
          <p className="text-xs" style={{ color: COLORS.green }}>
            실행됨 — jobExecutionId {runMutation.data.jobExecutionId} ({runMutation.data.status})
          </p>
        )}
        <button
          type="button"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
          style={{ background: COLORS.accent, color: COLORS.bg }}
        >
          {runMutation.isPending ? "실행 중..." : "정산 배치 실행"}
        </button>
      </div>

      <p className="text-xs" style={{ color: COLORS.muted }}>
        배치 실행 이력
      </p>

      {listQuery.isLoading && (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          불러오는 중...
        </p>
      )}
      {listQuery.isError && (
        <p className="text-sm" style={{ color: ERROR_COLOR }}>
          {errorMessage(listQuery.error, "이력을 불러오지 못했습니다.")}
        </p>
      )}
      {listQuery.data && listQuery.data.executions.length === 0 && (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          실행 이력이 없습니다.
        </p>
      )}

      {listQuery.data?.executions.map((execution) => (
        <div
          key={execution.jobExecutionId}
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {execution.periodStart} ~ {execution.periodEnd}
            </span>
            <SettlementStatusBadge status={execution.status} />
          </div>
          <span className="text-xs" style={{ color: COLORS.muted }}>
            jobExecutionId {execution.jobExecutionId}
          </span>
          <span className="text-xs" style={{ color: COLORS.muted }}>
            {execution.startTime ?? "-"} ~ {execution.endTime ?? "-"}
          </span>
          {execution.exitCode && (
            <span className="text-xs" style={{ color: COLORS.muted }}>
              exitCode: {execution.exitCode}
            </span>
          )}
          {execution.status === "FAILED" && execution.exitDescription && (
            <span className="text-xs" style={{ color: ERROR_COLOR }}>
              {execution.exitDescription}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function PayoutTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SettlementStatusFilter>("ALL");
  const [sellerIdFilter, setSellerIdFilter] = useState("");
  const [page, setPage] = useState(0);
  const [settlementId, setSettlementId] = useState<number | null>(null);
  const [externalTxId, setExternalTxId] = useState<Record<number, string>>({});
  const [failureReason, setFailureReason] = useState<Record<number, string>>({});
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);

  const parsedSellerIdFilter = Number(sellerIdFilter);
  const sellerIdFilterValid = sellerIdFilter !== "" && Number.isFinite(parsedSellerIdFilter) && parsedSellerIdFilter > 0;

  const listQuery = useQuery({
    queryKey: ["settlements", "list", statusFilter, sellerIdFilterValid ? parsedSellerIdFilter : null, page],
    queryFn: () =>
      settlementApi.getSettlements({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        sellerId: sellerIdFilterValid ? parsedSellerIdFilter : undefined,
        page,
        size: 20,
      }),
  });

  function changeStatusFilter(status: SettlementStatusFilter) {
    setStatusFilter(status);
    setPage(0);
  }

  function changeSellerIdFilter(value: string) {
    setSellerIdFilter(value);
    setPage(0);
  }

  const settlementQuery = useQuery({
    queryKey: ["settlements", settlementId, "detail"],
    queryFn: () => settlementApi.getSettlement(settlementId!),
    enabled: settlementId !== null,
    retry: false,
  });

  const payoutsQuery = useQuery({
    queryKey: ["settlements", settlementId, "payouts"],
    queryFn: () => settlementApi.getPayoutsForSettlement(settlementId!),
    enabled: settlementId !== null && settlementQuery.isSuccess,
  });

  const invalidatePayouts = () => {
    queryClient.invalidateQueries({ queryKey: ["settlements", settlementId, "payouts"] });
    queryClient.invalidateQueries({ queryKey: ["settlements", settlementId, "detail"] });
    queryClient.invalidateQueries({ queryKey: ["settlements", "list"] });
  };

  /**
   * 서버는 같은 idempotencyKey로 재요청하면 (재시도 성공/실패 여부와 무관하게) 항상 최초 결과를
   * 그대로 반환하고 새 시도를 만들지 않는다(docs/settlement-api.md §6.3 2번). 그래서 매 클릭마다
   * Date.now()로 새 키를 쓰면 멱등성이 없고(네트워크 재시도 시 중복 송금 위험), 반대로 정산ID만으로
   * 고정하면 실패 후 재시도가 영원히 막힌다. "지금까지 조회된 payout 개수"를 시도 번호로 써서, 서버가
   * 아직 새 payout을 만들었는지 확인 못 한 상태(재조회 전)에서는 같은 키를 재사용(재시도 안전)하고,
   * 이전 시도가 실제로 종결된 뒤(FAILED 등, payoutsQuery가 갱신된 뒤)에만 다음 번호로 넘어간다.
   */
  const attemptNumber = (payoutsQuery.data?.payouts.length ?? 0) + 1;
  const nextIdempotencyKey = `PAYOUT-${settlementId}-${attemptNumber}`;
  const hasProcessingPayout = payoutsQuery.data?.payouts.some((p) => p.status === "PROCESSING") ?? false;

  const startMutation = useMutation({
    mutationFn: () => settlementApi.startPayout(settlementId!, nextIdempotencyKey),
    onSuccess: () => {
      invalidatePayouts();
      setPayoutDialogOpen(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (payoutId: number) => settlementApi.completePayout(payoutId, externalTxId[payoutId] ?? ""),
    onSuccess: invalidatePayouts,
  });

  const failMutation = useMutation({
    mutationFn: (payoutId: number) => settlementApi.failPayout(payoutId, failureReason[payoutId] ?? ""),
    onSuccess: invalidatePayouts,
  });

  return (
    <>
      {settlementId === null && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SETTLEMENT_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => changeStatusFilter(tab.key)}
                className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0"
                style={{
                  background: statusFilter === tab.key ? COLORS.accent : COLORS.surface,
                  color: statusFilter === tab.key ? COLORS.bg : COLORS.muted,
                  border: statusFilter === tab.key ? "none" : `1px solid ${COLORS.border}`,
                  fontWeight: statusFilter === tab.key ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            placeholder="sellerId로 필터 (선택)"
            value={sellerIdFilter}
            onChange={(e) => changeSellerIdFilter(e.target.value)}
            inputMode="numeric"
            className="px-4 py-2.5 rounded-lg text-sm outline-none"
            style={inputStyle}
          />

          {listQuery.isLoading && (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              불러오는 중...
            </p>
          )}
          {listQuery.isError && (
            <p className="text-sm" style={{ color: ERROR_COLOR }}>
              {errorMessage(listQuery.error, "정산 목록을 불러오지 못했습니다.")}
            </p>
          )}
          {listQuery.data && listQuery.data.content.length === 0 && (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              조건에 맞는 정산이 없습니다.
            </p>
          )}

          {listQuery.data?.content.map((settlement) => (
            <button
              key={settlement.settlementId}
              type="button"
              onClick={() => setSettlementId(settlement.settlementId)}
              className="rounded-xl p-4 flex flex-col gap-2 text-left"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  판매자 #{settlement.sellerId}
                </span>
                <SettlementStatusBadge status={settlement.status} />
              </div>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                {settlement.periodStart} ~ {settlement.periodEnd} · {settlement.targetCount}건
              </span>
              <span className="text-lg font-bold" style={{ color: COLORS.accent }}>
                지급액 {settlement.payoutAmount.toLocaleString()}원
              </span>
            </button>
          ))}

          {listQuery.data && (page > 0 || listQuery.data.hasNext) && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!listQuery.data.hasNext}
                className="flex-1 py-2 rounded-lg text-xs disabled:opacity-40"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}

      {settlementId !== null && (
        <>
          <button
            type="button"
            onClick={() => setSettlementId(null)}
            className="text-sm font-semibold text-left"
            style={{ color: COLORS.accent }}
          >
            ← 목록으로
          </button>

          {settlementQuery.isLoading && (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              정산 정보를 불러오는 중...
            </p>
          )}
          {settlementQuery.isError && (
            <p className="text-sm" style={{ color: ERROR_COLOR }}>
              {errorMessage(settlementQuery.error, "정산 정보를 불러오지 못했습니다.")}
            </p>
          )}

          {settlementQuery.data && (
            <div
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  판매자 #{settlementQuery.data.sellerId}
                </span>
                <SettlementStatusBadge status={settlementQuery.data.status} />
              </div>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                {settlementQuery.data.periodStart} ~ {settlementQuery.data.periodEnd} ·{" "}
                {settlementQuery.data.targetCount}건
              </span>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                판매 {settlementQuery.data.grossSalesAmount.toLocaleString()}원 · 수수료{" "}
                {settlementQuery.data.commissionAmount.toLocaleString()}원 · 조정{" "}
                {settlementQuery.data.adjustmentAmount.toLocaleString()}원
              </span>
              <span className="text-lg font-bold" style={{ color: COLORS.accent }}>
                지급액 {settlementQuery.data.payoutAmount.toLocaleString()}원
              </span>
            </div>
          )}
        </>
      )}

      {settlementId !== null && settlementQuery.isSuccess && (
        <>
          {payoutsQuery.isLoading && (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              불러오는 중...
            </p>
          )}
          {payoutsQuery.isError && (
            <p className="text-sm" style={{ color: ERROR_COLOR }}>
              {errorMessage(payoutsQuery.error, "지급 이력을 불러오지 못했습니다.")}
            </p>
          )}

          {hasProcessingPayout && (
            <p className="text-xs" style={{ color: COLORS.muted }}>
              이미 처리 중인 지급 건이 있습니다. 완료/실패 처리 후 다시 시도해주세요.
            </p>
          )}
          <button
            type="button"
            onClick={() => setPayoutDialogOpen(true)}
            disabled={startMutation.isPending || hasProcessingPayout || !settlementQuery.data}
            className="py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ background: COLORS.accent, color: COLORS.bg }}
          >
            {startMutation.isPending ? "시작 중..." : `정산 #${settlementId} 지급 시작`}
          </button>

          <ConfirmDialog
            open={payoutDialogOpen}
            title="정산 지급을 시작하시겠어요?"
            confirmLabel="지급 시작"
            cancelLabel="닫기"
            destructive
            isPending={startMutation.isPending}
            onConfirm={() => startMutation.mutate()}
            onCancel={() => setPayoutDialogOpen(false)}
          >
            {settlementQuery.data && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>정산 ID</span>
                  <span style={{ color: COLORS.text }}>{settlementId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>판매자</span>
                  <span style={{ color: COLORS.text }}>#{settlementQuery.data.sellerId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>정산 기간</span>
                  <span style={{ color: COLORS.text }}>
                    {settlementQuery.data.periodStart} ~ {settlementQuery.data.periodEnd}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>지급액</span>
                  <span className="font-semibold" style={{ color: COLORS.text }}>
                    {settlementQuery.data.payoutAmount.toLocaleString()}원
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>시도 번호</span>
                  <span style={{ color: COLORS.text }}>{attemptNumber}번째</span>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs" style={{ color: COLORS.muted }}>
              이 작업은 실제 송금 절차를 시작하며 되돌릴 수 없습니다.
            </p>
            {startMutation.isError && (
              <p className="mt-2 text-xs" style={{ color: ERROR_COLOR }}>
                {errorMessage(startMutation.error, "지급 시작에 실패했습니다.")}
              </p>
            )}
          </ConfirmDialog>

          {payoutsQuery.data && payoutsQuery.data.payouts.length === 0 && (
            <p className="text-sm" style={{ color: COLORS.muted }}>
              지급 이력이 없습니다.
            </p>
          )}

          {payoutsQuery.data?.payouts.map((payout) => (
            <div
              key={payout.payoutId}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                  payoutId {payout.payoutId}
                </span>
                <PayoutStatusBadge status={payout.status} />
              </div>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                {payout.payoutAmount.toLocaleString()}원 · sellerId {payout.sellerId}
              </span>
              <span className="text-xs" style={{ color: COLORS.muted }}>
                요청 {payout.requestedAt}
                {payout.completedAt && ` · 완료 ${payout.completedAt}`}
                {payout.failedAt && ` · 실패 ${payout.failedAt}`}
              </span>
              {payout.externalTransactionId && (
                <span className="text-xs" style={{ color: COLORS.muted }}>
                  externalTransactionId: {payout.externalTransactionId}
                </span>
              )}
              {payout.failureReason && (
                <span className="text-xs" style={{ color: ERROR_COLOR }}>
                  {payout.failureReason}
                </span>
              )}

              {payout.status === "PROCESSING" && (
                <div className="flex flex-col gap-2 pt-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <div className="flex gap-2">
                    <input
                      placeholder="externalTransactionId"
                      value={externalTxId[payout.payoutId] ?? ""}
                      onChange={(e) =>
                        setExternalTxId((prev) => ({ ...prev, [payout.payoutId]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => completeMutation.mutate(payout.payoutId)}
                      disabled={
                        (completeMutation.isPending && completeMutation.variables === payout.payoutId) ||
                        (externalTxId[payout.payoutId] ?? "").trim() === ""
                      }
                      className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 shrink-0"
                      style={{ background: COLORS.green, color: COLORS.bg }}
                    >
                      완료 처리
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      placeholder="실패 사유"
                      value={failureReason[payout.payoutId] ?? ""}
                      onChange={(e) =>
                        setFailureReason((prev) => ({ ...prev, [payout.payoutId]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => failMutation.mutate(payout.payoutId)}
                      disabled={
                        (failMutation.isPending && failMutation.variables === payout.payoutId) ||
                        (failureReason[payout.payoutId] ?? "").trim() === ""
                      }
                      className="px-3 py-2 rounded-lg text-sm disabled:opacity-60 shrink-0"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                    >
                      실패 처리
                    </button>
                  </div>
                  {completeMutation.isError && completeMutation.variables === payout.payoutId && (
                    <p className="text-xs" style={{ color: ERROR_COLOR }}>
                      {errorMessage(completeMutation.error, "완료 처리에 실패했습니다.")}
                    </p>
                  )}
                  {failMutation.isError && failMutation.variables === payout.payoutId && (
                    <p className="text-xs" style={{ color: ERROR_COLOR }}>
                      {errorMessage(failMutation.error, "실패 처리에 실패했습니다.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
