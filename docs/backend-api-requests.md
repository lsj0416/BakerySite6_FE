# 백엔드 API 요청 목록

프론트엔드를 개발하면서 필요한데 백엔드에 아직 없는 API를 여기에 기록합니다. 각 항목은 프론트가 필요에 의해 제안하는 스펙이며, 실제 구현 형태는 백엔드팀 판단에 따라 달라질 수 있습니다.

백엔드에 구현되면 이 목록에서 해당 항목을 "해결됨"으로 옮기고, 실제 스펙을 해당 도메인 문서(`docs/*-api.md`)에 정식으로 반영·동기화합니다.

---

## 미해결

**권장 처리 순서** (안전/사고 위험 → 비즈니스 임팩트 → 핵심 기능 공백 → 저비용 필드 추가 → 운영 편의 순, 2026-07-29 논의):

| 순위 | 항목 | 사유 |
| --- | --- | --- |
| ~~1~~ | ~~관리자용 정산 단건 상세 조회~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §5 참고 |
| ~~2~~ | ~~판매자 본인 판매내역(주문) 목록 조회~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §6 참고 |
| ~~3~~ | ~~판매자에게 정산 실패 사유 노출~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §7 참고 |
| ~~4~~ | ~~주문 상세 응답에 판매자 연락처/주소 추가~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §8 참고 |
| ~~5~~ | ~~관리자용 전체 정산 목록 조회~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §9 참고 |
| ~~6~~ | ~~예정된 드롭 목록 조회 (날짜별)~~ | **해결됨(2026-07-29)** — 아래 "해결됨" §10 참고 |
| 보류 | §1 판매자 재신청 엔드포인트 | **보류(2026-07-29)** — 제품 결정으로 재신청 기능 자체를 구현하지 않기로 함. 아래 §1 항목 참고 |

> 우선순위 큐가 전부 소진됐습니다. 미해결 목록에는 보류 중인 §1(판매자 재신청)만 남아 있습니다.

---

### 1. 판매자 재신청 엔드포인트

- **상태:** 보류 (2026-07-29) — 제품 결정으로 재신청 기능 자체를 구현하지 않기로 함. 구현 여부가 재논의되기 전까지 우선순위 큐에서 제외.
- **요청일:** 2026-07-29
- **관련 도메인:** seller
- **배경:** `Seller`-`Member`가 0..1 관계라, 신청 이력이 있으면(반려 포함) `POST /sellers/apply`가 `SE005`로 거부됩니다. `REJECTED` 상태에서 재신청할 방법이 없어, 사업자번호 오타 하나로 그 계정은 영구히 판매자가 될 수 없습니다(`app/seller/register/page.tsx:28-41`가 신청 이력이 있으면 무조건 `/seller/dashboard`로 리다이렉트). 사용자 플로우 개선 분석(2026-07-29)에서 발견된 판매자 온보딩 데드엔드입니다.
- **요청:** `REJECTED` 상태의 신청을 다시 `PENDING`으로 되돌리는 재신청 API. 사업자/계좌 정보를 새로 받아 검증 절차를 처음부터 다시 밟게 하거나, 최소한 상태만 되돌리고 프론트가 폼을 다시 채우게 하는 방식 등 구체적 형태는 백엔드팀 판단에 맡깁니다.
- **호출 시점(예상):** `app/seller/dashboard/page.tsx`의 반려 카드에 "다시 신청하기" 버튼을 눌렀을 때.
- **통신 기본 규격(제안):**
    - **Method:** `PATCH`
    - **Path:** `/api/v1/sellers/me/reapply`

**해결되면 프론트에서 할 일**

- `app/seller/dashboard/page.tsx`의 반려 카드에 "다시 신청하기" 버튼 추가.
- `app/seller/register/page.tsx`의 "신청 이력 있으면 무조건 리다이렉트" 로직에서 `REJECTED`는 예외 처리(재신청 폼으로 진입 허용).

---

## 해결됨

### 1. 내 판매자 신청 조회

