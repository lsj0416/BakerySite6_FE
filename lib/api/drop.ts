import { apiRequest } from "@/lib/api/client";

export type DropApiStatus = "UPCOMING" | "ACTIVE" | "COMPLETED";

export interface DropInfo {
  name: string;
  description: string;
  imageUrl: string;
  dropStart: string;
  dropEnd: string;
  limitQuantity: number;
  price: number;
  totalQuantity: number;
  remainQuantity: number;
  dropStatus: DropApiStatus;
  pickupDates: string[];
}

/**
 * 문서(docs/drop-api.md)상으로는 인증 불필요한 공개 조회 API지만, 실제 로컬 백엔드는
 * 토큰 없이 호출 시 403을 반환한다(2026-07-28 확인) — 문서와 실제 동작이 어긋나는 지점.
 * 이 앱은 (shop) 레이아웃 가드로 어차피 로그인 사용자만 접근하므로, apiRequest로
 * 있는 토큰을 그대로 실어 보낸다.
 *
 * 문서는 이 응답이 ApiResponse 래퍼 없이 최상위로 온다고 적혀 있지만, 실제로는
 * 다른 API와 동일하게 {success,data} 래퍼가 있다(2026-07-28 브라우저 검증으로 확인 —
 * unwrapped:true로 파싱했더니 모든 필드가 undefined가 돼 드롭 카드가 조용히 안 그려지는
 * 버그가 났었음). 그래서 여기선 unwrapped 옵션을 쓰지 않는다.
 */
export function getDropInfo(dropId: number) {
  return apiRequest<DropInfo>(`/api/v1/drops/${dropId}/info`, { auth: "optional" });
}

/**
 * 오늘부터 days일 동안(기본 7일) UPCOMING/ACTIVE 상태인 드롭을 dropStart 오름차순으로 조회.
 * 필드 구성은 `GET /drops/mine`(DropProductInfoResponse)과 동일. 인증 필요(403).
 */
export function getUpcomingDrops(days?: number) {
  return apiRequest<DropProductInfoResponse[]>(
    `/api/v1/drops/upcoming${days !== undefined ? `?days=${days}` : ""}`,
    { auth: "optional" },
  );
}

export interface QueueEnterResponse {
  rank: number;
  status: "WAITING" | "ACTIVE";
}

export function enterQueue(dropId: number) {
  return apiRequest<QueueEnterResponse>(`/api/v1/drops/${dropId}/enter`, {
    method: "POST",
    body: {},
  });
}

export interface QueueRankResponse {
  rank: number;
  status: "WAITING" | "ACTIVE" | "NOT_FOUND";
}

export function getQueueRank(dropId: number) {
  return apiRequest<QueueRankResponse>(`/api/v1/drops/${dropId}/queue/rank`);
}

/** confirm-entry 응답(ConfirmEntryResponse, 2026-08-24 HEAD 기준). pickupDates는 백엔드 Set<LocalDate> 직렬화값. */
export interface ConfirmEntryResponse {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  limitQuantity: number;
  remainQuantity: number;
  pickupDates: string[];
}

export function confirmEntry(dropId: number) {
  return apiRequest<ConfirmEntryResponse>(`/api/v1/drops/${dropId}/confirm-entry`, {
    method: "POST",
    body: {},
  });
}

/** 수량 선택 후 재고 선점(락). confirm-entry로 생긴 참여 기록이 있어야 성공(DR011). */
export function lockStart(dropId: number, quantity: number) {
  return apiRequest<string>(`/api/v1/drops/${dropId}/lock-start`, {
    method: "POST",
    body: { quantity },
  });
}

/**
 * 판매자 본인 드롭 응답(docs/drop-api.md §1.3/§2.3, /mine·PATCH 공용).
 * 고객용 DropInfo와 거의 같지만 dropId가 추가되고, 픽업일 필드명이
 * pickUpAvailableDates로 다르다(두 응답 DTO가 서로 다른 클래스라 이름이 안 맞춰져 있음).
 */
export interface DropProductInfoResponse {
  dropId: number;
  name: string;
  description: string;
  imageUrl: string;
  pickUpAvailableDates: string[];
  dropStart: string;
  dropEnd: string;
  limitQuantity: number;
  price: number;
  totalQuantity: number;
  remainQuantity: number;
  dropStatus: DropApiStatus;
}

/**
 * POST /register와 PATCH /{dropId}가 공유하는 바디 DTO(둘 다 백엔드에서 동일한
 * DropProductInfoRequest를 받음 — 2026-07-28 실제 컨트롤러 확인. 이전엔 register가
 * pickUpAvailableDateList/dropPeriodStart/dropPeriodEnd라는 별도 필드명을 쓴다고
 * 문서에 적혀 있었으나 실제 코드엔 없는 필드라 등록 시 400 C001로 실패했었다).
 */
export interface DropProductInfoRequest {
  name: string;
  description: string;
  imageUrl: string;
  pickUpAvailableDates: string[];
  dropStart: string;
  dropEnd: string;
  limitQuantity: number;
  price: number;
  totalQuantity: number;
}

export function registerDrop(body: DropProductInfoRequest) {
  return apiRequest<DropProductInfoResponse>("/api/v1/drops/register", {
    method: "POST",
    body,
  });
}

/** 로그인한 판매자 본인이 등록한 드롭 전체 조회. 승인된 판매자가 아니면 400 C002. */
export function getMyDrops() {
  return apiRequest<DropProductInfoResponse[]>("/api/v1/drops/mine");
}

/**
 * UPCOMING 상태인 드롭만 수정 가능(그 외엔 409 DR017). ⚠️ totalQuantity를 보내면
 * 백엔드가 남은 재고를 이 값으로 리셋한다(DropInventory.resetQuantity) — 이미 판매된
 * 수량과 무관하게 재고가 통째로 바뀌므로, 호출하는 UI에서 반드시 경고를 보여줘야 한다.
 */
export function updateDrop(dropId: number, body: DropProductInfoRequest) {
  return apiRequest<DropProductInfoResponse>(`/api/v1/drops/${dropId}`, {
    method: "PATCH",
    body,
  });
}

/** UPCOMING 상태인 드롭만 삭제 가능(그 외엔 409 DR017). 204 No Content. */
export function deleteDrop(dropId: number) {
  return apiRequest<void>(`/api/v1/drops/${dropId}`, { method: "DELETE" });
}
