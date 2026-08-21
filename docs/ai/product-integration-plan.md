# 일반상품(Product) 등록 기능 프론트 연동 계획

작성일: 2026-08-18
스코프: 등록 + 수정 + 삭제 + 판매자 본인 목록 (드롭과 동일한 CRUD 패턴). 홈/카테고리 화면에 일반상품을 노출하는 카탈로그 통합은 이번 스코프 밖.

## 배경

지금까지 이 프론트는 드롭(한정판매)만 다뤘다. 백엔드(`../beadv7_7_BakerySite6_BE`)의 `com.openbake.product` 패키지에는 드롭과 별개로 **일반상품(상시 판매) 등록/수정/삭제/판매자용 목록/전체 목록·검색 API가 이미 완성되어 있음**이 확인됐다. 이번 문서는 이 기존 백엔드 API를 프론트와 연결하기 위한 조사 결과와 구현 계획을 정리한다.

드롭과 결정적으로 다른 지점이 하나 있다: 드롭 등록 폼은 `imageUrl`을 그냥 텍스트로 받아 그대로 저장하지만, 일반상품 API는 `imageUrl` 필드에 **presigned URL로 S3에 먼저 업로드한 임시 key**를 넣어야 서버가 최종 경로로 옮겨준다(`ProductController.registerGeneralProduct` → `s3ImagePort.promote`). 임의 URL 문자열을 넣으면 `promote`가 S3에서 그 key를 찾지 못해 실패한다. 따라서 이 기능은 파일 선택 → presigned PUT 업로드 → 반환된 key를 폼에 반영하는 UI를 새로 구현해야 한다(기존 드롭 폼에서 재사용할 패턴이 없음).

## 백엔드 API 스펙

`ProductController` (`/Users/sejong/Desktop/programmers/beadv7_7_BakerySite6_BE/src/main/java/com/openbake/product/presentation/ProductController.java`), `@RequestMapping("/api/v1/products")`. **전부 인증 필요** — `SecurityConfig`에 `/api/v1/products/**`에 대한 `permitAll` 매처가 없어 Swagger 설명(공개 API처럼 적혀있는 항목들)과 달리 목록/자동완성/이미지 업로드 URL 발급까지 전부 토큰이 있어야 호출된다.

| 기능 | Method/URL | Request | Response |
|---|---|---|---|
| 이미지 업로드 URL 발급 | `POST /image-upload-url` | `{ contentType: string }` | `{ uploadUrl: string, key: string }` (3분 유효 presigned PUT, `key`는 `uploads/tmp/{uuid}`) |
| 등록 | `POST /register` | `ProductInfoRequest` | `ProductInfoResponse` |
| 수정 | `PUT /{productId}` | `ProductInfoRequest` | `ProductInfoResponse` |
| 삭제 | `DELETE /{productId}` | - | `ApiResponse<string>`("삭제 완료", **204 아님** — 드롭 삭제와 다름) |
| 판매자 본인 목록 | `GET /seller-product-list?page=&size=` | - | `PagedModel<ProductInfoResponse>` = `{ content: [...], page: {size,number,totalElements,totalPages} }` (기본 size=20, sort=id DESC) |
| 전체 목록/검색 (이번 스코프 밖) | `GET /product-list?keyword=&category=` | - | 위와 동일 페이지 구조 (기본 sort=category ASC) |
| 자동완성 (이번 스코프 밖) | `GET /autocomplete?keyword=` | - | `string[]` |

### `ProductInfoRequest`

| 필드 | 타입 | 검증 |
|---|---|---|
| name | string | `@NotBlank` |
| description | string | `@NotBlank` |
| imageUrl | string | `@NotBlank` — presigned 업로드로 받은 key |
| totalQuantity | int | `@Positive` |
| price | int | `@Positive` |
| pickUpAvailableDates | `Set<LocalDate>` (문자열 배열로 직렬화) | `@NotEmpty`, 과거 날짜 불가(엔티티 검증) |
| category | `Category` enum | `@NotNull` |

### `Category` enum (5개)

드롭 카탈로그용 프론트 `lib/catalog.ts`의 `CategorySlug`(6종: bread/bagel/pastry/dessert/healthy/gift, 이름/설명 키워드로 추론)와는 **완전히 별개 체계**다. 이번 스코프에선 이 enum 값을 그대로 select box 옵션으로 노출한다(카탈로그 통합은 스코프 밖이므로 두 체계를 매핑할 필요 없음).

- `MEAL_BREADS` — 식사빵
- `SWEET_BREADS` — 간식빵
- `CAKES_TARTS` — 케이크/타르트
- `JAM_SPREAD` — 잼/스프레드
- `COOKIES_BAKES` — 쿠키/구움과자

### `ProductInfoResponse`

`ProductInfoRequest`의 모든 필드 + `productId`(Long), `remainQuantity`(int), `type`(`"GENERAL" | "DROP"`).

### 에러 코드