- **요청일:** 2026-07-28 / **해결일:** 2026-07-28
- **관련 도메인:** seller
- **최종 스펙:** `GET /api/v1/sellers/me` (Bearer 토큰, memberId 기준 조회). 응답은 `GET /sellers/{id}`와 같은 필드에 `rejectReason`을 추가. 신청 이력 없으면 404 `C003`.
- **프론트 반영 완료(2026-07-28):** `lib/seller/seller-storage.ts`(로컬스토리지 워크어라운드) 삭제하고 `sellerApi.getMySeller()`로 전면 교체 — `app/(shop)/mypage/page.tsx`, `app/seller/dashboard/page.tsx`, `app/seller/register/page.tsx`, `app/seller/drops/new/page.tsx` 모두 이 API로 조회. `retry: false` + `error.code === "C003"` 판별로 "신청 이력 없음" 상태를 구분(`app/(shop)/page.tsx`의 기존 패턴과 동일).

---

### 2. 판매자 승인 대기 목록 조회

- **요청일:** 2026-07-28 / **해결일:** 2026-07-29
- **관련 도메인:** seller
- **최종 스펙:** `GET /api/v1/sellers` (Bearer 토큰, admin 전용). Query `applicationStatus`(생략 시 `PENDING`)로 필터링. 응답은 `MySellerResponse`(`GET /sellers/me`와 동일 필드, `rejectReason` 포함)의 배열. 제안했던 스펙 그대로 구현됨.
- **프론트 반영 완료(2026-07-29):** `lib/api/seller.ts`에 `getPendingSellers(applicationStatus?)` 추가. `app/admin/approvals/page.tsx`를 판매자 ID 직접 입력 방식에서 이 목록 API 기반 카드 리스트 UI로 교체 — 카드를 클릭하면 승인/반려 컨트롤이 펼쳐지고, 처리 성공 시 `["sellers", "pending"]` 쿼리를 invalidate해서 처리된 항목이 목록에서 자동으로 빠짐.

---

### 3. `/internal/v1/settlement-*` 관리자 권한 검사 부재

- **요청일:** 2026-07-29 / **해결일:** 2026-07-28 (요청 시점 이전에 이미 반영됨)
- **관련 도메인:** settlement
- **배경:** `/internal/v1/...` 아래 컨트롤러(배치 실행, 지급 시작/완료/실패 등)에 관리자 role 체크나 내부 서비스 토큰 검증이 없다는 우려였습니다.
- **확인 결과:** `SecurityConfig.java:42`에 `.requestMatchers("/internal/v1/**").hasRole("ADMIN")`이 이미 적용돼 있습니다(커밋 `52ddca6` "feat(settlement): SecurityConfig 정산 관리자 전용 추가", 2026-07-28). `app/admin/layout.tsx`의 클라이언트 사이드 role 가드는 여전히 우회 가능한 방어이므로 UX용으로만 취급하고, 실제 접근 제어는 서버의 `hasRole("ADMIN")`이 담당합니다.

---

### 4. `DELETE /cart` 호출 시 `DropEntry` 상태 복원 여부 (동작 확인 완료)

- **요청일:** 2026-07-29 / **확인일:** 2026-07-29
- **관련 도메인:** cart, drop
- **배경:** 결제 화면(`app/order/order-view.tsx`)에서 이탈하면 프론트가 `DELETE /cart`를 호출해 재고 선점만 해제하는데, 대기열 참여 이력(`DropEntry`)이 그대로 남아있다면 재입장 시 `enterQueue`가 409 `DR006`을 반환해 그 드롭을 다시는 살 수 없게 될 것을 우려했습니다.
- **확인 결과:** `CartService.deleteCart`(`CartService.java:233-238`)가 삭제 전 `DropLockService.rollbackStock`을 호출하고, 여기서 `DropEntry.failEntry()`로 상태를 `FAILED`로 전환합니다(`DropLockService.java:48-56`). `DropEnterService.enterQueue`의 재입장 차단 조건(`blockStatuses`)은 `RESERVED`, `COMPLETED`만 포함하고(`DropEnterService.java:60`) `FAILED`는 애초에 포함된 적이 없습니다 — 즉 `DELETE /cart` 이후 같은 드롭에 다시 `enterQueue`를 호출해도 차단되지 않습니다. (부가적으로 오늘 커밋 `4b79d46`에서 `ENTERED` 상태도 blockStatuses에서 제외되어, 대기열 통과 후 상세만 보고 나간 경우의 재진입도 함께 허용되도록 정리됐습니다.)
- **프론트 반영:** 별도 작업 불필요 — 우려했던 데드엔드가 현재 코드상 발생하지 않음을 확인.

