const KEY_PREFIX = "openbake:payment-processing:";

/**
 * payOrder가 outcome=PROCESSING을 반환했을 때만 세우는 마커. React state가 아니라
 * localStorage에 저장하는 이유는 새로고침으로 컴포넌트가 다시 마운트돼도 "결제 결과가
 * 아직 확정되지 않았다"는 사실을 잃지 않기 위함 — PENDING이라는 서버 상태만으로는
 * "아직 시도 안 함"과 "시도했는데 결과를 못 받음"을 구분할 수 없다.
 */
export interface PaymentProcessingMarker {
  orderId: number;
  markedAt: string;
}

function key(orderId: number): string {
  return `${KEY_PREFIX}${orderId}`;
}

export function getProcessingMarker(orderId: number): PaymentProcessingMarker | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key(orderId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PaymentProcessingMarker>;
    if (typeof parsed.orderId !== "number" || typeof parsed.markedAt !== "string") return null;
    return { orderId: parsed.orderId, markedAt: parsed.markedAt };
  } catch {
    return null;
  }
}

export function setProcessingMarker(orderId: number): void {
  if (typeof window === "undefined") return;
  const marker: PaymentProcessingMarker = { orderId, markedAt: new Date().toISOString() };
  localStorage.setItem(key(orderId), JSON.stringify(marker));
}

export function clearProcessingMarker(orderId: number): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(orderId));
}