| 코드 | HTTP | 의미 |
|---|---|---|
| C001 | 400 | 잘못된 요청(검증 실패) |
| PR001 | 404 | 존재하지 않는 일반 상품 |
| PR002 | 400 | 판매자 본인의 상품이 아님 |
| PR005 | 400 | 상품 타입 불일치(드롭 ID로 상품 API 호출 등) |
| PR006 | 404 | 상품 이미지를 업로드 해주세요 |
| DR015 | 400 | 복구할 재고와 남은 재고의 합이 총 발매 수량보다 큼 |

## 연동 전 반드시 알아야 할 백엔드 갭/함정 (⚠️)

1. **수정 시 이미지 교체는 promote가 안 걸린다.** `ProductController.updateGeneralProduct`는 `s3ImagePort.promote()`를 호출하지 않고 `command.imageUrl()`을 그대로 엔티티에 저장한다(`Product.updateProduct`, L79-90). 즉 수정 화면에서 새 이미지를 업로드해 새 tmp key(`uploads/tmp/...`)를 보내면, 그 tmp 파일이 최종 경로로 옮겨지지 않은 채 DB에 tmp key가 그대로 저장된다 — tmp 정리 배치가 있다면 이미지가 깨질 수 있다. 프론트 임시 완화책: 수정 화면에서 이미지를 바꾸지 않으면 기존(이미 promote된) `imageUrl` 값을 그대로 재전송하고, 새 이미지로 바꾸는 경우엔 화면에 경고 문구를 노출한다. 근본 해결은 백엔드가 수정 시에도 promote를 호출하도록 고치는 것 — `docs/backend-bug-reports.md`에 기록해두는 걸 권장(이 레포의 기존 컨벤션).
2. **`promote`가 반환하는 `imageUrl`은 전체 URL이 아니라 S3 key다** (`products/{productId}/{filename}` 형태, `S3ImageAdapter.promote`). 브라우저에서 이미지를 표시하려면 프론트가 `https://{bucket}.s3.{region}.amazonaws.com/{key}` 형태로 직접 조합해야 한다. `application.yml` 확인 결과 버킷은 `team06-s3-bakerysite6`, 리전은 `ap-northeast-2`(둘 다 env override 가능: `S3_BUCKET_NAME`, `S3_REGION`). 이 값을 프론트 env(예: `NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL`)로 뺄지 결정 필요. **S3 버킷이 익명 GET을 허용하는지도 별도 확인 필요**(막혀 있으면 이미지가 403/404).
3. **단일 상품 상세 조회(`GET /{productId}`) API가 없다.** 서비스 메서드(`ProductService.getProductInfo`)는 있지만 컨트롤러에 노출된 엔드포인트가 없다. 드롭 수정 화면이 이미 썼던 패턴(`getMyDrops()` 목록에서 `find`)을 그대로 재사용 — `getMyProducts()`(페이지네이션) 결과에서 `productId`로 찾는다. 페이지 크기가 작으면 상품이 많은 판매자는 못 찾을 수 있으니 최소 `size` 여유 있게(예: 100) 요청.
4. base URL 라우팅: product API는 `member-service`/`payment-service` 전용 prefix(`/api/v1/auth/`, `/api/v1/members/`, `/api/v1/deposit/`, `/api/v1/webhooks/`)에 걸리지 않으므로 `lib/api/client.ts`의 `resolveBaseUrl`이 자동으로 모놀리스 `BASE_URL`로 보낸다 — **`client.ts` 수정 불필요**.

## 프론트 구현 계획

### 1. `lib/api/product.ts` 신규 (템플릿: `lib/api/drop.ts`)

- `ProductCategory` 유니온 타입(5개 enum 값) + 한글 라벨 매핑(`PRODUCT_CATEGORY_LABEL`).
- `ProductInfoRequest`/`ProductInfoResponse` 인터페이스 (백엔드 필드 그대로, 위 표 참고).
- `issueImageUploadUrl(contentType: string)`: `POST /api/v1/products/image-upload-url` → `{uploadUrl, key}`.
- `uploadToPresignedUrl(uploadUrl: string, file: File)`: `apiRequest`를 거치지 않는 **별도의 raw fetch**. S3 프리사인드 URL은 이 백엔드 envelope과 무관하고 Authorization 헤더를 붙이면 서명이 안 맞아 실패한다. `fetch(uploadUrl, {method:"PUT", headers:{"Content-Type":file.type}, body:file})`, 실패 시 직접 에러 throw.
- `registerProduct(body: ProductInfoRequest)`: `POST /api/v1/products/register`.
- `updateProduct(productId, body)`: `PUT /api/v1/products/{productId}`.
- `deleteProduct(productId)`: `DELETE /api/v1/products/{productId}` → 반환 타입 `string`(204 아님, `drop.ts`의 `deleteDrop`과 다르게 처리해야 함).
- `getMyProducts(page?, size?)`: `GET /api/v1/products/seller-product-list?...` → Spring `PagedModel` 구조(`{content, page}`)를 그대로 반영한 타입 정의.
- `productImageUrl(key: string)`: key를 표시 가능한 전체 S3 URL로 변환하는 헬퍼(갭 2 참고, base URL은 env 또는 상수).
- 드롭 API 파일 컨벤션대로, 위 갭들을 함수 옆 JSDoc 주석으로 남겨둔다.