---

### 5. 관리자용 정산 단건 상세 조회 (판매자/금액 확인 없이 지급 실행됨)

- **요청일:** 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** settlement
- **배경:** `app/admin/settlements/page.tsx`의 지급 관리 탭은 정산 ID를 입력하면 지급 이력(`GET /internal/v1/settlements/{id}/payouts`)만 보여줄 뿐, 그 정산이 어느 판매자의 것인지·기간·금액이 얼마인지 확인할 방법이 전혀 없어 관리자가 판매자/금액을 눈으로 확인하지 못한 채 "지급 시작" 버튼을 눌러 실제 송금 절차를 시작하는 문제였습니다. 우선순위 1위(정산 사고 위험 안전장치)로 판단해 가장 먼저 구현했습니다.
- **최종 스펙:** `GET /internal/v1/settlements/{settlementId}` — `settlementId`, `sellerId`, `periodStart`/`periodEnd`, `grossSalesAmount`, `commissionAmount`, `netSalesAmount`, `adjustmentAmount`, `payoutAmount`, `targetCount`, `status`, `createdAt`, `completedAt`을 반환. `/internal/v1/**`는 기존과 동일하게 `SecurityConfig`의 `hasRole("ADMIN")`으로 보호됩니다.
- **백엔드 구현 완료(2026-07-29):**
    - `AdminSettlementController`(`src/main/java/com/openbake/settlement/presentation/AdminSettlementController.java`) 신규 추가 — `GET /internal/v1/settlements/{settlementId}`.
    - `SettlementQueryService`/`SettlementResult`(application 계층), `SettlementResponse`(presentation DTO) 신규 추가. 기존 `SettlementRepository.findById`를 그대로 재사용해 추가 리포지토리 변경 없음.
    - 정산을 찾을 수 없으면 기존 관례대로 `EntityNotFoundException` → 404 `C003`.
    - 단위 테스트(`SettlementQueryServiceTest`) 3건, 컨트롤러 테스트(`AdminSettlementControllerTest`) 1건 추가, 전체 그린 확인. (참고: 같은 패키지의 다른 컨트롤러 테스트 다수가 `@AutoConfigureMockMvc(addFilters = false)` 누락으로 목(mock) JWT 필터가 요청을 그냥 삼켜버려 주석 처리돼 있었음 — 새 테스트는 이 옵션을 추가해 정상 동작을 확인함.)
- **프론트 반영 완료(2026-07-29):** `app/admin/settlements/page.tsx`의 "지급 관리" 탭이 정산 상세(`GET /internal/v1/settlements/{id}`)를 조회해 지급 이력 목록 위에 판매자 ID·정산 기간·건수·판매/수수료/조정 금액·지급액을 담은 요약 카드를 노출하도록 구현됨. "지급 시작" 버튼은 `window.confirm`으로 판매자 ID·지급액·시도 번호를 포함한 확인 다이얼로그를 띄운 뒤에만 `startPayout`을 호출함(`docs/ux-improvement-plan.md` §7과 연계).

---

### 6. 판매자 본인 판매내역(주문) 목록 조회 (대시보드 픽업 집계 포함)

