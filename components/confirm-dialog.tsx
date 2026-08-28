"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { COLORS } from "@/lib/theme";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Esc·배경 클릭으로 닫을 때. 생략하면 onCancel과 같다.
   *
   * 취소 버튼이 "닫기"가 아니라 그 자체로 또 다른 행동일 때(예: 다른 화면으로 이동)
   * 필요하다 — 그런 다이얼로그에서 Esc가 onCancel을 부르면, 사용자는 그냥 닫으려다
   * 의도치 않은 행동을 실행하게 된다.
   */
  onDismiss?: () => void;
}

/** 공용 확인 다이얼로그. open이 false면 마운트 자체를 하지 않아, 닫힐 때 포커스 복귀·스크롤
 * 해제가 unmount cleanup으로 자연히 처리된다. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogContent {...props} />;
}

function ConfirmDialogContent({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  destructive,
  isPending,
  onConfirm,
  onCancel,
  onDismiss,
}: Omit<ConfirmDialogProps, "open">) {
  const dismiss = onDismiss ?? onCancel;
  const titleId = useId();
  const descId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // isPending/onCancel은 매 렌더 바뀔 수 있지만, 아래 effect는 마운트 시 1회만 돌아야
  // (포커스 저장·스크롤 잠금이 재실행되면 안 됨) 최신값을 ref로 미러링해서 읽는다.
  // ref 쓰기는 렌더 중이 아니라 커밋 이후(effect)에 해야 하므로 별도 effect로 분리.
  const isPendingRef = useRef(isPending);
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    isPendingRef.current = isPending;
    dismissRef.current = dismiss;
  });

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPendingRef.current) {
        dismissRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, []);

  const handleBackdropClick = () => {
    // 요청 진행 중에는 배경 클릭으로 닫지 않는다 — 결과를 못 보고 잃는 것을 방지.
    if (!isPending) dismiss();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] max-h-[85vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
      >
        <h2 id={titleId} className="text-base font-bold" style={{ color: COLORS.text }}>
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-2 text-sm" style={{ color: COLORS.muted }}>
            {description}
          </p>
        )}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 py-3 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ border: `1.5px solid ${COLORS.border}`, color: COLORS.text }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-3 rounded-lg text-sm font-bold disabled:opacity-60"
            style={{
              background: destructive ? COLORS.danger : COLORS.accent,
              color: COLORS.bg,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