### 2. 이미지 업로드 UI (신규)

새 컴포넌트(예: `components/product-image-upload.tsx`) 또는 등록/수정 폼 내부 로컬 로직으로:
- `<input type="file" accept="image/*">` → 파일 선택 시 `issueImageUploadUrl(file.type)` → `uploadToPresignedUrl` → 성공하면 반환된 `key`를 폼 상태의 `imageUrl`로 저장.
- 업로드 중/실패 상태 표시(드롭 폼의 `registerMutation.isPending` 패턴처럼 로컬 `useMutation`으로 처리).
- 미리보기는 `URL.createObjectURL(file)`로 로컬에서 렌더링(업로드된 key 자체는 브라우저에서 바로 못 봄).
- 등록/수정 제출 버튼은 이미지 업로드가 끝나기 전엔 비활성화.

### 3. `app/seller/products/new/page.tsx` 신규

`app/seller/drops/new/page.tsx` 구조를 그대로 따르되:
- 필드: name, description, (이미지 업로드 컴포넌트), price, totalQuantity, category(select, `PRODUCT_CATEGORY_LABEL`로 라벨링), 픽업 가능 기간(기존 `lib/format.ts`의 `expandDateRange` 재사용). 드롭에만 있는 `limitQuantity`/`dropStart`/`dropEnd`는 없음(일반상품은 상시 판매라 드롭 기간 개념 자체가 없음).
- `useMutation`으로 `registerProduct` 호출, `onSuccess`에서 `queryClient.invalidateQueries({queryKey:["myProducts"]})` 후 `/seller/dashboard`로 이동.
- 판매자 승인 가드는 `NewDropPage`와 동일하게 `["mySeller"]` 쿼리로 체크(`isPending` 우선 체크 — 초기 오판 방지, `app/seller/drops/new/page.tsx` L37-42 참고).

### 4. `app/seller/products/[productId]/edit/page.tsx` 신규

`app/seller/drops/[dropId]/edit/page.tsx` 구조를 그대로 따름:
- `getMyProducts()`로 목록을 가져와 `productId`로 `find`(갭 3).
- 이미지를 바꾸지 않으면 기존 `imageUrl`(이미 promote된 key)을 그대로 재전송, 바꾸면 새 업로드 플로우 진행(갭 1 경고 문구 노출).
- `updateMutation`으로 `updateProduct` 호출, 성공 시 `["myProducts"]` invalidate.

### 5. `app/seller/dashboard/page.tsx` 수정

"내 드롭" 섹션(L326-425 부근) 옆/아래에 "내 상품" 섹션 추가:
- `myProductsQuery = useQuery({queryKey:["myProducts"], queryFn:()=>productApi.getMyProducts(), enabled:isApproved})`.
- 드롭처럼 상태 탭(`DROP_TABS`)은 불필요 — `Product`/`ProductInventory`에는 `DropStatus` 같은 상태 필드가 없음(재고 소진 여부 정도만 `remainQuantity===0`으로 판단 가능, 필수는 아님).
- 카드마다 "수정"(`/seller/products/{id}/edit`) / "삭제"(`deleteMutation` → `productApi.deleteProduct`, 성공 시 `["myProducts"]` invalidate) 버튼 — 드롭과 달리 상태 제약 없이 항상 노출 가능(백엔드에 "UPCOMING만 삭제 가능" 같은 제약이 없음, `PR002`/`PR005`만 체크).
- 새 상품 등록 진입 링크(`/seller/products/new`) 추가.

### 6. 환경변수 검토

- S3 이미지 표시용 base URL을 새 env로 뺄지 결정(갭 2). 로컬 `.env.local`과 Vercel 프로덕션 env 양쪽에 반영 필요(Vercel 쪽은 사용자가 직접 설정).

## 검증 방법

1. 로컬에서 백엔드(`docker compose up -d` → `./gradlew bootRun`, `:8080`) 기동 후 프론트 `npm run dev`.
2. 승인된 판매자 계정으로 로그인 → `/seller/products/new`에서 이미지 파일 선택 → 업로드 진행 확인 → 등록 제출 → 응답으로 온 `imageUrl`(S3 key)이 실제로 브라우저에서 뜨는지 갭 2의 base URL 조합으로 확인.
3. `/seller/dashboard`에서 "내 상품" 목록에 방금 등록한 상품이 뜨는지, 수정/삭제 버튼이 동작하는지 확인.
4. 수정 화면에서 (a) 이미지를 안 바꾸고 다른 필드만 수정 → 정상 저장되는지, (b) 이미지를 새로 바꿔서 저장 → 갭 1대로 실제 깨지는지 재현해보고, 깨진다면 백엔드팀에 promote-on-update 요청 여부를 논의.
5. 미승인 판매자로 `/seller/products/new` 접근 시 `/seller/dashboard`로 리다이렉트되는지 확인(드롭과 동일 가드).
