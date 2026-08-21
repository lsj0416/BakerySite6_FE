# 백엔드 버그 리포트 v2

일반상품(Product) 등록/수정/삭제/목록 프론트 연동(`docs/ai/product-integration-plan.md`) 작업의 검증 단계에서, 2026-08-18에 로컬 백엔드(`beadv7_7_BakerySite6_BE`)를 직접 띄우고 curl로 전 엔드포인트를 호출해 발견한 버그를 여기에 기록합니다.

기존 `docs/backend-bug-reports.md`(이하 v1)와 별도 문서로 두는 이유: v1은 M5(드롭/장바구니/주문) 도메인 위주였고, 이번 건들은 M6 판매자 **상품(product)** 도메인에서 발견된 것이며 그중 두 건(§1, §2)은 오늘(2026-08-18) 머지된 커밋에서 새로 생긴 리그레션이라 발견 시점을 명확히 구분하기 위함입니다.

이 레포(FE)는 백엔드 코드를 직접 건드리지 않는다는 원칙에 따라, 아래 항목은 전부 **로컬 재현·원인 진단까지만 하고 백엔드 코드는 수정하지 않았습니다**("권장 수정"은 전부 미적용). 검증 작업은 리뷰 전용으로 진행되어 프론트 코드 쪽 수정도 없습니다.

백엔드에 정식 반영되면 이 목록에서 "해결됨"으로 옮겨주세요.

---

## 미해결 (진단만 함, 백엔드 레포 미반영)

### 1. `POST /api/v1/products/register`가 항상 실패한다 (`400 C001 "productID는 필수입니다."`)

- **발견일:** 2026-08-18
- **관련 도메인:** product (`ProductController.registerGeneralProduct`)
- **증상:** 요청 바디와 무관하게 일반상품 등록이 100% 실패합니다. 재현율 100%.
- **재현:**
  ```bash
  TOKEN="<판매자 access token>"
  curl -s -X POST http://localhost:8088/api/v1/products/register \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{
      "name":"모닝빵","description":"테스트","imageUrl":"uploads/tmp/xxx",
      "totalQuantity":10,"price":3000,
      "pickUpAvailableDates":["2026-08-20"],"category":"MEAL_BREADS"
    }'
  # → 400 C001 "productID는 필수입니다."
  ```
- **원인:** `ProductService.register()`(`src/main/java/com/openbake/product/application/ProductService.java` L46-52)가 `ProductInventory.builder().productId(product.getId())`를 `productRepository.save(product)` **호출 전**에 실행합니다. `Product.id`는 DB auto-increment(`IDENTITY`)라 save 전엔 `null`이고, `ProductInventory`의 생성자가 `productId == null`이면 예외를 던지므로 등록 요청은 이 시점에서 항상 죽습니다.
  ```java
  // 현재 코드 (순서 문제)
  Product product = Product.builder()...build();
  ProductInventory productInventory = ProductInventory.builder()
          .productId(product.getId())   // ← 아직 null (save 전)
          .remainQuantity(command.totalQuantity())
          .totalQuantity(command.totalQuantity())
          .build();

  productRepository.save(product);            // ← id가 여기서야 채워짐
  productInventoryRepository.save(productInventory);
  ```
