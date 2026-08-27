# 백엔드 버그 리포트

프론트엔드(M5: 드롭/장바구니/주문) 개발 및 브라우저 e2e 검증 중 발견한 백엔드 버그를 여기에 기록합니다. 대부분 2026-07-28~29에 로컬 백엔드(`beadv7_7_BakerySite6_BE`)에서 재현·수정까지 했지만, **백엔드 레포에는 커밋하지 않았습니다** — 이 레포(FE)는 백엔드 코드를 직접 건드리지 않는다는 원칙 때문에, 로컬 검증용으로만 임시 수정하고 정식 반영은 백엔드팀 판단에 맡깁니다(항목별로 "적용한 수정"이 있는지 "권장 수정(미적용)"만 있는지 표시해뒀습니다). "적용한 수정"이 있는 항목은 실제로 적용해 문제가 해결되는 것까지 확인했으니, 백엔드팀이 그대로 반영하거나 참고해서 고치면 됩니다.

백엔드에 정식 반영되면 이 목록에서 "해결됨"으로 옮겨주세요.

---

## 미해결 (로컬 임시 수정만 함, 백엔드 레포 미반영)

### [해결됨으로 이동] `GET /drops/{id}/info`, `GET /drops/mine` — 500 (LazyInitializationException) 외 드롭 도메인 4건

> 2026-08-27 브라우저 E2E로 재검증한 결과, 아래 옛 #1/#2/#3/#5(LazyInitializationException 2건, `drop_entries` CHECK 제약, `lock-start` DR014)가 모두 이미 해결돼 있었습니다(드롭 도메인이 대기열 제거 등으로 그 사이 크게 리팩터링됨). 상세 내용은 "해결됨" 절의 "드롭 도메인 — 2026-07-28~30에 보고된 4건" 항목으로 옮겼습니다. 같은 재검증 과정에서 **`dropId`가 응답에서 통째로 빠져있는 새로운 회귀**를 발견해 수정했고, 그 내용도 "해결됨" 절에 있습니다.

---

### 6. 서비스 간 내부 호출(`/internal/v1/**`)이 `HeaderAuthenticationFilter`에 막혀서 전부 401/403 — 추천·시맨틱 검색 100% 장애

- **발견일:** 2026-08-21
- **관련 도메인:** ai-service ↔ backend 서비스 간 인증 (`common/src/main/java/com/openbake/common/security/gateway/HeaderAuthenticationFilter.java`)
- **증상:** `GET /api/v1/recommendations`가 로그인 상태에서도 항상 `503 AI_RECOMMENDATION_UNAVAILABLE`을 반환. `product-list?keyword=`의 의미 검색(하이브리드 검색의 절반)도 항상 조용히 실패해서 키워드 검색 결과만으로 응답(`의미 검색 실패 — 키워드 결과만으로 응답. reason=401 Unauthorized`가 backend 로그에 남지만, `RecommendationExceptionHandler`가 예외를 로깅하지 않아 추천 쪽은 ai-service 로그에 아무 흔적도 안 남음 — 원인 추적이 오래 걸렸음). 재현율 100%.
- **재현:**
  ```bash
  # ai-service 컨테이너 안에서 backend의 내부 API를 서비스 토큰으로 직접 호출
  docker exec openbake-ai-service curl -s -i \
    -H "X-Openbake-Service-Name: ai-service" \
    -H "X-Openbake-Service-Token: $AI_SERVICE_TOKEN" \
    "http://backend:8080/internal/v1/products/latest-recommendation-candidates?memberId=90&size=8"
  # → 401 (게이트웨이 신원 헤더가 없다는 이유로 거부됨)

  # 게이트웨이 신원 헤더를 같이 보내면 403으로 바뀜 (SERVICE_AI 권한이 덮어써짐)
  docker exec openbake-ai-service curl -s -i \
    -H "X-Openbake-Service-Name: ai-service" -H "X-Openbake-Service-Token: $AI_SERVICE_TOKEN" \
    -H "X-Openbake-Member-Id: 90" -H "X-Openbake-Member-Role: CUSTOMER" -H "X-Openbake-Auth-Source: api-gateway" \
    "http://backend:8080/internal/v1/products/latest-recommendation-candidates?memberId=90&size=8"
  # → 403 (CUSTOMER 권한으로는 hasAuthority("SERVICE_AI")도 hasRole("ADMIN")도 통과 못 함)
  ```