- **요청일:** 2026-07-28 / 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** order
- **배경:** 판매자가 자신의 드롭에 걸린 주문을 확인하고 픽업 수령 후 [구매확정] 버튼을 누르려면 먼저 자신의 판매내역을 주문 단위로 목록 조회할 수 있어야 하는데, `GET /api/v1/orders`는 buyer 스코프라 재사용할 수 없고 `GET /drops/mine`으로는 개별 주문의 `orderId`를 알 방법이 없어 이미 구현된 구매확정(`PATCH /orders/{id}/confirm`)을 실사용하지 못하는 상태였습니다. 판매자 대시보드의 "오늘 픽업 예정"/"날짜별 픽업 집계" 위젯 요구사항도 같은 API 갭에서 나온 것이라 하나로 통합해 처리했습니다.
- **최종 스펙:** `GET /api/v1/sellers/me/orders` — Query `orderState`(선택, `PAID`/`CONFIRMED`/`CANCELED`), `page`(선택, Default 0), `size`(선택, Default 10, 상한 50). 응답은 `orderId`, `dropId`, `dropName`, `buyerName`, `quantity`, `totalAmount`, `orderState`, `pickupDate`, `paidAt`, `confirmedAt`, `canceledAt`을 담은 페이지 목록. 판매자 권한 판정은 로그인 계정의 `sellerId` 존재 여부로(미등록/미승인 계정은 403 `ME004`), 제안했던 스펙 그대로 구현됨.
- **백엔드 구현 완료(2026-07-29):**
    - `SellerOrderController`(`src/main/java/com/openbake/order/presentation/SellerOrderController.java`) 신규 추가 — `GET /api/v1/sellers/me/orders`.
    - `OrderService.getSellerOrders`(기존 `OrderService`에 메서드 추가, `confirm()`과 동일하게 `CurrentSellerProvider`로 sellerId를 판정) — 기존 buyer 스코프 `getOrders`와 대칭 구조.
    - `OrderRepository`에 `findBySellerIdOrderByOrderIdDesc`/`findBySellerIdAndOrderStateOrderByOrderIdDesc` 추가.
    - `SellerOrderSummaryResponse`/`SellerOrderPageResponse`(presentation DTO) 신규 추가. `buyerName`은 `MemberRepository`로 조회(신규 의존성 추가).
    - 단위 테스트(`OrderServiceTest`) 3건, 컨트롤러 테스트(`SellerOrderControllerTest`) 1건 추가 — order 도메인에 기존 테스트가 전무해 이번에 처음 추가됨. 전체 테스트 스위트(178건) 그린 확인.
- **프론트 반영 완료(2026-07-29):**
    - `lib/api/seller-order.ts`의 `getSellerOrders`/`SellerOrderListItem` 타입을 실제 응답 필드(`orderId`, `dropId`, `dropName`, `buyerName`, `quantity`, `totalAmount`, `orderState`, `pickupDate`, `paidAt`, `confirmedAt`, `canceledAt`)에 맞춰 구현.
    - `app/seller/orders/page.tsx`(판매내역 화면)를 상태 필터(전체/픽업대기/구매확정/취소) + 페이지네이션으로 구현하고, "구매확정" 버튼에서 기존 `PATCH /orders/{id}/confirm`(`confirmOrder`)을 호출하도록 연동 — 확정 성공 시 `["sellerOrders"]` 쿼리를 invalidate.
    - `app/seller/dashboard/page.tsx`에 "오늘 픽업 예정"/"날짜별 픽업 집계" 위젯 추가 — 이 API 응답(`size: 100`으로 조회 후 취소 건 제외)을 `pickupDate` 기준으로 클라이언트에서 그룹핑해 오늘 픽업 수량과 향후 7일 막대그래프를 계산.

---

### 7. 판매자에게 정산 실패 사유 노출

- **요청일:** 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** settlement
- **배경:** `SellerSettlementDetailResponse`(`GET /api/v1/sellers/me/settlements/{settlementId}`)에는 `status`만 있고 실패 사유가 없어, 정산이 `FAILED`가 되면 판매자는 빨간 배지만 보고 원인도 다음 조치도 알 수 없는 상태로 남는 문제였습니다.
- **최종 스펙:** 판매자 정산 상세 응답에 가장 최근 payout의 `failureReason`/`failedAt` 필드를 추가. payout 이력이 없거나 아직 실패한 적이 없으면 둘 다 `null`. 제안했던 스펙 그대로 구현됨.
- **백엔드 구현 완료(2026-07-29):**
    - `SellerSettlementDetailResult`/`SellerSettlementDetailResponse`에 `failureReason`, `failedAt` 필드 추가.
    - `SellerSettlementQueryService.getSettlement`에서 `SettlementPayoutRepository.findAllBySettlementId`(기존에 `requestedAt` 내림차순으로 정렬돼 있던 메서드 재사용)의 첫 번째 항목을 "가장 최근 payout"으로 간주해 값을 채움. 새 리포지토리 메서드 추가 없음.
    - 단위 테스트(`SellerSettlementQueryServiceTest`) 3건 추가 — settlement 도메인의 이 서비스에 기존 테스트가 없어 이번에 처음 추가됨.
