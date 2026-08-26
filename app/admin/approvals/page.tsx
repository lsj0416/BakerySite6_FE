"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackHeader } from "@/components/back-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { COLORS } from "@/lib/theme";
import * as sellerApi from "@/lib/api/seller";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiException } from "@/lib/api/types";
import { getBankName } from "@/lib/bank";
import type { MySeller } from "@/lib/api/seller";

const inputStyle = {
  background: COLORS.surface,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

export default function AdminApprovalsPage() {
  const { isAuthenticated, role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{
    seller: MySeller;
    status: "APPROVED" | "REJECTED";
  } | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["sellers", "pending"],
    queryFn: () => sellerApi.getPendingSellers("PENDING"),
    enabled: isAuthenticated && role === "ADMIN",
  });

  const statusMutation = useMutation({
    mutationFn: (body: sellerApi.UpdateSellerStatusRequest) =>
      sellerApi.updateSellerStatus(selectedId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sellers", "pending"] });
      setSelectedId(null);
      setRejectReason("");
      setConfirmTarget(null);
    },
  });

  const rejectReasonMissing = rejectReason.trim() === "";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="판매자 승인" href="/" />

      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        <p className="text-xs" style={{ color: COLORS.muted }}>
          입점 신청 대기 중인 판매자 목록입니다.
        </p>

        {pendingQuery.isLoading && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {pendingQuery.isError && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            {pendingQuery.error instanceof ApiException
              ? pendingQuery.error.message
              : "목록을 불러오지 못했습니다."}
          </p>
        )}
        {pendingQuery.data && pendingQuery.data.length === 0 && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            대기 중인 신청이 없습니다.
          </p>
        )}

        {pendingQuery.data?.map((seller) => {
          const isSelected = selectedId === seller.sellerId;
          return (
            <div
              key={seller.sellerId}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <button
                type="button"
                className="flex items-center justify-between text-left"
                onClick={() => {
                  setSelectedId(isSelected ? null : seller.sellerId);
                  setRejectReason("");
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                    {seller.bakeryName}
                  </span>
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    사업자등록번호 {seller.businessNumber}
                  </span>
                  <span className="text-xs" style={{ color: COLORS.muted }}>
                    정산 계좌 {getBankName(seller.settlementBankCode)} {seller.settlementAccountNumberMasked}
                    {seller.accountVerified ? " (인증됨)" : " (미인증)"}
                  </span>
                </div>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0"
                  style={{ background: COLORS.accentSoft, color: COLORS.accent }}
                >
                  {seller.applicationStatus}
                </span>
              </button>

              {isSelected && (
                <div className="flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <input
                    placeholder="반려 사유 (반려 시)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  />
                  {rejectReasonMissing && (
                    <p className="text-xs" style={{ color: COLORS.muted }}>
                      반려하려면 사유를 입력해주세요.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmTarget({ seller, status: "APPROVED" })}
                      disabled={statusMutation.isPending}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                      style={{ background: COLORS.accent, color: COLORS.bg }}
                    >
                      승인
                    </button>
                    <button
                      onClick={() => setConfirmTarget({ seller, status: "REJECTED" })}
                      disabled={statusMutation.isPending || rejectReasonMissing}
                      className="flex-1 py-2.5 rounded-lg text-sm disabled:opacity-60"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                    >
                      반려
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={
          confirmTarget?.status === "APPROVED"
            ? "이 판매자를 승인하시겠어요?"
            : "이 판매자를 반려하시겠어요?"
        }
        confirmLabel={confirmTarget?.status === "APPROVED" ? "승인" : "반려"}
        cancelLabel="닫기"
        destructive={confirmTarget?.status === "REJECTED"}
        isPending={statusMutation.isPending}
        onConfirm={() => {
          if (!confirmTarget) return;
          statusMutation.mutate(
            confirmTarget.status === "APPROVED"
              ? { applicationStatus: "APPROVED" }
              : { applicationStatus: "REJECTED", rejectReason },
          );
        }}
        onCancel={() => setConfirmTarget(null)}
      >
        {confirmTarget && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.muted }}>상호명</span>
              <span style={{ color: COLORS.text }}>{confirmTarget.seller.bakeryName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.muted }}>사업자등록번호</span>
              <span style={{ color: COLORS.text }}>{confirmTarget.seller.businessNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.muted }}>정산 계좌</span>
              <span style={{ color: COLORS.text }}>
                {getBankName(confirmTarget.seller.settlementBankCode)}{" "}
                {confirmTarget.seller.settlementAccountNumberMasked}
                {confirmTarget.seller.accountVerified ? " (인증됨)" : " (미인증)"}
              </span>
            </div>
            {confirmTarget.status === "REJECTED" && (
              <div className="flex justify-between text-sm gap-3">
                <span className="shrink-0" style={{ color: COLORS.muted }}>
                  반려 사유
                </span>
                <span className="text-right" style={{ color: COLORS.text }}>
                  {rejectReason}
                </span>
              </div>
            )}
          </div>
        )}
        {statusMutation.isError && (
          <p className="mt-2 text-xs" style={{ color: "#E0554F" }}>
            {statusMutation.error instanceof ApiException
              ? statusMutation.error.message
              : "처리에 실패했습니다."}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