- **원인:** `SecurityConfig`(backend)와 `AiSecurityConfig`(ai-service) 둘 다 필터 체인을 `ServiceAuthenticationFilter → HeaderAuthenticationFilter → UsernamePasswordAuthenticationFilter` 순서로 구성합니다. `ServiceAuthenticationFilter`는 `/internal/v1/products/recommendation-candidates`, `/internal/v1/products/latest-recommendation-candidates`, `/internal/v1/search/**` 같은 서비스 간 경로에서 `X-Openbake-Service-Name`/`X-Openbake-Service-Token`으로 정상적으로 인증(`SERVICE_AI`/`SERVICE_CORE` 권한 부여)합니다.

  그런데 바로 다음에 실행되는 `HeaderAuthenticationFilter.shouldNotFilter()`(공용 `common` 모듈)는 이 서비스 간 경로들을 전혀 모릅니다. 이 필터는 `path.startsWith("/internal/")`이면 무조건 "보호 대상"으로 취급하고, GET이 아니면(`latest-recommendation-candidates`는 GET, `semantic`은 POST) 곧바로 게이트웨이 신원 헤더(`X-Openbake-Member-Id` 등)를 요구합니다:
  - 헤더가 없으면 → `IllegalArgumentException` → `reject()` → `SecurityContextHolder.clearContext()` + 401. `ServiceAuthenticationFilter`가 방금 세팅한 `SERVICE_AI`/`SERVICE_CORE` 인증이 통째로 지워집니다.
  - 헤더를 억지로 채워 보내면 → 이번엔 `HeaderAuthenticationFilter`가 그 헤더로 새 인증(`ROLE_CUSTOMER` 등)을 만들어 **`ServiceAuthenticationFilter`가 세팅한 인증을 덮어씁니다** → `hasAuthority("SERVICE_AI"/"SERVICE_CORE")` 매처가 더 이상 통과하지 못해 403.

  즉 서비스 간 호출은 어느 쪽으로도 성공할 수 없습니다. `RecommendationService.calculate()`가 `interactions`가 비어 있을 때(신규 회원) 타는 `latest()` 경로, 그리고 개인화 추천을 검증하는 `validateCandidates()` 경로 둘 다 이 내부 API를 거치므로, **어떤 회원·어떤 행동 이력 상태에서도 추천이 항상 503**입니다. `RecommendationExceptionHandler`가 예외를 로그로 남기지 않는 것도 별개 문제로 같이 고쳐야 진단이 쉬워집니다.
- **권장 수정 (로컬 코드 수정은 적용하지 않음 — 진단만 함):** `HeaderAuthenticationFilter.shouldNotFilter()`에 `AiServicePaths.matches(path)` / `CoreServicePaths.matches(path)`(둘 다 이미 `common`에 있음)를 조기 예외 처리로 추가해서, 이미 `ServiceAuthenticationFilter`가 인증을 책임지는 경로는 `HeaderAuthenticationFilter`가 아예 건드리지 않게 하는 것을 제안합니다. 더 근본적으로는, 서로 다른 신뢰 주체(게이트웨이 사용자 신원 vs 서비스 간 토큰)를 다루는 두 필터가 같은 `SecurityContext`를 순서대로 겹쳐 쓰는 구조 자체가 이런 종류의 버그를 계속 만들어낼 여지가 있어 보입니다.
- **영향:** 추천 기능(`GET /api/v1/recommendations`) 100% 장애, 하이브리드 검색의 의미 검색 절반도 100% 장애(키워드 검색만 동작). 프론트(이 레포)에서 두 기능 다 API 계약대로 정상 구현·503 열화 처리까지 확인했으나, 백엔드가 항상 실패를 반환하므로 실제 값 확인은 이 버그가 고쳐진 뒤에만 가능합니다.
- **2026-08-27 재확인 시도:** 이번 라운드에서도 재현을 시도했으나, 이 로컬 환경엔 애초에 **ai-service 자체가 기동돼 있지 않습니다**(포트 8083 connection refused, 로컬 프로세스·도커 컨테이너 둘 다 없음 — root/member/payment/api-gateway 4개만 `run-all.sh` 기준으로 떠 있음). 그 상태로 `GET /api/v1/recommendations`를 호출하면 게이트웨이 로그에 `Connection refused: localhost/127.0.0.1:8083` 500이 남는데, 이건 위에서 설명한 "인증 필터 충돌로 401/403"과는 **다른 증상**(서비스가 아예 안 떠 있어서 나는 순수 연결 실패)이라 이 항목이 실제로 고쳐졌는지 여부는 이번 라운드로는 확인도 반증도 못 했습니다. ai-service를 별도로 띄운 뒤 재검증이 필요합니다.