- **원인 커밋:** `git blame` 결과 오늘 머지된 `f836938 "feature: Upload Image At S3"`(PR #158, 2026-08-18 11:46 머지)에서 도입된 리그레션으로 보입니다.
- **권장 수정 (미적용):** `productRepository.save(product)`를 먼저 호출해 `product.getId()`가 채워진 뒤에 `ProductInventory`를 빌드하도록 순서를 바꿔야 합니다.
  ```java
  Product product = Product.builder()...build();
  productRepository.save(product);   // ← 먼저 save해서 id 확보

  ProductInventory productInventory = ProductInventory.builder()
          .productId(product.getId())   // ← 이제 정상적으로 채워짐
          .remainQuantity(command.totalQuantity())
          .totalQuantity(command.totalQuantity())
          .build();
  productInventoryRepository.save(productInventory);
  ```
- **영향:** **일반상품 등록 자체가 현재 백엔드에서 원천적으로 불가능합니다.** `registerDropProduct`도 같은 `register()`를 공유하므로(`Type` 파라미터만 다름) 드롭 등록도 동일하게 영향받는지 별도 확인이 필요합니다.

### 2. `PUT /api/v1/products/{id}`가 항상 실패한다 (`500`, `LazyInitializationException`)

- **발견일:** 2026-08-18
- **관련 도메인:** product (`ProductController.updateGeneralProduct`)
- **증상:** 응답 직렬화 시점에 `Product.pickUpAvailableDates`(`@ElementCollection(fetch = LAZY)`)를 Hibernate 세션이 끝난 뒤 접근해서 500이 발생합니다.
- **서버 로그:**
  ```
  org.hibernate.LazyInitializationException: failed to lazily initialize a collection of role:
  com.openbake.product.domain.Product.pickUpAvailableDates, could not initialize proxy - no Session
  ```
- **원인:** v1 §1·§2("`Drop.pickUpAvailableDate`를 세션 안에서 실제로 강제 로딩하지 않고 그대로 DTO에 흘려보냄")와 정확히 같은 클래스의 문제가 `product` 도메인에도 있습니다. `ProductInfoResult.of(...)` 계열이 `product.getPickUpAvailableDates()`를 참조만 하고 `.size()`/순회 등으로 실제 초기화를 유발하지 않은 채로 응답 DTO에 담는 것으로 추정됩니다.
- **권장 수정 (미적용):** v1 §1에서 드롭 도메인에 적용했던 패턴과 동일하게, `Product`→`ProductInfoResult` 변환 시점에 `new HashSet<>(product.getPickUpAvailableDates())`처럼 컬렉션을 세션이 살아있는 동안 복사해서 넘기면 해결될 것으로 보입니다.
- **영향:** **일반상품 수정도 현재 백엔드에서 원천적으로 불가능합니다.**

### 3. `GET /api/v1/products/seller-product-list`가 `size` 파라미터를 무시하고 항상 20개로 캡된다

- **발견일:** 2026-08-18
- **관련 도메인:** product (`ProductController.getSellerGeneralProductList`, 공통 `application.yml`)
- **증상:** `?size=100`으로 요청해도 응답의 `page.size`가 항상 20으로 돌아오고, 실제 반환되는 `content` 개수도 20개를 넘지 않습니다.
- **재현:**
  ```bash
  curl -s "http://localhost:8088/api/v1/products/seller-product-list?page=0&size=100" \
    -H "Authorization: Bearer $TOKEN" | jq '.data.page'
  # → {"size":20,"number":0,"totalElements":..,"totalPages":..}  (요청한 100이 아니라 20)
  ```
- **원인:** `application.yml`의 `spring.data.web.pageable.max-page-size: 20` 전역 설정이 모든 `Pageable` 자동 바인딩 엔드포인트에 적용되어, 요청 시 지정한 `size`가 20을 넘으면 강제로 20으로 잘립니다.
- **권장 수정 (미적용):** 판매자 본인 상품 목록처럼 "판매자가 자기 데이터를 전부 봐야 하는" 엔드포인트는 `max-page-size` 전역 캡의 영향을 받지 않도록 값을 올리거나(예: 100~200), 이 엔드포인트만 별도 상한을 두는 방식(예: 커스텀 `Pageable` 검증)을 검토해야 합니다.
- **영향:** `docs/ai/product-integration-plan.md`가 제시한 "단일 상품 조회 API 부재" 완화책(수정 화면에서 `getMyProducts(0, 100)`으로 넉넉히 가져와 목록에서 `find`)이 이 전역 캡 때문에 무력화됩니다 — **상품이 21개 이상인 판매자는 21번째 상품부터 수정 화면에서 "상품을 찾을 수 없습니다"를 보게 됩니다.**

### 4. presigned PUT 업로드가 `403 AccessDenied`로 실패한다

- **발견일:** 2026-08-18
- **관련 도메인:** product (`S3ImageAdapter.issueUploadUrl`), 인프라(S3 버킷 정책)
- **증상:** `POST /products/image-upload-url`이 정상적으로 `{uploadUrl, key}`를 반환하지만, 그 `uploadUrl`로 실제 이미지를 PUT하면 S3가 접근을 거부합니다.
- **재현:**
  ```bash
  curl -s -X POST http://localhost:8088/api/v1/products/image-upload-url \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"contentType":"image/png"}'
  # → {"uploadUrl":"https://team06-s3-bakerysite6.s3.ap-northeast-2.amazonaws.com/uploads/tmp/...", "key":"uploads/tmp/..."}

  curl -i -X PUT "<위 uploadUrl>" -H "Content-Type: image/png" --data-binary @test.png
  # → 403 AccessDenied
  ```
- **서버/S3 응답:**
  ```
  <Error><Code>AccessDenied</Code>
  <Message>User: arn:aws:iam::533267244952:user/devcos-team06 is not authorized to perform:
  s3:PutObject on resource: "arn:aws:s3:::team06-s3-bakerysite6/uploads/tmp/..."
  with an explicit deny in a resource-based policy</Message></Error>
  ```
- **원인:** 애플리케이션 코드(presign 생성 로직) 자체는 정상입니다. S3 버킷 정책(팀 공유 버킷)에 `devcos-team06` IAM 사용자의 `s3:PutObject`를 막는 explicit deny가 걸려 있는 것으로 보입니다.
- **권장 수정 (미적용, 코드 범주 밖):** 인프라 담당자가 버킷 정책의 explicit deny 조건을 확인해야 합니다. 앱 코드 수정으로는 해결되지 않습니다.
- **영향:** 이미지 업로드 → 등록으로 이어지는 실제 브라우저 E2E(`docs/ai/product-integration-plan.md`의 "검증 방법" 2번)가 이 환경에서 재현 불가능합니다.

### 5. 장바구니 도메인이 다중 아이템 구조로 리팩터링됐는데 주문 생성(`OrderService.create()`)과 드롭 구매 플로우가 이를 따라가지 못했다

- **발견일:** 2026-08-20
- **관련 도메인:** cart (`CartController`/`CartClient`), order (`OrderService.create()`), drop 구매 플로우
- **증상 1 — 드롭 구매가 100% 깨져 있다:** `lib/api/cart.ts`의 `createCart()`가 호출하는 `POST /api/v1/cart`(구 단일-드롭 장바구니 API)가 더 이상 존재하지 않아 404가 난다. `selectPickupDate`(`PATCH /api/v1/cart/pickup-date`)와 `deleteCart`(`DELETE /api/v1/cart`)도 같은 이유로 항상 실패한다. `CartController`가 최근 "일반상품 전용 다중 아이템 장바구니"(`/api/v1/cart/items`)로 리팩터링되면서, 드롭 구매용 대체 경로가 마련되지 않은 채 구 엔드포인트만 사라졌다.
- **증상 2 — 일반상품도 장바구니 담기까지는 되지만 주문 생성은 실패한다:** `POST /api/v1/cart/items`로 담는 것 자체는 정상 동작하지만, `POST /api/v1/orders`(`OrderService.create()`)가 여전히 옛 단일-드롭 `CartInfo`(dropId 기반) 계약을 그대로 사용하고 있어, 다중 아이템 장바구니로는 주문 생성 단계에서 실패한다(예: 첫 항목만 보고 `dropId=null`로 `dropPort.getDrop(null)`을 호출하는 식).
- **근거:** `CartClient.java`에 백엔드팀이 직접 남긴 TODO 주석:
  > "장바구니에 dropId가 없다... 항목이 여러 개다. CartInfo는 단일 항목을 전제한다... order 개편(후속 이슈)에서 다시 설계한다."
- **원인:** 장바구니 도메인 리팩터링(드롭 전용 단일 장바구니 → 일반상품 전용 다중 아이템 장바구니)이 먼저 반영됐고, 이를 소비하는 order 도메인과 드롭 구매 플로우의 대체 경로 마련이 후속 이슈로 남겨진 채 아직 진행되지 않았다.
- **권장 수정 (미적용, 백엔드팀이 이미 "후속 이슈"로 인지):** (1) 드롭 구매를 위한 새 장바구니/재고 확정 경로를 설계하거나 구 API를 유지하는 방식으로 드롭 구매 플로우를 복구하고, (2) `OrderService.create()`가 다중 아이템 `CartInfo`를 받아 각 아이템(드롭 또는 일반상품)별로 주문을 생성하도록 재설계해야 한다.
- **영향:** **드롭 구매(대기열→입장→재고 선점→주문)가 현재 백엔드에서 원천적으로 불가능하다.** 일반상품은 장바구니 담기/조회/수정까지만 가능하고 결제(주문 생성)는 불가능하다. 프론트는 이 갭을 우회할 수 없으므로(`docs/ai/product-catalog-sync-plan.md` 참고), 일반상품 장바구니 페이지의 "주문하기" 버튼을 비활성화해 사용자가 실패를 겪지 않도록 막아뒀다.

---

## 검증 방법 재현 결과 요약

`docs/ai/product-integration-plan.md`의 "검증 방법" 5단계를 시도한 결과, 위 §1(등록)·§2(수정)·§4(이미지 업로드) 버그 때문에 브라우저 클릭 E2E로는 등록·수정 성공 화면을 재현할 수 없었습니다. 대신 curl로 각 엔드포인트의 요청/응답 계약을 직접 검증했고, 그 결과 프론트 코드(`lib/api/product.ts` 등)는 문서 스펙과 정확히 일치하며 결함이 없음을 확인했습니다 — 위 4건은 전부 백엔드 문제이며 프론트 원인이 아닙니다.

| 단계 | 결과 |
|---|---|
| 1. 로컬 백엔드+프론트 기동 | 백엔드는 오늘자 리그레션이 포함된 이미지로 재빌드 후 기동. 프론트는 `npm run build`/`lint`로 정적 검증 |
| 2. 등록→이미지 표시 확인 | 불가 — §1, §4 |
| 3. 대시보드 목록 표시 | API 레벨로 대체 검증(`GET /seller-product-list` 응답이 프론트 타입과 일치함을 확인) |
| 4. 수정 시나리오 2가지 | 불가 — §2 |
| 5. 미승인 리다이렉트 | 코드 리뷰로 대체(드롭 신규 등록 페이지와 동일한 가드 패턴 재사용 확인) |