- **프론트 반영 완료(2026-07-29):** `app/seller/settlements/[settlementId]/page.tsx`의 `FAILED` 상태 분기에서 `settlement.failureReason`이 있으면 실패 사유 텍스트를, `failedAt`이 있으면 실패 일시(`fmtDateTime`)를 함께 노출하도록 구현됨.

---

### 8. 주문 상세 응답에 판매자 연락처/주소 추가

- **요청일:** 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** order
- **배경:** `app/(shop)/orders/[orderId]/page.tsx:100-111`의 "지도 보기"/"전화하기" 버튼이 `OrderDetail.seller`에 주소/전화번호 필드가 없어 애초에 구현이 불가능한 상태였습니다.
- **최종 스펙:** 주문 상세 조회(`GET /api/v1/orders/{id}`) 응답의 `seller` 객체에 `address`, `phoneNumber` 필드 추가. 제안했던 스펙 그대로 구현됨.
- **백엔드 구현 완료(2026-07-29):**
    - `OrderDetailResponse.SellerInfo`에 `address`, `phoneNumber` 필드 추가.
    - `OrderService`에 `resolveSellerInfo` 신규 추가 — `address`는 `Seller.businessAddress`, `phoneNumber`는 `Seller`가 직접 갖지 않아 연결된 `Member.phoneNumber`를 조회(§6 작업 때 추가한 `MemberRepository` 의존성 재사용). 판매자/회원 정보가 없으면 해당 필드는 `null`.
    - 단위 테스트(`OrderServiceTest`에 2건 추가: 정상 케이스, 판매자 정보 없는 케이스) — 전체 테스트 스위트(183건) 그린 확인.
- **프론트 반영 완료(2026-07-29):** `app/(shop)/orders/[orderId]/page.tsx`의 "지도 보기" 버튼이 `order.seller.address`를 구글 지도 검색 URL로 인코딩해 새 탭으로 열고, "전화하기" 버튼이 `order.seller.phoneNumber`로 `tel:` 링크를 실행하도록 구현됨. 두 필드 모두 값이 없으면 해당 버튼은 `disabled` 처리.

---

### 9. 관리자용 전체 정산 목록 조회

- **요청일:** 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** settlement
- **배경:** 관리자 정산 화면(`app/admin/settlements/page.tsx`)에서 지급 처리를 하려면 `settlementId`를 알아야 하는데, 관리자가 정산 ID를 직접 입력하는 임시 UI로 우회하고 있었습니다.
- **최종 스펙:** `GET /internal/v1/settlements` — Query `sellerId`(선택), `periodStart`/`periodEnd`(선택, ISO 날짜), `status`(선택, `SettlementStatus`), `page`(선택, Default 0), `size`(선택, Default 20, 상한 100 — 기존 `MonthlySettlementBatchQueryService`와 동일한 관례). 응답은 `content`/`page`/`size`/`hasNext` 구조(`totalElements`/`totalPages` 없음 — 역시 배치 목록 API와 동일한 관례). `periodStart`/`periodEnd` 필터는 "정산 기간이 조회 범위 안에 포함되는지"(`settlement.periodStart >= periodStart`, `settlement.periodEnd <= periodEnd`) 기준으로 동작합니다. 제안했던 스펙 그대로 구현됨.
- **백엔드 구현 완료(2026-07-29):**
    - `AdminSettlementController`에 `GET /internal/v1/settlements`(파라미터 없는 목록 조회) 추가 — 기존 단건 조회(`GET /internal/v1/settlements/{settlementId}`)와 같은 컨트롤러.
    - `SettlementRepository`(도메인 포트)에 `search(sellerId, periodStart, periodEnd, status, page, size)` 추가. 도메인 계층에는 Spring Data `Page`/`Pageable`을 노출하지 않는 기존 관례를 유지 — `size + 1`건을 조회해 `hasNext`를 판정하는 방식은 `MonthlySettlementBatchQueryService`와 동일.
    - `SettlementJpaRepository`에 nullable 파라미터를 처리하는 `@Query` 기반 `search` 메서드 추가(인프라 계층에서만 `Pageable` 사용).
    - `SettlementQueryService.search`, `SettlementListResult`(application), `SettlementListResponse`(presentation) 신규 추가.
    - 단위 테스트(`SettlementQueryServiceTest`에 3건 추가), 컨트롤러 테스트(`AdminSettlementControllerTest`에 1건 추가) — 전체 테스트 스위트(187건) 그린 확인.