---

### 10. `GlobalExceptionHandler`가 모든 `DataIntegrityViolationException`을 주문 도메인 코드 `OR006`으로 응답 — 무관한 도메인 오류가 전부 "중복된 요청입니다"로 나옴

- **발견일:** 2026-08-26 (브라우저 E2E, Flow G 판매자 상품 삭제 검증 중)
- **관련 도메인:** 공통 예외 처리(`common/src/main/java/com/openbake/common/exception/GlobalExceptionHandler.java:68-73`)
- **증상:** DB 제약 위반이면 그 원인이 어느 도메인이든(카트/주문/상품/그 외 무엇이든) 전부 `409 {"code":"OR006","message":"중복된 요청입니다."}`로 응답한다. `OR006`은 이름·메시지 모두 order 도메인 전용으로 지어진 코드인데, `handleDataIntegrityViolation`이 "도메인별 세부 코드를 붙이지 않는다"는 의도로 이걸 전역 기본값처럼 재사용하고 있다(핸들러 자체 주석에 이 의도가 명시돼 있음).
- **재현(2026-08-26 당시):** 아래 "해결됨" 항목의 스키마 드리프트 3건이 전부 이 핸들러를 거쳐 `OR006`으로 나왔었다(카트 담기, 주문 생성, 상품 삭제). 그 3건은 근본 원인(스키마 드리프트)을 고쳐서 이제 이 핸들러를 안 타지만, **핸들러 자체의 "전부 OR006" 설계는 그대로 남아있다** — 카트/주문/상품 외 다른 도메인에서 새로운 DB 제약 위반이 생기면 똑같이 엉뚱한 "중복된 요청입니다" 메시지가 나갈 것이다.
- **영향:** 중간 — 기능을 막지는 않지만(그 아래 실제 제약 위반이 없다면), DB 제약 위반이 실제로 발생했을 때 사용자에게 원인과 무관한 오해의 소지가 있는 메시지를 보여주고, 서버 로그 없이는 실제 원인 파악이 어렵다.
- **프론트 대응:** 하지 않음 — FE는 `ApiException.message`를 그대로 보여줄 뿐이라 서버가 주는 메시지를 그대로 노출한다. 서버가 원래 예외의 제약 이름을 보존해 더 정확한 코드/메시지로 응답하도록 고치는 게 맞는 방향이라고 보지만, 이번 세션 범위(카트/주문/상품 생성·삭제 P0 차단 해소) 밖이라 별도 라운드로 미룸.

---

## 문서-실제 동작 불일치 (버그는 아니지만 `docs/drop-api.md` 수정 필요)

### [해결됨] 4. `GET /drops/{id}/info`, `GET /drops/today/drop` 인증 요구사항

- 문서: "인증 없이 누구나 조회 가능한 공개 API입니다."
- 실제(2026-07-28 당시): 토큰 없이 호출하면 `403`. 토큰이 있어야 정상 동작.
- **2026-08-27 재확인:** 지금은 컨트롤러에 `@SecurityRequirements`가 붙어 있고, 실제로 토큰 없이 `GET /drops/{id}/info`를 호출해도 `200`이 옵니다(문서가 원래 맞았던 방향으로 백엔드가 바뀜). CLAUDE.md에도 이미 이 optional-auth 동작이 반영돼 있고 FE도 게스트 접근을 허용하는 쪽으로 구현돼 있어 더 이상 문서-실제 불일치가 아닙니다.

### 5. `GET /drops/{id}/info` 응답 래퍼 형태

- 문서: "응답이 `ApiResponse` 래퍼 없이 이 객체 그대로 옵니다 — `{"success": true, "data": {...}}`가 아니라 아래 필드가 최상위에 바로 온다는 뜻입니다."
- 실제: 다른 API와 동일하게 `{"success": true, "data": {...}}` 래퍼가 있음.
- **영향:** 프론트가 처음에 이 문서를 믿고 래퍼 없는 파싱으로 구현했다가, 모든 필드가 `undefined`가 되면서 홈/드롭상세 화면이 **에러 메시지 하나 없이 조용히 빈 화면**으로 보이는 버그로 이어졌습니다(콘솔 에러도 없고 API 응답도 200이라 원인 파악에 시간이 걸림). 지금은 일반 파싱으로 고쳤습니다.

### 6. 드롭 등록 "하루 1개 제한"이 판매자별이 아니라 플랫폼 전체 기준으로 동작함

