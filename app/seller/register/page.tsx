"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/back-header";
import { COLORS } from "@/lib/theme";
import * as sellerApi from "@/lib/api/seller";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiException } from "@/lib/api/types";
import { BANK_CODE_LABEL, BANK_CODES, getBankName } from "@/lib/bank";

const inputClass = "w-full px-4 py-3 rounded-lg text-sm outline-none";
const inputStyle = {
  background: COLORS.surface,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

type Step = 1 | 2 | 3;

const DRAFT_KEY = "seller-apply-draft";

interface SellerApplyDraft {
  step: Step;
  business: { businessNumber: string; businessAddress: string; businessRepresentativeName: string };
  account: { bankCode: string; accountNumber: string; accountHolder: string };
  verificationRequestId: string | null;
  bakeryName: string;
}

/** 새로고침해도 여기까지 온 입력(1원 송금 인증 포함)이 날아가지 않게 sessionStorage에서 복원한다. */
function readDraft(): SellerApplyDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SellerApplyDraft) : null;
  } catch {
    return null;
  }
}

export default function SellerRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { memberId } = useAuth();

  // Seller-Member는 0..1 관계 — 이미 신청한 회원이 다시 신청 폼을 채워도
  // 서버가 SE005(이미 신청 완료)로 거부하므로, 신청 이력이 있으면 아예
  // 대시보드로 돌려보낸다.
  const mySellerQuery = useQuery({
    queryKey: ["mySeller"],
    queryFn: sellerApi.getMySeller,
    enabled: memberId !== null,
    retry: false,
  });
  useEffect(() => {
    if (mySellerQuery.data) {
      sessionStorage.removeItem(DRAFT_KEY);
      router.replace("/seller/dashboard");
    }
  }, [mySellerQuery.data, router]);

  const [step, setStep] = useState<Step>(() => readDraft()?.step ?? 1);
  const [business, setBusiness] = useState(
    () =>
      readDraft()?.business ?? {
        businessNumber: "",
        businessAddress: "",
        businessRepresentativeName: "",
      },
  );

  const [account, setAccount] = useState(
    () => readDraft()?.account ?? { bankCode: "", accountNumber: "", accountHolder: "" },
  );
  const [verificationRequestId, setVerificationRequestId] = useState<string | null>(
    () => readDraft()?.verificationRequestId ?? null,
  );
  const [mockCode, setMockCode] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");

  const [bakeryName, setBakeryName] = useState(() => readDraft()?.bakeryName ?? "");

  useEffect(() => {
    const draft: SellerApplyDraft = { step, business, account, verificationRequestId, bakeryName };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [step, business, account, verificationRequestId, bakeryName]);

  const verifyBusinessMutation = useMutation({
    mutationFn: () => sellerApi.verifyBusiness(business),
    onSuccess: (res) => {
      if (res.verified) setStep(2);
    },
  });

  const requestAccountMutation = useMutation({
    mutationFn: () => sellerApi.requestAccountVerification(account),
    onSuccess: (res) => {
      setVerificationRequestId(res.verificationRequestId);
      setMockCode(null);
    },
  });

  const mockCodeMutation = useMutation({
    mutationFn: () => sellerApi.getMockVerificationCode(verificationRequestId!),
    onSuccess: (res) => setMockCode(res.code),
  });

  const verifyAccountMutation = useMutation({
    mutationFn: () => sellerApi.verifyAccountCode(verificationRequestId!, verificationCode),
    onSuccess: (res) => {
      if (res.verified) setStep(3);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      sellerApi.applySeller({
        bakeryName,
        businessNumber: business.businessNumber,
        businessAddress: business.businessAddress,
        businessRepresentativeName: business.businessRepresentativeName,
      }),
    onSuccess: () => {
      sessionStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["mySeller"] });
      router.push("/seller/dashboard");
    },
  });

  function errorMessage(err: unknown, fallback: string) {
    return err instanceof ApiException ? err.message : fallback;
  }

  function handleBusinessSubmit(e: FormEvent) {
    e.preventDefault();
    verifyBusinessMutation.mutate();
  }

  function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    requestAccountMutation.mutate();
  }

  function handleVerifyCodeSubmit(e: FormEvent) {
    e.preventDefault();
    verifyAccountMutation.mutate();
  }

  function handleApplySubmit(e: FormEvent) {
    e.preventDefault();
    applyMutation.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
      <BackHeader title="판매자 입점 신청" href="/seller/dashboard" />

      <div className="px-4 py-4 flex items-center gap-2 flex-shrink-0">
        {(["사업자 인증", "계좌 인증", "신청"] as const).map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full h-1 rounded-full"
                style={{ background: step >= n ? COLORS.accent : COLORS.border }}
              />
              <span
                className="text-[11px]"
                style={{ color: step >= n ? COLORS.accent : COLORS.muted }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 px-4 pb-6 flex flex-col gap-4">
        {step === 1 && (
          <form onSubmit={handleBusinessSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder="사업자등록번호 (123-45-67890)"
              value={business.businessNumber}
              onChange={(e) => setBusiness((b) => ({ ...b, businessNumber: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
            <input
              required
              placeholder="사업장 주소"
              value={business.businessAddress}
              onChange={(e) => setBusiness((b) => ({ ...b, businessAddress: e.target.value }))}
              className={inputClass}
              style={inputStyle}
            />
            <input
              required
              placeholder="대표자명"
              value={business.businessRepresentativeName}
              onChange={(e) =>
                setBusiness((b) => ({ ...b, businessRepresentativeName: e.target.value }))
              }
              className={inputClass}
              style={inputStyle}
            />
            {verifyBusinessMutation.isError && (
              <p className="text-xs" style={{ color: "#E0554F" }}>
                {errorMessage(verifyBusinessMutation.error, "사업자 인증에 실패했습니다.")}
              </p>
            )}
            <button
              type="submit"
              disabled={verifyBusinessMutation.isPending}
              className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
              style={{ background: COLORS.accent, color: COLORS.bg }}
            >
              {verifyBusinessMutation.isPending ? "인증 중..." : "인증"}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm font-semibold text-left"
              style={{ color: COLORS.accent }}
            >
              ← 이전
            </button>
            <form onSubmit={handleAccountSubmit} className="flex flex-col gap-3">
              <select
                required
                value={account.bankCode}
                onChange={(e) => setAccount((a) => ({ ...a, bankCode: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              >
                <option value="" disabled>
                  은행 선택
                </option>
                {BANK_CODES.map((code) => (
                  <option key={code} value={code}>
                    {BANK_CODE_LABEL[code]}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="계좌번호 (숫자만, 10~14자리)"
                value={account.accountNumber}
                onChange={(e) => setAccount((a) => ({ ...a, accountNumber: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
              <input
                required
                placeholder="예금주명"
                value={account.accountHolder}
                onChange={(e) => setAccount((a) => ({ ...a, accountHolder: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
              {requestAccountMutation.isError && (
                <p className="text-xs" style={{ color: "#E0554F" }}>
                  {errorMessage(requestAccountMutation.error, "계좌 인증 요청에 실패했습니다.")}
                </p>
              )}
              <button
                type="submit"
                disabled={requestAccountMutation.isPending}
                className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: COLORS.accentSoft, color: COLORS.accent }}
              >
                {requestAccountMutation.isPending ? "요청 중..." : "1원 송금 인증 요청"}
              </button>
            </form>

            {verificationRequestId && (
              <form
                onSubmit={handleVerifyCodeSubmit}
                className="flex flex-col gap-3 pt-3"
                style={{ borderTop: `1px solid ${COLORS.border}` }}
              >
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  입금자명에 표시된 4자리 코드를 입력하세요.
                </p>
                <button
                  type="button"
                  onClick={() => mockCodeMutation.mutate()}
                  disabled={mockCodeMutation.isPending}
                  className="text-xs text-left"
                  style={{ color: COLORS.info }}
                >
                  [DEV] 목업 인증 코드 확인
                </button>
                {mockCode && (
                  <p className="text-sm font-mono" style={{ color: COLORS.text }}>
                    코드: {mockCode}
                  </p>
                )}
                <input
                  required
                  placeholder="인증 코드 4자리"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
                {verifyAccountMutation.isError && (
                  <p className="text-xs" style={{ color: "#E0554F" }}>
                    {errorMessage(verifyAccountMutation.error, "인증 코드가 일치하지 않습니다.")}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={verifyAccountMutation.isPending}
                  className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
                  style={{ background: COLORS.accent, color: COLORS.bg }}
                >
                  {verifyAccountMutation.isPending ? "확인 중..." : "확인"}
                </button>
              </form>
            )}
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleApplySubmit} className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm font-semibold text-left"
              style={{ color: COLORS.accent }}
            >
              ← 이전
            </button>
            <div
              className="rounded-xl p-4 flex flex-col gap-1.5"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <p className="text-xs" style={{ color: COLORS.muted }}>
                사업자등록번호
              </p>
              <p className="text-sm" style={{ color: COLORS.text }}>
                {business.businessNumber}
              </p>
              <p className="text-xs mt-2" style={{ color: COLORS.muted }}>
                사업장 주소
              </p>
              <p className="text-sm" style={{ color: COLORS.text }}>
                {business.businessAddress}
              </p>
              <p className="text-xs mt-2" style={{ color: COLORS.muted }}>
                정산 계좌
              </p>
              <p className="text-sm" style={{ color: COLORS.text }}>
                {getBankName(account.bankCode)} {account.accountNumber} ({account.accountHolder})
              </p>
            </div>
            <input
              required
              placeholder="베이커리 상호명"
              value={bakeryName}
              onChange={(e) => setBakeryName(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
            {applyMutation.isError && (
              <p className="text-xs" style={{ color: "#E0554F" }}>
                {errorMessage(applyMutation.error, "입점 신청에 실패했습니다.")}
              </p>
            )}
            <button
              type="submit"
              disabled={applyMutation.isPending}
              className="w-full py-3.5 rounded-lg text-sm font-bold disabled:opacity-60"
              style={{ background: COLORS.accent, color: COLORS.bg }}
            >
              {applyMutation.isPending ? "신청 중..." : "신청하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