- **프론트 반영 완료(2026-07-29):** `app/admin/settlements/page.tsx`의 "지급 관리" 탭을 정산 ID 직접 입력에서 상태 탭(전체/정산 대기/보류/지급 중/지급 완료/지급 실패) + `sellerId` 필터 + 페이지네이션을 갖춘 목록 UI로 교체. 목록의 카드를 클릭하면 §5에서 구현한 정산 상세 화면으로 전환됨.

---

### 10. 예정된 드롭 목록 조회 (날짜별)

- **요청일:** 2026-07-28 / **해결일:** 2026-07-29
- **관련 도메인:** drop
- **배경:** 홈 화면은 `GET /drops/today/drop`으로 "오늘의 드롭" 딱 하나만 보여줄 수 있어서, 사용자가 앞으로 며칠간 예정된 드롭을 미리 훑어볼 방법이 없었습니다.
- **최종 스펙:** `GET /api/v1/drops/upcoming` — Query `days`(선택, Default 7). 오늘부터 `days`일 동안 `UPCOMING`/`ACTIVE` 상태인 드롭을 `dropStart` 오름차순으로 반환. 응답은 `GET /drops/mine`과 동일한 `DropProductInfoResponse` 배열. 제안했던 스펙 그대로 구현됨. 인증 관련 우려(⚠️ 참고)는 실제로 확인됨 — `SecurityConfig`에 `/api/v1/drops/**`에 대한 별도 `permitAll` 규칙이 없어 기본 정책(`anyRequest().authenticated()`)을 그대로 따르므로, 이 API도 다른 drop 엔드포인트와 동일하게 인증이 필요합니다(SecurityConfig 변경 없이 기존 동작 그대로).
- **백엔드 구현 완료(2026-07-29):**
    - `DropController`에 `GET /api/v1/drops/upcoming` 추가.
    - `DropService.getUpcomingDrops(days)` 신규 추가 — 조회 범위는 오늘 00:00부터 `오늘+days`일 23:59:59:59까지(오늘 이미 시작된 `ACTIVE` 드롭도 포함되도록 시작 시각을 자정 기준으로 잡음). `days`가 0 이하면 `IllegalArgumentException`.
    - `DropRepository`(도메인 포트)에 `findByDropStatusInAndDropStartBetweenOrderByDropStartAsc` 추가 — 기존 `getMyDrops`와 동일하게 `DropInventoryRepository.findByDropId`를 드롭별로 호출해 응답을 조립(N+1이지만 기존 관례를 그대로 따름).
    - 단위 테스트(`DropServiceTest`에 2건 추가), 컨트롤러 테스트(`DropControllerTest` 신규 2건) — drop 프레젠테이션 계층에 컨트롤러 테스트가 전무해 이번에 처음 추가됨. 전체 테스트 스위트(191건) 그린 확인.
- **프론트 반영 완료(2026-07-29):** 홈 화면(`app/(shop)/page.tsx`)이 `GET /drops/today/drop` 단건 조회를 완전히 대체하고 `getUpcomingDrops()` 하나로 통합됨 — 목록의 첫 항목을 기존 "오늘의 드롭" 히어로 카드(카운트다운 포함)로, 나머지는 `dropStart` 날짜별로 그룹핑해 "다가오는 드롭" 섹션에 날짜 헤더 + 가로 스크롤 카드 리스트로 노출.

---

### 11. 게이트웨이가 `/internal/v1/**`(관리자 정산 API)를 라우팅도, 인증 헤더 주입도 하지 않아 관리자 정산 화면이 구조적으로 도달 불가능했음