- **발견일:** 2026-07-28 (M6 브라우저 e2e 테스트 중 — seller01로 로그인해 2026-08-05에 드롭을 등록하려는데 `DR004`가 남. seller01은 그 날짜에 드롭이 없는데도 충돌이 나서 코드를 확인함. `DevSellerDropSeeder`가 seller08의 시드 드롭을 정확히 2026-08-05로 심어놨었음 — seller01과 무관한 다른 판매자의 드롭 때문에 막힌 것)
- **관련 도메인:** drop (`docs/drop-api.md`, `docs/drop-api-2.md`)
- **코드:** `DropService.java:86-100` (`validateOneDropPerDay`)
  ```java
  private void validateOneDropPerDay(Long sellerId, LocalDateTime dropStart) {
      ...
      // 91: 먼저 하루에 드롭은 한 번으로 제한되므로 먼저 검증
      if (dropRepository.existsByDropStartBetween(startOfDay, endOfDay)) {      // 판매자 무관 — 전역 검사
          throw new BusinessException(ErrorCode.DUPLICATE_DROP_DATE);
      }

      // 96: (확장성을 고려한 판매자 드롭 등록 제한 / 추후 하루에 드롭이 여러 개일 경우)
      if (dropRepository.existsBySellerIdAndDropStartBetween(sellerId, startOfDay, endOfDay)) {  // 판매자별 검사
          throw new BusinessException(ErrorCode.DUPLICATE_DROP_DATE);
      }
  }
  ```
  수정(`PATCH`)용 `validateOneDropPerDayExcludingSelf`(104-116번 줄)도 동일한 구조.
- **증상:** 91번 줄의 전역 검사(`existsByDropStartBetween`, sellerId 없음)가 먼저 걸려서, **판매자 A가 특정 날짜에 등록하려 할 때 그 날짜에 판매자 B의 드롭이 이미 있어도 `DR004`로 막힙니다.** 96번 줄의 판매자별 검사(`existsBySellerIdAndDropStartBetween`)는 91번이 통과해야만 도달 가능한데, 91번이 통과했다는 건 이미 "그날 어떤 판매자의 드롭도 없다"는 뜻이라 96번은 현재 시점엔 도달할 수 없는 죽은 코드입니다.
- **코드에 남은 의도 추정:** 96번 줄 주석("확장성을 고려한 판매자 드롭 등록 제한 / **추후** 하루에 드롭이 여러 개일 경우")을 보면, 원래 의도는 "판매자당 하루 1개"이고 91번의 전역 검사는 "현재는 플랫폼 전체에서도 하루 1개만 허용"하는 별개의 임시 제약으로 보입니다. 다만 이게 의도적인 임시 정책인지, 91번 줄을 지워야 하는데 못 지운 실수인지는 코드만으로는 판단이 안 됩니다.
- **영향:** 프론트(홈 화면 "오늘의 드롭" 단일 카드, `GET /drops/today/drop`)는 이 전역 제약을 전제로 만들어져 있어서 지금 동작은 자연스럽게 맞물립니다. 다만 "판매자당 하루 1개"가 진짜 의도라면, 홈 화면이 여러 판매자의 드롭 중 하나만 보여주는 지금 UX(`/drops/today/drop`이 Long 하나만 반환)도 함께 재설계가 필요합니다 — 리스트 API로 바꿔야 함.
- **확인 요청:** 91번 줄(플랫폼 전체 제한)이 의도된 정책인지, 아니면 96번 줄(판매자별 제한)만 남기고 91번은 제거해야 하는지 백엔드팀 확인 필요.

---

## 해결됨

### `/internal/v1/**`(정산 관리자 API)에 CORS 설정 자체가 없어 브라우저에서 전부 차단됨

- **발견일:** 2026-07-29 / **해결일:** 2026-07-29
- **관련 도메인:** settlement (공통 `WebConfig`) — `/internal/v1/**` 전체에 해당
- **증상:** `/admin/settlements` 화면에서 정산 배치 목록 조회, 배치 실행 등을 브라우저에서 호출하면 preflight(OPTIONS) 단계에서 CORS 에러로 전부 실패. `curl`은 CORS를 신경 쓰지 않아 이 문제를 놓치기 쉬움(§4와 동일한 특징).
- **원인:** `WebConfig.addCorsMappings`가 `/api/**`에만 CORS를 등록해서 `/internal/v1/**`은 경로 패턴 자체가 안 걸려있었음.
- **수정 완료:** `WebConfig.java`에 `/internal/**` 매핑 추가(`/api/**`와 동일한 origin/method/header 설정).
- **검증(2026-07-29):** 실행 중인 서버에 브라우저 preflight를 재현하는 요청을 직접 보내 확인함.
  ```bash
  curl -i -X OPTIONS "http://localhost:8080/internal/v1/settlement-batches?page=0&size=20" \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,content-type"
  # → HTTP/1.1 200, Access-Control-Allow-Origin: http://localhost:3000,
  #   Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS 확인
  ```
