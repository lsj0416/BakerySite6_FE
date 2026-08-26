"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/lib/theme";
import { useAuth } from "@/lib/auth/auth-context";
import * as authApi from "@/lib/api/auth";
import * as sellerApi from "@/lib/api/seller";
import { ApiException } from "@/lib/api/types";

const inputClass = "w-full px-4 py-2.5 rounded-lg text-sm outline-none";

export default function MyPage() {
  const { memberId, role, provider, logout } = useAuth();
  const queryClient = useQueryClient();

  const memberQuery = useQuery({
    queryKey: ["member", memberId],
    queryFn: () => authApi.getMember(memberId!),
    enabled: memberId !== null,
  });

  const sellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    enabled: memberId !== null,
    retry: false,
  });
  const noApplication =
    sellerQuery.isError &&
    sellerQuery.error instanceof ApiException &&
    sellerQuery.error.code === "C003";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  function startEditing() {
    if (!memberQuery.data) return;
    setName(memberQuery.data.name);
    setPhoneNumber(memberQuery.data.phoneNumber);
    setEditing(true);
  }

  const updateMutation = useMutation({
    mutationFn: () => authApi.updateMember(memberId!, { name, phoneNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      setEditing(false);
      setEditError(null);
    },
    onError: (err) =>
      setEditError(err instanceof ApiException ? err.message : "수정에 실패했습니다."),
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(memberId!, { currentPassword, newPassword }),
    onSuccess: () => {
      setPwSuccess(true);
      setPwError(null);
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err) => {
      setPwSuccess(false);
      setPwError(err instanceof ApiException ? err.message : "비밀번호 변경에 실패했습니다.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => authApi.deleteMember(memberId!),
    onSuccess: () => logout(),
  });

  function handleUpdateSubmit(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate();
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    changePasswordMutation.mutate();
  }

  function handleWithdraw() {
    if (window.confirm("정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="flex flex-col flex-1" style={{ background: COLORS.bg }}>
      <div className="px-4 pb-4 flex-shrink-0" style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}>
        <h1 className="text-xl font-bold" style={{ color: COLORS.text }}>
          마이페이지
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4 pb-6">
        {memberQuery.isLoading && (
          <p className="text-sm" style={{ color: COLORS.muted }}>
            불러오는 중...
          </p>
        )}
        {memberQuery.isError && (
          <p className="text-sm" style={{ color: "#E0554F" }}>
            회원 정보를 불러오지 못했습니다.
          </p>
        )}

        {memberQuery.data && (
          <div
            className="rounded-xl p-4"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
                내 정보
              </span>
              {!editing && (
                <button
                  onClick={startEditing}
                  className="text-xs font-semibold"
                  style={{ color: COLORS.accent }}
                >
                  수정
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleUpdateSubmit} className="flex flex-col gap-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름"
                  className={inputClass}
                  style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
                />
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="휴대폰 번호"
                  className={inputClass}
                  style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
                />
                {editError && (
                  <p className="text-xs" style={{ color: "#E0554F" }}>
                    {editError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                    style={{ background: COLORS.accent, color: COLORS.bg }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex-1 py-2 rounded-lg text-sm"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm" style={{ color: COLORS.text }}>
                  {memberQuery.data.name}
                </p>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  {memberQuery.data.email}
                </p>
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  {memberQuery.data.phoneNumber}
                </p>
              </div>
            )}
          </div>
        )}

        {provider !== "GOOGLE" && (
        <div
          className="rounded-xl p-4"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <span className="text-sm font-semibold" style={{ color: COLORS.text }}>
            비밀번호 변경
          </span>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2.5 mt-3">
            <input
              type="password"
              required
              minLength={8}
              maxLength={20}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className={inputClass}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
            />
            <input
              type="password"
              required
              minLength={8}
              maxLength={20}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호"
              className={inputClass}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
            />
            {pwError && (
              <p className="text-xs" style={{ color: "#E0554F" }}>
                {pwError}
              </p>
            )}
            {pwSuccess && (
              <p className="text-xs" style={{ color: COLORS.green }}>
                비밀번호가 변경되었습니다.
              </p>
            )}
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ background: COLORS.accentSoft, color: COLORS.accent }}
            >
              변경
            </button>
          </form>
        </div>
        )}

        {/* isPending 사용 — enabled:false인 동안 isLoading이 false로 평가돼(fetch 시작
            전이므로), memberId가 아직 안 채워진 첫 렌더에 라벨이 잘못 뜨는 걸 막는다. */}
        {!sellerQuery.isPending && (
          <Link
            href={noApplication ? "/seller/register" : "/seller/dashboard"}
            className="w-full py-3 rounded-lg text-sm text-center"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            {noApplication
              ? "판매자 입점 신청"
              : sellerQuery.data?.applicationStatus === "APPROVED"
                ? "내 상품 관리"
                : "판매자 입점 현황"}
          </Link>
        )}
        {role === "ADMIN" && (
          <Link
            href="/admin/approvals"
            className="w-full py-3 rounded-lg text-sm text-center"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            판매자 승인 관리
          </Link>
        )}
        {role === "ADMIN" && (
          <Link
            href="/admin/settlements"
            className="w-full py-3 rounded-lg text-sm text-center"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            정산 관리
          </Link>
        )}

        <button
          onClick={() => logout()}
          className="w-full py-3 rounded-lg text-sm"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        >
          로그아웃
        </button>
        <button
          onClick={handleWithdraw}
          disabled={deleteMutation.isPending}
          className="w-full py-3 rounded-lg text-sm disabled:opacity-60"
          style={{ color: COLORS.muted }}
        >
          회원 탈퇴
        </button>
      </div>
    </div>
  );
}