- **요청일:** 2026-08-26 / **해결일:** 2026-08-26
- **관련 도메인:** settlement, gateway(`beadv7_7_BakerySite6_BE` — 이번엔 예외적으로 백엔드 레포를 직접 수정함, 사용자 명시적 승인받음)
- **배경:** 브라우저 E2E로 `/admin/settlements`를 실제로 열어보니 정산 배치/목록/지급 이력 전부 "불러오는 중..."에서 멈춰 있었다. 원인을 추적한 결과 이전 세션들이 "`/internal/v1/**`는 게이트웨이가 라우팅하지 않아 외부에 안 뚫려 있다"는 걸 **보안상 장점**으로만 기록했는데(`docs/backend-bug-reports.md`의 이전 "해결됨" 항목, `ROADMAP.md` §3), 그 말은 곧 게이트웨이 단일 진입점만 쓰는 프론트(관리자 화면 포함)도 똑같이 도달할 수 없다는 뜻이었다 — 이전 검증은 코드 리딩 기반이었지 실제 게이트웨이 경유 브라우저 테스트가 아니었던 것으로 보인다. 실제로는 두 겹으로 막혀 있었다: (1) `api-gateway/application.yml`에 `/internal/**`를 매칭하는 라우트 자체가 없어 게이트웨이가 자체 404를 반환(브라우저에는 CORS 차단으로 보임 — 라우트 없는 응답엔 CORS 헤더가 안 붙어서), (2) 라우트를 추가해도 `JwtAuthenticationGlobalFilter.isApiRequest()`가 `/api/`로 시작하는 경로만 인증 필터를 태워서 `/internal/**` 요청은 유효한 관리자 토큰이 있어도 `X-Openbake-Member-Id`/`X-Openbake-Member-Role`이 안 채워진 채 root로 넘어가 401.
- **재현(수정 전):** `curl http://localhost:8089/internal/v1/settlements` → 인증 헤더 유무와 무관하게 404(라우트 없음). 라우트만 추가한 뒤엔 유효한 관리자 토큰으로도 401(신원 헤더 미주입).
- **적용한 수정(백엔드, 2026-08-26, 사용자 승인):**
    - `api-gateway/src/main/resources/application.yml` — `core-api`(`Path=/api/**`) 라우트 옆에 `core-internal-api`(`Path=/internal/**`, `uri: ${CORE_SERVICE_URL:http://localhost:8080}`, `order: 10`) 라우트 추가. root의 `SecurityConfig`가 이미 갖고 있는 `hasRole("ADMIN")` 게이트는 그대로 두고 프록시 경로만 열었다.
    - `api-gateway/src/main/java/com/openbake/gateway/filter/JwtAuthenticationGlobalFilter.java` — `isApiRequest()`가 `/api/` 외에 `/internal/`도 인식하도록 확장. 이 필터를 안 태우면 `PublicEndpointPolicy`/JWT 검증/신원 헤더 주입이 전부 스킵된다.
    - 게이트웨이 프로세스만 재시작(사용자 승인, root/member/payment는 무관하게 그대로 둠 — 단, 이 과정과 별개로 세션 도중 메모리 부족으로 세 서비스가 죽어있던 것을 발견해 역시 사용자 승인 받아 함께 재기동함, 아래 최종 보고서의 "남은 위험" 참고).
- **검증:** 재시작 후 `curl http://localhost:8089/internal/v1/settlements`(토큰 없음) → 401(정상 — 라우팅은 되고 인증만 거부). 관리자 계정으로 브라우저 E2E 재실행: `GET /internal/v1/settlement-batches?page=0&size=20` → 200, 화면에 실제 배치 실행 이력(`2026-07-01~2026-08-01 COMPLETED`)이 렌더링됨.
- **프론트 반영:** 불필요 — FE(`app/admin/settlements/page.tsx`)는 처음부터 옳은 경로를 호출하고 있었다. 문제는 전적으로 게이트웨이 쪽이었다.
- **참고:** 이 수정은 로컬 `api-gateway/application.yml`/`JwtAuthenticationGlobalFilter.java`에 직접 반영됐다(다른 백엔드 버그 리포트 항목들과 달리 "로컬 임시 수정, 레포 미반영"이 아니라 실제 파일을 고쳤다 — 백엔드 레포도 커밋되지 않은 변경 상태로 남아 있으니 백엔드팀이 리뷰 후 커밋할지 판단 필요). `ingress.yaml`(프로덕션)도 `/internal`을 라우팅하지 않는 건 동일하게 확인됐으므로, 배포 환경에도 같은 종류의 게이트웨이/ingress 라우트 추가가 필요할 것으로 보인다(이번 세션은 로컬 게이트웨이만 수정).