- **프론트 반영:** 별도 작업 불필요 — 프론트 코드는 CORS 우회 로직 없이 그냥 fetch만 하므로, 백엔드 수정만으로 `/admin/settlements` 지급 관리 탭이 브라우저에서 정상 동작함.

### `carts`/`orders`/`products`/`cart_items` 스키마가 `ddl-auto: update`로 못 따라간 컬럼·제약 드리프트 — 계정과 무관하게 장바구니 담기·주문 생성·상품 삭제가 전부 실패

- **발견일:** 2026-08-26(브라우저 E2E, Flow C/D/G) / **해결일:** 2026-08-26
- **관련 도메인:** cart, order, product — 전부 스키마 드리프트가 근본 원인
- **증상(당시 #8/#9/#10로 각각 기록):** `POST /api/v1/cart/items`가 항상 `409 CA001`("이미 장바구니에 담긴 상품이 있습니다"), `POST /api/v1/orders`가 항상 `409 OR006`("중복된 요청입니다"), `DELETE /api/v1/products/{id}`가 항상 `409 OR006`. 셋 다 특정 계정 문제로 처음 의심했으나(고아 행 이론), 재조사 결과 **계정과 무관하게 이 DB 인스턴스에서 100% 재현**되는 문제였다 — `carts` 테이블 전체 회원 기준 0행이었던 게 그 증거.
- **원인(root 서비스 실시간 로그 + `docker exec openbake-postgres psql`로 직접 확인):** `ddl-auto: update`는 컬럼 삭제나 CHECK 제약 갱신을 절대 반영하지 않는데, 세 테이블 다 엔티티/enum이 리팩터링되면서 DB 쪽이 예전 상태로 남았다.
  1. `carts.expires_at` — 드롭 전용 만료-카트 설계 시절 컬럼(`NOT NULL`). 현재 `Cart` 엔티티엔 이 필드가 없음(`git log -p`로 `5d7f552` 리팩터링 커밋에서 삭제된 것 확인). → `INSERT INTO carts`가 항상 `23502`.
  2. `cart_items.drop_id`(`NOT NULL`, 엔티티에 없음)와 `cart_items`의 `cart_id` 단독 `UNIQUE` 제약(`uk4p7dd2p61wsdx9j35wp6sugqr`, "카트당 항목 1개"였던 시절의 잔재 — 지금 진짜 제약은 `uk_cart_product(cart_id, product_id)`뿐) — carts 레벨을 고친 뒤에야 드러남. → 카트 항목 담기가 항상 `23502`, 두 번째로 다른 상품을 담으면 이 UNIQUE 때문에도 막혔을 것.
  3. `orders_order_state_check`가 `('PAID','CONFIRMED','CANCELED')`만 허용. 현재 `OrderState`는 `PENDING/PAID/CANCELED/FAILED/EXPIRED`(CONFIRMED 없음, 항목 단위로 이동). `V4__move_confirmation_to_order_items.sql`이 기존 CONFIRMED **데이터**는 PAID로 옮겼지만 **체크 제약 자체**는 안 고쳤다. → 모든 신규 주문(PENDING으로 시작)의 `INSERT`가 항상 `23514`.
  4. `products_status_check`가 `('SELLING','SOLD_OUT')`만 허용. `ProductStatus`엔 `DELETED`가 있음. → `markDeleted()`(소프트 삭제)가 항상 `23514`.
  5. (덤으로 같이 정리) `drop_entries_entry_status_check` — 위 §3(미해결 목록 §3, 2026-07-28 발견)에서 로컬 DB에 직접 ALTER만 하고 마이그레이션 파일로 남기지 않았던 것을 정식 반영.
  - 네 건 다 `GlobalExceptionHandler.handleDataIntegrityViolation`이 실제 제약 이름을 삼키고 `OR006`으로 뭉뚱그려 응답해서(위 #10 참고) 원인 파악이 늦어졌다.
- **수정 완료:** Flyway 마이그레이션 `V6__fix_carts_orders_products_schema_drift.sql`, `V7__fix_cart_items_schema_drift.sql` 추가(root 모듈). `carts.expires_at`/`cart_items.drop_id` 컬럼 DROP, `cart_items`의 잘못된 단독 UNIQUE 제약 DROP, `orders_order_state_check`/`products_status_check`/`drop_entries_entry_status_check` 재생성. 애플리케이션 코드는 한 줄도 안 건드림 — 코드는 원래 옳았고 DB만 틀렸음.
- **검증:** root 재시작 시 Flyway가 자동 적용(`Successfully applied ... now at version v7`), 이후 실제 계정으로 `POST /cart/items` → `201`(cartId 15, cartItemId 3), `POST /orders` → `201 PENDING`(orderId 19, 이후 정상적으로 `EXPIRED`로 자동 전이됨 — `OrderExpirationScheduler` 정상 동작도 같이 확인됨), `DELETE /products/16` → `200`(#10에서 남아있던 E2E 테스트 상품도 이걸로 정리됨). `CartServiceTest`/`OrderServiceTest`/`CartControllerTest` 회귀 없음. **다만 두 항목은 세션 도중 테스트 계정 자격증명 파일이 삭제되어(사용자가 예정대로 정리) 완결하지 못함**: (a) 서로 다른 두 상품을 한 카트에 담는 멀티아이템 시나리오는 제약 정의(`uk_cart_product`만 남음)로는 확인했지만 실제 앱 흐름으로는 재현 못 함, (b) Playwright 브라우저를 통한 최종 화면 재검증은 못 함(API 레벨 검증만 완료). 새 테스트 계정이 있으면 재검증 권장.
- **프론트 반영:** 불필요 — FE는 처음부터 옳은 요청을 보내고 있었음.
- **참고:** 이 DB(`openbake-postgres`, 로컬)는 오래전부터 계속 살아있던 인스턴스라 이 드리프트가 누적됐다. 신선한 DB를 새로 만들면(`ddl-auto: update`가 현재 엔티티 기준으로 스키마를 만들므로) 이 문제 자체가 없다 — 그래서 그동안 CI/신규 환경에서는 발견되지 않았을 것. 운영 DB도 이 저장소만큼 오래됐다면 같은 드리프트가 있을 가능성이 높으니 배포 전 반드시 마이그레이션 적용 필요.

### 드롭 도메인 — 2026-07-28~30에 보고된 4건(LazyInitializationException 2건, `drop_entries` CHECK 제약, `lock-start` DR014)이 전부 재확인됨

- **발견일:** 2026-07-28~30 / **재확인일:** 2026-08-27
- **관련 도메인:** drop
- **경위:** 이번 라운드에서 `docs/backend-bug-reports.md`에 남아있던 미해결 항목들을 실제 유저 플로우(회원가입→판매자 승인→드롭 등록→입장→입장확정→재고선점→주문서 생성)를 브라우저로 직접 실행하며 재검증했습니다. 4건 모두 더 이상 재현되지 않았습니다.
  - `GET /drops/{id}/info`, `GET /drops/mine` LazyInitializationException — 재현 안 됨(`200` 정상 응답). 현재 `DropInfoResult.of()`/`DropInfoResponse.of()`가 `pickUpAvailableDates`를 `new HashSet<>(...)`로 복사하고 있어 원래 보고된 원인(지연 컬렉션 참조를 그대로 DTO에 흘려보냄)이 이미 없음.
  - `POST /drops/{id}/confirm-entry` LazyInitializationException — 재현 안 됨(브라우저로 실제 호출, `200`).
  - `drop_entries` CHECK 제약 불일치 — 재현 안 됨. 위 스키마 드리프트 항목의 V6 마이그레이션이 이 제약을 이미 정식으로 재생성해뒀음(`\d drop_entries`로 `ENTERED/RESERVED/COMPLETED/FAILED/CANCELLED` 전부 허용하는 것 확인).
  - `POST /drops/{id}/lock-start`가 `confirm-entry` 직후 항상 `DR014` — 재현 안 됨. 원래 원인이던 대기열(`InMemoryQueueManager`, `isActive()`) 자체가 그 사이 리팩터링으로 코드베이스에서 완전히 제거됐습니다(`DropEnterService.java`의 주석: "대기열이 있던 시절에는 진입 경로가 enterQueue -> confirmEntry 2단계였고 ... 대기열을 걷어내면서 입장 경로가 이 메서드 하나로 줄었다"). 즉 버그를 유발하던 메커니즘 자체가 사라졌습니다.
- **검증(2026-08-27):** 신규 E2E 테스트 계정으로 드롭 등록 → 로그인 → 픽업일 선택 → `confirm-entry`(200) → `lock-start`(200) → `POST /orders`(201, PENDING) → `/order?orderId=` 결제 화면 진입까지 브라우저로 전 구간 성공.
- **비고:** 이 재확인만으로는 코드 변경이 없으므로 별도 커밋 없음. 같은 재검증 과정에서 아래 새 회귀(`dropId` 누락)를 발견해 수정했습니다.

### 신규 회귀: `GET /drops/upcoming`, `GET /drops/mine`, `GET /drops/{id}/info` 응답에 `dropId`가 통째로 빠져 있어 드롭 상세 링크가 전부 `/drops/undefined`로 깨짐

- **발견일:** 2026-08-27(브라우저 E2E, 홈 화면 드롭 카드 클릭 검증 중) / **해결일:** 2026-08-27
- **관련 도메인:** drop
- **증상:** 홈 화면의 "오늘의 드롭"/드롭 목록 카드가 전부 `href="/drops/undefined"`로 렌더링됨(브라우저로 실제 확인). 판매자의 `/drops/mine`도 동일하게 `dropId`가 없어 FE의 수정/삭제(`updateDrop`/`deleteDrop`)가 애초에 어떤 드롭을 대상으로 할지 알 수 없는 상태였음.
- **원인:** `DropInfoResult`(application DTO)와 `DropInfoResponse`(presentation DTO) 어디에도 `dropId` 필드가 없었습니다. `DropService.getDropInfo`/`getMyDrops`/`getUpcomingDrops`/`updateDropProduct`는 전부 `Drop` 엔티티(또는 그 PK)를 갖고 있으면서도 결과 DTO를 만들 때 그 PK를 담지 않고 있었고, `DropController`의 `/info`·`/mine`·`/upcoming` 세 엔드포인트가 모두 이 DTO를 그대로 반환하므로 세 응답 다 영향을 받았습니다. FE(`lib/api/drop.ts`)는 `DropProductInfoResponse`/`getUpcomingDrops`가 `dropId: number`를 반환한다고 가정하고 있었고(`lib/catalog.ts`가 `drop.dropId`로 상세 링크를 만듦), 백엔드 응답엔 그 필드가 아예 없어 `undefined`가 그대로 URL에 박혔습니다. FE 계약 문서/타입은 옳았고 백엔드 응답이 실제로 그 계약을 지키지 않고 있던 경우입니다.
- **수정 완료(백엔드, 애플리케이션 코드):**
  - `drop/application/dto/DropInfoResult.java`, `drop/presentation/dto/DropInfoResponse.java` — 두 record에 `Long dropId` 필드 추가.
  - `drop/application/service/DropService.java` — `getDropInfo`/`getMyDrops`/`getUpcomingDrops`/`updateDropProduct` 4곳에서 이미 갖고 있던 `Drop` 엔티티의 `.getId()`를 `DropInfoResult.of(...)`에 실어 보내도록 수정. `registerDrop`은 `productPort.registerProduct(command)` 시점엔 아직 `Drop`이 DB에 저장되기 전이라 dropId를 모르므로(`null`로 채움), `dropRepository.save(drop)` 이후 IDENTITY로 발급된 실제 `drop.getId()`로 다시 채운 `DropInfoResult`를 반환하도록 변경.
  - `product/infrastructure/ProductAdapter.java` — `registerProduct()`가 만드는 `DropInfoResult`는 `dropId=null`로 표시(위와 같은 이유).
  - 마이그레이션 없음 — DB 스키마 변경이 아니라 서비스 계층의 DTO 매핑 누락이었습니다.
- **테스트:** `DropServiceTest.registerDrop_Success`(dropId를 제외한 필드만 비교하도록 `usingRecursiveComparison().ignoringFields("dropId")`로 변경 — mock 저장소라 실제 IDENTITY 값은 재현 안 됨), `DropControllerTest.getUpcomingDrops`(`dropId` jsonPath 단언 추가)를 갱신. `:test --tests "com.openbake.drop.*" --tests "com.openbake.product.*"` 전체 통과(기존에 있던 `ProductSearchServiceTest` 6건 실패는 무관한 사전 존재 이슈 — 아래 별도 항목 참고).
- **검증:** root 서비스 재시작 후 브라우저로 홈 화면 재방문 → 드롭 카드 링크가 `/drops/undefined`에서 실제 dropId(`/drops/15`)로 바뀐 것을 확인. `GET /drops/upcoming`/`GET /drops/mine` 응답에 `"dropId":15`가 포함되는 것도 curl로 재확인.
- **프론트 반영:** 불필요 — FE는 처음부터 옳은 타입/사용 방식을 갖고 있었음.

### 인증 실패(만료/누락/위조 토큰) 응답에 CORS 헤더가 안 붙는 문제 — 아키텍처 변경으로 해소됨

- **발견일:** 2026-07-29 / **해결 확인일:** 2026-08-27
- **관련 도메인:** 공통 인증 — API Gateway
- **원래 증상/원인:** 각 서비스(root 등)의 `SecurityConfig.filterChain()`이 `.cors(...)`를 호출하지 않아, Security 필터 체인이 인증 실패를 거부할 때 CORS 헤더 없는 빈 바디 403/401이 내려가 브라우저가 응답을 통째로 막았음(원래 보고서 §4 참고).
- **2026-08-27 재확인:** 지금은 아키텍처가 바뀌어 API Gateway가 JWT 검증을 중앙에서 담당합니다(CLAUDE.md: "게이트웨이가 JWT를 검증하고 주입"). 만료/위조/누락 토큰으로 게이트웨이 경유 요청을 보내면:
  ```bash
  curl -i -X POST "http://localhost:8089/api/v1/drops/15/enter" \
    -H "Origin: http://localhost:3000" -H "Authorization: Bearer invalid.token.value" \
    -H "Content-Type: application/json" -d '{}'
  # → HTTP/1.1 401, Access-Control-Allow-Origin: http://localhost:3000 포함,
  #   바디도 {"success":false,"error":{"code":"TOKEN_INVALID",...}} 정식 envelope
  ```
  CORS 헤더와 `{success,error}` envelope 둘 다 정상적으로 붙습니다. 원래 문제였던 "Security 필터 체인이 MVC의 CORS 설정을 안 거치고 빈 바디로 거부" 경로 자체가 게이트웨이 중앙집중 인증으로 바뀌면서 사라진 것으로 보입니다.
- **프론트 반영:** 불필요 — `lib/api/client.ts`의 만료 토큰 사전 갱신 우회 로직은 계속 유지해도 무해하지만, 이 근본 문제 자체는 더 이상 발생하지 않습니다.

### `GET /api/v1/products/product-list` — ES `status` term 쿼리 0건 문제, 해결 확정

- **발견일:** 2026-08-21 / **해결 확인일:** 2026-08-27
- **관련 도메인:** product 검색
- **경위:** 2026-08-26 브라우저 E2E에서 이미 정상 동작하는 것으로 재확인됐지만("백엔드팀 확인 필요" 상태로 미해결 목록에 남아 있었음), 2026-08-27 재검증에서 키워드 있음/없음 두 경로 모두 실데이터를 정상 반환하는 것을 다시 확인해 최종적으로 "해결됨"으로 옮깁니다.
  ```bash
  curl -s "http://localhost:8089/api/v1/products/product-list?page=0&size=10"
  # → success:true, content에 실제 상품 포함

  curl -s "http://localhost:8089/api/v1/products/product-list?keyword=쿠키&page=0&size=10"
  # → success:true, totalElements:1 (일치하는 상품만 반환 — 빈 배열 아님)
  ```
- **프론트 반영:** 불필요.

### 참고: `ProductSearchServiceTest` 6건 실패는 이번 작업과 무관한 기존 문제

- 이번 라운드에 돌린 `:test --tests "com.openbake.drop.*" --tests "com.openbake.product.*"`에서 `ProductSearchServiceTest`의 6개 테스트가 `"픽업 가능 날짜는 오늘 이후여야 합니다."`로 실패합니다. 테스트 픽스처가 과거 날짜(`LocalDate.parse("2026-08-25")` 등)를 하드코딩하고 있어, 샌드박스의 실제 현재 날짜가 그 날짜를 지나면서 `Product.validatePickUpDates`의 "미래 날짜여야 함" 검증에 걸리는 날짜 하드코딩 문제입니다. 드롭 도메인 변경과는 완전히 무관하며(Flyway도 테스트 프로파일에선 비활성화), 이번 라운드에서 손대지 않았습니다. 별도로 테스트 픽스처를 상대 날짜(`LocalDate.now().plusDays(n)`)로 바꾸는 정리가 필요합니다.
