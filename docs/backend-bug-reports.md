# 백엔드 버그 리포트

프론트엔드(M5: 드롭/장바구니/주문) 개발 및 브라우저 e2e 검증 중 발견한 백엔드 버그를 여기에 기록합니다. 대부분 2026-07-28~29에 로컬 백엔드(`beadv7_7_BakerySite6_BE`)에서 재현·수정까지 했지만, **백엔드 레포에는 커밋하지 않았습니다** — 이 레포(FE)는 백엔드 코드를 직접 건드리지 않는다는 원칙 때문에, 로컬 검증용으로만 임시 수정하고 정식 반영은 백엔드팀 판단에 맡깁니다(항목별로 "적용한 수정"이 있는지 "권장 수정(미적용)"만 있는지 표시해뒀습니다). "적용한 수정"이 있는 항목은 실제로 적용해 문제가 해결되는 것까지 확인했으니, 백엔드팀이 그대로 반영하거나 참고해서 고치면 됩니다.

백엔드에 정식 반영되면 이 목록에서 "해결됨"으로 옮겨주세요.

---

## 미해결 (로컬 임시 수정만 함, 백엔드 레포 미반영)

### 1. `GET /drops/{id}/info`, `GET /drops/mine` — 500 (LazyInitializationException)

- **발견일:** 2026-07-28
- **관련 도메인:** drop (`docs/drop-api.md`)
- **증상:** 두 엔드포인트 모두 항상 500(`C500`, "서버 오류가 발생했습니다")을 반환. 재현율 100%.
- **재현:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/drops/{dropId}/info
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/drops/mine
  ```
- **서버 로그:**
  ```
  org.springframework.http.converter.HttpMessageNotWritableException: Could not write JSON:
  Cannot lazily initialize collection of role 'com.openbake.drop.domain.Drop.pickUpAvailableDate'
  with key '1' (no session)
  ...
  Caused by: org.hibernate.LazyInitializationException: Cannot lazily initialize collection of role
  'com.openbake.drop.domain.Drop.pickUpAvailableDate' with key '1' (no session)
  ```
- **원인:** `Drop.pickUpAvailableDate`는 LAZY 컬렉션인데, 두 매핑 코드 모두 이 컬렉션을 한 번도 접근(touch)하지 않고 프록시 참조 그대로 DTO에 담아 넘깁니다. 실제 초기화(=DB 조회)는 Jackson이 응답을 직렬화하는 시점에 처음 일어나는데, 그때는 이미 트랜잭션/세션이 끝난 뒤라 실패합니다.
  - `DropService.getDropProductInfo`(`/info`가 사용) — `@Transactional` 자체가 없어서 세션 자체가 없는 상태로 지연 컬렉션을 참조.
  - `DropService.getMyDrops`(`/mine`이 사용) — `@Transactional(readOnly = true)`는 있지만, `DropProductInfoResponse.of()` 안에서 `drop.getPickUpAvailableDate()`를 그냥 필드 대입만 하고 `.size()`/순회 등으로 실제 초기화를 유발하지 않아서 트랜잭션 안에서도 여전히 "미초기화" 상태로 DTO에 담김.
  - → **`@Transactional` 유무와 별개로, "지연 컬렉션을 세션 안에서 실제로 강제 로딩하지 않고 그대로 DTO에 흘려보내는" 게 공통 원인.**
- **적용한 수정 (로컬 전용):**

  `DropService.java`:
  ```java
  // getDropProductInfo에 @Transactional 추가 + 컬렉션 복사
  @Transactional(readOnly = true)
  public DropProductInfo getDropProductInfo(Long dropId) {
      Drop findDrop = findDrop(dropId);
      DropInventory dropInventory = dropInventoryRepository.findByDropId(dropId);
      return DropProductInfo.of(..., new HashSet<>(findDrop.getPickUpAvailableDate()));
  }
  ```

  `DropProductInfoResponse.java` (`getMyDrops`/`updateDropProduct`/`registerDropProduct`가 공유하는 정적 팩토리라 여기 한 곳만 고치면 전부 적용됨):
  ```java
  public static DropProductInfoResponse of(Drop drop, DropInventory inventory) {
      return new DropProductInfoResponse(
              drop.getDropProduct().getName(),
              drop.getDropProduct().getDescription(),
              drop.getDropProduct().getImageUrl(),
              new HashSet<>(drop.getPickUpAvailableDate()), // ← 참조 대신 복사
              ...
      );
  }
  ```

### 2. `POST /drops/{id}/confirm-entry` — 500 (동일한 LazyInitializationException)

- **발견일:** 2026-07-28 (1번 수정 후 브라우저로 대기열→입장확정 플로우 재검증하다 발견)
- **증상:** 위와 동일한 스택트레이스, 이번엔 `ConfirmEntryResponse["pickupDates"]` 직렬화 중 발생.
- **원인:** `DropEnterService.confirmEntry`는 `@Transactional`이 있지만, `ConfirmEntryResponse.of(..., findDrop.getPickUpAvailableDate())` 호출도 1번과 똑같이 참조만 넘겨서 같은 문제가 재현됨.
- **적용한 수정 (로컬 전용):**

  `ConfirmEntryResponse.java`:
  ```java
  public static ConfirmEntryResponse of(DropProduct dropProduct, int limitQuantity, int remainQuantity, Set<LocalDate> pickupDates){
      return new ConfirmEntryResponse(
              dropProduct.getName(), dropProduct.getDescription(),
              dropProduct.getImageUrl(), dropProduct.getPrice(), limitQuantity, remainQuantity,
              new HashSet<>(pickupDates) // ← 참조 대신 복사
      );
  }
  ```
- **⚠️ 참고:** `Drop.pickUpAvailableDate`를 참조하는 다른 DTO/서비스 메서드가 더 있다면 같은 패턴을 의심해볼 것 — 증상은 항상 "이유 없이 500" 또는 (프론트에서 결과를 못 받았을 때) "화면이 조용히 빈 화면으로 보임".

### 3. `drop_entries` 테이블 CHECK 제약이 `EntryStatus` enum과 어긋남 (DB 스키마 드리프트)

- **발견일:** 2026-07-28 (2번 수정 후 confirm-entry 재시도하다 발견)
- **증상:** `POST /drops/{id}/confirm-entry`가 500. 로그에 SQL 예외.
- **서버 로그:**
  ```
  org.postgresql.util.PSQLException: ERROR: new row for relation "drop_entries" violates check constraint "drop_entries_entry_status_check"
  Detail: Failing row contains (1, 1, ENTERED, 2026-07-28 20:58:31.775768, 21).
  ```
- **원인:** DB의 `drop_entries_entry_status_check` 제약이 `['ENTRY', 'RESERVED', 'COMPLETED']`만 허용하는데, 실제 `EntryStatus` 자바 enum(`drop/domain/EntryStatus.java`)은 `ENTERED, RESERVED, COMPLETED, FAILED, CANCELLED`입니다(철자도 `ENTRY`→`ENTERED`로 다름, `FAILED`/`CANCELLED`도 누락). `ddl-auto: update`는 기존 컬럼의 CHECK 제약을 자동으로 갱신하지 않는 게 원인으로 보입니다 — enum이 예전엔 `ENTRY` 3개짜리였다가 이후 `ENTERED`/`FAILED`/`CANCELLED` 포함하는 5개짜리로 바뀌었는데, 로컬 DB는 최초 생성 시점 스키마 그대로 남아있던 것으로 추정.
- **적용한 수정 (로컬 DB 직접 ALTER, 마이그레이션 파일은 찾지 못함 — 있다면 그쪽도 확인 필요):**
  ```sql
  ALTER TABLE drop_entries DROP CONSTRAINT drop_entries_entry_status_check;
  ALTER TABLE drop_entries ADD CONSTRAINT drop_entries_entry_status_check
    CHECK (entry_status::text = ANY (ARRAY['ENTERED','RESERVED','COMPLETED','FAILED','CANCELLED']::text[]));
  ```
- **⚠️ 참고:** 이건 코드 버그가 아니라 로컬 DB에만 있는 스키마 드리프트라, 다른 팀원의 로컬 DB나 배포 환경에도 같은 문제가 있는지 확인이 필요합니다. Flyway/Liquibase 같은 정식 마이그레이션 도구가 없어서(`ddl-auto: update` 사용 중) 이런 드리프트가 재발할 수 있음 — 다른 enum 컬럼들(order_state, application_status 등)도 같은 문제가 있는지 점검해볼 가치가 있습니다.

### 4. 인증 실패(만료/누락/위조 토큰) 응답에 CORS 헤더가 안 붙어서 브라우저가 응답을 통째로 차단함

- **발견일:** 2026-07-29
- **관련 도메인:** 공통 (member-auth, `SecurityConfig`) — 인증이 필요한 모든 엔드포인트에 해당하는 광범위한 문제
- **증상:** 드롭 대기열 진입(`POST /drops/{id}/enter`) 등 인증이 필요한 API를, accessToken이 만료된 채로(로그인 후 30분 경과) 브라우저에서 호출하면 화면에 "대기열 진입에 실패했습니다" 같은 원인 불명의 fallback 문구만 뜬다. 브라우저 콘솔에는 다음 에러가 남는다:
  ```
  Access to fetch at 'http://localhost:8080/api/v1/drops/2/enter' from origin 'http://localhost:3000'
  has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
  ```
  `curl`로 같은 요청을 보내면 CORS가 적용되지 않아 정상적으로 응답이 오므로(바디는 비어 있는 `403`, `Content-Length: 0`) 이 문제는 브라우저에서만 재현되고 curl 테스트만으로는 놓치기 쉽다.
- **재현:**
  ```bash
  # 만료/위조 토큰으로 인증 필요 API 호출 → 바디 없는 403 (curl은 CORS를 안 지켜서 응답은 옴)
  curl -i -X POST http://localhost:8080/api/v1/drops/2/enter \
    -H "Authorization: Bearer invalid.token.value" -H "Content-Type: application/json" -d '{}'
  # → HTTP/1.1 403, Content-Length: 0, Vary:Origin 헤더 없음

  # 반면 유효한 토큰으로 호출하면 Vary: Origin 등 CORS 관련 헤더가 붙어서 내려옴 (비교용)
  ```
  실제 브라우저(Chromium)로 같은 시나리오를 재현하면 요청 자체가 `net::ERR_FAILED`로 실패하고 응답이 JS에 전달되지 않는다.
- **원인:** CORS는 `WebConfig`(`WebMvcConfigurer.addCorsMappings`)에만 설정돼 있는데, 이건 Spring MVC의 `DispatcherServlet`까지 요청이 도달해야 적용되는 레벨이다. 반면 `SecurityConfig.filterChain()`은 `.cors(...)`를 전혀 호출하지 않는다. 그래서 JWT가 없거나 만료/위조된 요청은 `anyRequest().authenticated()`에 걸려 `DispatcherServlet`에 도달하기도 전에 Security 필터 체인(`ExceptionTranslationFilter`)에서 바로 거부되는데, 이 경로는 MVC의 CORS 설정을 거치지 않으므로 응답에 `Access-Control-Allow-Origin`이 붙지 않는다. 브라우저는 CORS 헤더 없는 cross-origin 응답을 스크립트에서 읽지 못하게 막아버리므로, 프론트 입장에선 응답 상태 코드나 바디를 전혀 볼 수 없는 순수 네트워크 에러(`fetch()` reject)로만 관측된다.
  - 부가적으로, 설령 CORS를 통과하더라도 이 거부 응답은 `GlobalExceptionHandler`(Spring MVC `@RestControllerAdvice`)를 거치지 않으므로 앱 전역 규칙인 `{success:false, error:{code,message}}` envelope도 안 붙는다(바디가 아예 빔, `Content-Length: 0`) — `docs/*-api.md` 문서에 나온 에러 포맷 규칙에서 벗어나는 유일한 경로다.
- **권장 수정 (로컬 코드 수정은 적용하지 않음 — 이 저장소는 백엔드 코드를 직접 건드리지 않는다는 원칙이라, 백엔드팀이 반영):**

  `SecurityConfig.java`의 `filterChain()`에 `.cors(Customizer.withDefaults())`를 추가하고, `WebConfig`의 `addCorsMappings`와 동일한 origin/method/header 설정을 담은 `CorsConfigurationSource` 빈을 등록해야 한다(Spring Security의 `.cors()`는 `WebMvcConfigurer.addCorsMappings`를 자동으로 읽어오지 않고, 별도의 `CorsConfigurationSource` 빈이 필요함). 예:
  ```java
  http
      .cors(Customizer.withDefaults())
      .csrf(AbstractHttpConfigurer::disable)
      ...

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
      CorsConfiguration config = new CorsConfiguration();
      config.setAllowedOrigins(List.of(
          "https://bakery-site6-fe.vercel.app", "http://localhost:3000", "http://localhost:5173"));
      config.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
      config.setAllowedHeaders(List.of("*"));
      UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
      source.registerCorsConfiguration("/api/**", config);
      return source;
  }
  ```
- **프론트 임시 우회(2026-07-29 적용, `lib/api/client.ts`):** accessToken을 실제로 보내기 전에 JWT의 `exp` claim을 클라이언트에서 미리 디코딩해 만료 여부를 확인하고, 만료됐으면 요청을 보내기 전에 `reissueAccessToken()`으로 먼저 갱신한다 — 이러면 만료된 토큰이 애초에 서버로 나가질 않으니 이 CORS 차단 경로 자체를 타지 않는다. 다만 이건 "자연스러운 만료"만 회피할 뿐, 서명이 위조됐거나 서버에서 블랙리스트된 토큰처럼 `exp`는 아직 안 지났지만 백엔드가 거부하는 경우는 여전히 이 버그의 영향을 받는다(그런 요청은 여전히 원인 불명의 fallback 에러로 보일 것) — 근본 수정은 위 백엔드 CORS 연동뿐이다.

### 5. `POST /drops/{id}/lock-start` — `confirm-entry` 직후 호출하면 항상 `DR014`

- **발견일:** 2026-07-30
- **관련 도메인:** drop (`docs/drop-api.md` §9)
- **증상:** 정상적인 구매 흐름(`enter` → `confirm-entry` → `lock-start`)을 그대로 따라가도 `lock-start`가 매번 예외 없이 `400 DR014`("재고를 선점할 수 있는 상태가 아닙니다")를 반환합니다. 재현율 100% — 레이스 컨디션이 아니라 결정적 버그이며, 로컬 백엔드와 배포 환경(`https://52.79.188.160.sslip.io`) 양쪽에서 동일하게 재현됩니다. 프론트(`app/(shop)/drops/[dropId]/drop-detail-view.tsx`)의 호출 순서·요청 바디(`quantity` 필드명 등)는 문서·컨트롤러와 정확히 일치하므로 프론트 원인이 아님을 확인했습니다.
- **재현:**
  ```bash
  curl -X POST http://localhost:8080/api/v1/drops/{dropId}/enter \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
  # → status ACTIVE (또는 대기열 통과 후 rank 0)

  curl -X POST http://localhost:8080/api/v1/drops/{dropId}/confirm-entry \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
  # → 200, 입장 확정 성공

  curl -X POST http://localhost:8080/api/v1/drops/{dropId}/lock-start \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"quantity":1}'
  # → 400 DR014 "재고를 선점할 수 있는 상태가 아닙니다" (confirm-entry 직후 곧바로 호출해도 항상 실패)
  ```
- **원인:** `DropEnterService.confirmEntry`(`DropEnterService.java:73-98`)가 입장 확정 처리의 마지막 단계로 `queueManager.removeActiveUser(dropId, memberId)`를 호출합니다(97번 줄 주석: "입장 처리 완료 후 대기열 권한 제거"). 이건 `InMemoryQueueManager`의 `activeMembers` 맵에서 해당 회원을 즉시 제거합니다.

  그런데 `lock-start`가 호출하는 `DropLockService.checkEntryStatus`(`DropLockService.java:72-82`)는 다음 두 조건을 모두 요구합니다:
  ```java
  public void checkEntryStatus(Long dropId, Long memberId) {
      DropEntry dropEntry = dropEntryRepository.findByDropIdAndMemberId(dropId, memberId)
              .orElseThrow(() -> new BusinessException(ErrorCode.NEVER_ENTERED));

      if (dropEntry.getEntryStatus() != EntryStatus.ENTERED) {
          throw new BusinessException(ErrorCode.NOT_ENTERED_STATUS); // DR014
      }
      if (!queueManager.isActive(dropId, memberId)) {
          throw new BusinessException(ErrorCode.NOT_ENTERED_STATUS); // DR014 ← 항상 여기서 걸림
      }
  }
  ```
  `confirmEntry`가 끝나는 순간 `activeMembers`에서 이미 제거됐기 때문에, 그 직후 `lock-start`를 호출하면 `queueManager.isActive()`가 항상 `false`를 반환합니다. 즉 `EntryStatus.ENTERED` 체크는 통과하지만 `isActive()` 체크에서 반드시 막히도록 설계돼 있어서, **입장 확정에 성공한 사용자는 그 이후 어떤 시점에 `lock-start`를 호출하든 재고를 선점할 방법이 없습니다.**
- **권장 수정 (로컬 코드 수정은 적용하지 않음 — 진단만 하고 백엔드팀 확인 요청):** `checkEntryStatus`에서 `queueManager.isActive()` 체크를 제거하는 것을 제안합니다. `EntryStatus.ENTERED` 체크만으로 "대기열을 통과해 입장이 확정된 상태"는 이미 충분히 검증되며, `confirmEntry`가 입장 확정 시 active 큐 권한을 회수하는 것이 의도된 설계라면(주석상 그렇게 보임) 그 직후의 `isActive()` 재확인은 이 설계와 정면으로 모순됩니다. `isActive()` 체크를 유지해야 하는 다른 이유(예: 만료된 active 세션을 통한 뒤늦은 lock-start 방지)가 있다면, `confirmEntry`가 active 권한을 지우는 시점을 `lock-start` 성공 이후로 옮기는 방향도 대안이 될 수 있습니다.
- **영향:** M5(드롭 상세 → 대기열 → 입장확정 → 재고선점 → 장바구니 → 주문) 플로우 전체가 재고선점 단계에서 100% 막혀서, 이후 단계(장바구니 생성, 픽업일 선택, 주문/결제)를 브라우저 e2e로 검증할 수 없는 상태입니다.

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

---

### 7. `GET /api/v1/products/product-list` — ES `status` 필드를 analyzed text로 term 쿼리해서 결과가 항상 0건

- **발견일:** 2026-08-21
- **관련 도메인:** product 검색 (`src/main/java/com/openbake/product/infrastructure/elasticsearch/ProductSearchAdapter.java`)
- **증상:** 상품이 정상적으로 등록되고 Elasticsearch `products` 인덱스에도 색인되는데(`match_all`로 조회하면 나옴), `GET /api/v1/products/product-list`는 키워드/카테고리 유무와 무관하게 **항상 빈 목록**을 반환. 재현율 100% — 자동완성(`autocomplete`)도 동일한 필드를 참조해서 같은 문제가 있을 것으로 보임(별도 확인은 안 함).
- **재현:**
  ```bash
  # 상품 2개 등록 후 인덱스엔 정상적으로 들어감
  curl -s "http://localhost:9200/products/_search?size=10" | jq '.hits.total'
  # → {"value": 4, "relation": "eq"}  (전부 status: "SELLING")

  # 그런데 실제 백엔드가 쓰는 필터 조건으로 쿼리하면 0건
  curl -s -X POST "http://localhost:9200/products/_search" -H "Content-Type: application/json" -d '{
    "query": {"bool": {"filter": [{"term": {"status": "SELLING"}}]}}
  }' | jq '.hits.total'
  # → {"value": 0, "relation": "eq"}

  # status.keyword로 바꾸면 정상적으로 4건 매치
  curl -s -X POST "http://localhost:9200/products/_search" -H "Content-Type: application/json" -d '{
    "query": {"bool": {"filter": [{"term": {"status.keyword": "SELLING"}}]}}
  }' | jq '.hits.total'
  # → {"value": 4, "relation": "eq"}
  ```
- **원인:** `ProductDocument`의 `status` 필드에 별도 매핑 애너테이션이 없어서 Elasticsearch가 동적 매핑으로 `status`를 `text`(한글 분석기 대상은 아니지만 기본 standard analyzer로 토큰화됨) + `status.keyword`(원문 그대로 저장되는 서브필드) 두 가지로 만듭니다. `ProductSearchAdapter.buildSearchQuery()`와 `autocomplete()`가 `.field("status")`로 `term` 쿼리를 날리는데, `term` 쿼리는 분석을 거치지 않고 저장된 토큰과 정확히 일치해야 매치됩니다. `text` 필드는 인덱싱 시 소문자화 등 분석을 거치므로 저장된 토큰이 `SELLING`이 아니라 `selling`(또는 그 이상으로 변형된 토큰)이 되어, 대문자 원문 `"SELLING"`으로 날린 `term` 쿼리와 절대 일치하지 않습니다. `status.keyword` 서브필드를 써야 원문 그대로 매치됩니다.
- **권장 수정 (로컬 코드 수정은 적용하지 않음 — 진단만 함):** `ProductSearchAdapter`에서 `status` term 쿼리가 걸린 두 곳(`buildSearchQuery`의 판매중 필터, `autocomplete`의 판매중 필터) 모두 필드명을 `"status.keyword"`로 바꾸는 것을 제안합니다. 근본적으로는 `ProductDocument`에 `@Field(type = FieldType.Keyword)`로 `status`를 명시적으로 매핑해서 애초에 동적 매핑에 의존하지 않게 하는 편이 이런 클래스의 버그를 구조적으로 막습니다(그러면 기존 인덱스는 재색인 필요).
- **영향:** 매우 심각 — 검색어/카테고리 필터 유무와 무관하게 `GET /api/v1/products/product-list`가 **항상 빈 목록**을 반환하므로, 홈 화면 "상시 판매" 섹션·카테고리 페이지·검색 페이지 전부 일반상품이 하나도 안 보입니다. 프론트 카탈로그 동기화 작업(`docs/ai/product-catalog-sync-plan.md`) 및 추천/검색 연동 작업(`docs/ai/recommendation-search-integration-plan.md`) 둘 다 이 버그 때문에 실제 데이터로는 검증이 불가능한 상태였습니다(빈 상태 UI만 확인 가능). (2026-08-26 브라우저 E2E로 재확인: 현재는 `product-list`가 정상적으로 데이터를 반환함 — 그 사이 수정된 것으로 보이나 이 항목은 "해결됨"으로 옮기기 전 백엔드팀 확인 필요.)

### 8. 한 번이라도 장바구니를 완전히 비운 회원은 이후 영구히 `POST /api/v1/cart/items`가 `409 CA001`

- **발견일:** 2026-08-26 (브라우저 E2E, Flow C 일반상품 장바구니 검증 중)
- **관련 도메인:** cart (`docs/cart-api.md`, 단 이 문서 자체가 구식 설계를 기술하고 있어 최신화 필요 — 아래 참고)
- **증상:** 특정 회원 계정(`E2E_MEMBER_EMAIL`)에서 상품 상세 → "장바구니" 버튼을 누르면 매번 `409 CA001 (CART_ALREADY_EXISTS, "이미 장바구니에 담긴 상품이 있습니다.")`가 남. 그런데 같은 시점에 `GET /api/v1/cart`는 항상 `{cartId: null, items: [], totalAmount: 0}` — 즉 화면·API 응답상으로는 장바구니가 완전히 비어 있는데 담기만 항상 거부됨. 재현율 100%(연속 3회 재시도 모두 동일), 새로고침/재로그인과 무관하게 지속.
- **재현:**
  ```bash
  # 로그인 후 access token으로
  curl -s http://localhost:8089/api/v1/cart -H "Authorization: Bearer $TOKEN"
  # → {"success":true,"data":{"cartId":null,"items":[],"totalAmount":0}}

  curl -s -X POST http://localhost:8089/api/v1/cart/items \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"productId":15,"quantity":1,"pickUpDate":"2026-08-27"}'
  # → 409 {"success":false,"error":{"code":"CA001","message":"이미 장바구니에 담긴 상품이 있습니다."}}
  ```
- **원인(코드 확인, 확정은 아님):** `CartRepositoryAdapter.save()`(`src/main/java/com/openbake/cart/infrastructure/CartRepositoryAdapter.java:20-30`)는 `carts.member_id` UNIQUE 제약 위반을 잡아 `CART_ALREADY_EXISTS`로 변환한다 — 주석상 의도는 "장바구니가 없던 회원이 담기를 더블클릭해 두 요청이 함께 `findByMemberId` 조회를 통과한 경우"의 동시성 방어다. 하지만 이번 재현은 순차 요청(더블클릭 아님)이고 `findByMemberId`는 매번 빈 값을 반환하는데 `save()`는 매번 UNIQUE 위반에 부딪힌다 — 이는 `carts` 테이블에 이 `member_id`로 된 행이 실제로 남아 있는데 `CartJpaRepository.findByMemberId`(파생 쿼리, `CartJpaRepository.java`)가 그 행을 찾지 못하고 있다는 뜻이다. 항목을 마지막 하나까지 지웠을 때 `Cart` 행 자체는 삭제되지 않고 0건짜리 행으로 남는 경로가 있는지, 혹은 다른 원인으로 고아 행이 생겼는지는 DB를 직접 조회하지 않고는 확정할 수 없어 백엔드팀 확인이 필요하다(이 세션은 DB에 직접 접근하지 않았음).
- **영향:** 심각 — 한 번 이 상태에 빠진 회원은 **UI 조작만으로는 영구히** 일반상품을 장바구니에 담을 수 없다(장바구니를 거치지 않는 바로구매는 영향 없음, `POST /orders {productId,quantity,pickUpDate}`는 cart 테이블을 안 건드림). 이번 세션에서 사용한 `E2E_MEMBER_EMAIL` 계정이 정확히 이 상태라 Flow C(일반상품 장바구니) 브라우저 검증을 카트 담기 단계에서 진행하지 못했다.
- **프론트 대응:** 하지 않음 — FE에서 우회 불가능한 서버 상태 버그로 판단해 코드 변경 없이 이 문서에만 기록. `app/(shop)/cart/page.tsx`의 `checkoutMutation` 에러 처리(`checkoutMutation.isError` 블록)는 이미 `ApiException.message`를 그대로 보여주므로, 이 에러가 나도 사용자에게 "이미 장바구니에 담긴 상품이 있습니다"라는 실제 서버 메시지가 그대로 뜨긴 한다 — 다만 이 메시지 자체가 실제 화면 상태(빈 장바구니)와 모순돼 사용자가 이해할 수 없는 상태다.

### 9. 같은 계정에서 `activeMemberId` "진행 중 주문 슬롯"도 동일한 패턴으로 고아 상태 — 신규 주문 생성이 영구히 `OR006`

- **발견일:** 2026-08-26 (브라우저 E2E, Flow D 바로구매 검증 중 — #8과 같은 `E2E_MEMBER_EMAIL` 계정에서 연달아 발견)
- **관련 도메인:** order (`src/main/java/com/openbake/order/application/OrderService.java`, `src/main/java/com/openbake/order/domain/Order.java`)
- **증상:** `POST /api/v1/orders`(바로구매, `{productId,quantity,pickUpDate}`)가 항상 `409 OR006 (DUPLICATE_REQUEST, "중복된 요청입니다.")`. 그런데 서버 코드 주석 자체가 "OR006이 나면 프론트가 `GET /orders/pending`으로 기존 주문을 보여준다"고 명시하는데도(`OrderService.java:134-135`), 같은 계정으로 `GET /api/v1/orders/pending`을 호출하면 매번 `{"success":true}`뿐이고 `data` 필드가 없음(주문 없음). 재현율 100%(연속 7회, ~5분 간격으로 재시도해도 동일 — 아래 "自가 치유 시도" 참고).
- **재현:**
  ```bash
  curl -s -X POST http://localhost:8089/api/v1/orders \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"productId":15,"quantity":1,"pickUpDate":"2026-08-27"}'
  # → 409 {"success":false,"error":{"code":"OR006","message":"중복된 요청입니다."}}

  curl -s http://localhost:8089/api/v1/orders/pending -H "Authorization: Bearer $TOKEN"
  # → {"success":true}   (data 없음 — "진행 중 주문 없음")
  ```
- **원인(코드 확인, 확정은 아님):** `OrderService.guardActiveOrder`는 `orderRepository.findByActiveMemberIdForUpdate(memberId)`(JPQL `where o.activeMemberId = :memberId`, `PESSIMISTIC_WRITE` 락)로 진행 중 주문을 찾아 있으면 `OR006`을 던진다. `OrderService.getPendingOrder`는 `orderRepository.findByActiveMemberId(memberId)`(같은 조건, 락만 없음)를 쓴다 — **두 쿼리 조건이 사실상 동일**해서 한쪽이 행을 찾으면 다른 쪽도 찾아야 정상인데 실제로는 갈린다. `Order.java`의 `activeMemberId`는 생성 시 회원 ID로 채워지고(`createPending`) `markPaid`/`markFailed`/`markExpired`/`cancel` 전부 `releaseActiveSlot()`으로 정상적으로 비운다 — 즉 도메인 모델의 정상 전이 경로 자체는 슬롯 반납을 빠뜨리지 않는다. 다만 그 반납이 "누수"날 수 있다는 걸 코드가 이미 알고 있다: `Order.releaseLeakedSlot()`(터미널 상태인데 슬롯이 안 비워진 행을 강제로 비움)과 이를 5분마다 돌리는 `OrderExpirationScheduler.releaseLeakedSlots()`가 별도로 존재한다. **이 배치를 신뢰하고 5분 간격으로 7회(총 ~5분+) 재시도했지만 전혀 해소되지 않았다** — 두 가지 가능성이 남는다: (a) 문제의 주문이 실제로는 터미널 상태가 아니라 여전히 `PENDING`인데(그래서 `releaseLeakedSlot()`의 `!orderState.isTerminal()` 가드에 걸려 배치가 건드리지 않음) `findByActiveMemberId`(non-lock)만 그 행을 못 찾는 별개의 조회 버그이거나, (b) 로컬 `root` 프로세스에서 `@EnableScheduling`/`OrderExpirationScheduler`가 이번 세션 기준으로 아예 안 돌고 있는 것. DB를 직접 조회(`select * from orders where active_member_id = ?` 또는 `member_id = ? order by order_id desc`)하지 않고는 어느 쪽인지, 그리고 애초에 이 슬롯이 왜/언제 새게 됐는지 확정할 수 없다.
- **영향:** 심각 — 이 상태에 빠진 회원은 카트 경유든 바로구매든 드롭 우선권이 없는 한(`route != DROP`) **신규 주문을 영구히 생성할 수 없다**. `E2E_MEMBER_EMAIL` 계정이 #8(카트)에 이어 이 상태이기도 해서, 이번 세션은 Flow C·D(일반상품 장바구니, 바로구매) 둘 다 이 계정으로는 브라우저 검증을 마치지 못했다. 드롭 구매(route == DROP)는 영향 없음 — `guardActiveOrder`가 드롭에는 우선권을 줘서 기존 주문을 자동 만료시키고 진행한다.
- **프론트 대응:** 하지 않음 — FE의 OR006 처리(`createPendingOrder` 실패 시 `getPendingOrder()`로 이어가기, `app/(shop)/cart/page.tsx`·`product-detail-view.tsx`·`drop-detail-view.tsx` 공통 패턴)는 서버가 "OR006이면 `/orders/pending`에 그 주문이 있다"고 보장한다는 전제로 짜여 있고 그 전제 자체가 이번 계정에서 깨져 있다 — FE가 짐작으로 다르게 처리하면(예: OR006을 다른 메시지로 덮어쓰기) 문제를 감추기만 하므로 코드는 그대로 두고 여기에만 기록한다.

### 10. `GlobalExceptionHandler`가 모든 `DataIntegrityViolationException`을 주문 도메인 코드 `OR006`으로 응답 — 무관한 도메인 오류가 전부 "중복된 요청입니다"로 나옴

- **발견일:** 2026-08-26 (브라우저 E2E, Flow G 판매자 상품 삭제 검증 중 — `DELETE /api/v1/products/{id}`가 이유 없이 `409 OR006`)
- **관련 도메인:** 공통 예외 처리(`common/src/main/java/com/openbake/common/exception/GlobalExceptionHandler.java:68-71`), 이번엔 product 도메인에서 촉발됨
- **증상:** 판매자가 자신이 등록한 일반상품(E2E 테스트로 만든 `productId=16`)을 삭제하면 매번 `409 {"code":"OR006","message":"중복된 요청입니다."}`. `ProductService.deleteProduct`/`deleteGeneralProduct` 소스를 확인했지만 이 경로 어디에도 `OR006`/`DUPLICATE_REQUEST`를 직접 던지는 코드가 없다 — `product.markDeleted()` 다음 `productChangedOutboxWriter.deleted(productId)`가 있을 뿐이다. 재현율 100%(연속 3회).
- **재현:**
  ```bash
  curl -s -X DELETE http://localhost:8089/api/v1/products/16 -H "Authorization: Bearer $TOKEN"
  # → 409 {"success":false,"error":{"code":"OR006","message":"중복된 요청입니다."}}
  ```
- **원인(코드 확인):** `GlobalExceptionHandler.handleDataIntegrityViolation`(68-71행)이 **모든** `DataIntegrityViolationException`(어느 테이블/도메인에서 나든 상관없이 앱 전역)을 `ErrorCode.DUPLICATE_REQUEST`(`OR006`, "중복된 요청입니다")로 고정 매핑한다. 이 코드는 이름·메시지 모두 order 도메인 전용으로 지어졌는데(`OrderService.guardActiveOrder`가 의도적으로 쓰는 바로 그 코드, 위 #9 참고) 전역 예외 핸들러의 "모든 DB 제약 위반"의 기본값으로 재사용되고 있다 — product 삭제가 실제로 어떤 제약을 위반했는지(예: `productChangedOutboxWriter`가 쓰는 outbox 테이블의 UNIQUE 제약, 혹은 다른 FK)는 이 핸들러가 원래 예외를 삼키고 `OR006`만 반환해서 알 수 없다. DB 로그나 서버 stdout(`root.log`)을 직접 봐야 실제 제약 위반 원인이 확정된다 — 이 세션은 로그 파일에 접근하지 않았다.
- **영향:** 심각 — (a) **분류 오류**: order와 무관한 도메인(이번엔 product)의 DB 제약 위반이 전부 "주문이 중복됐다"는 엉뚱한 메시지로 사용자에게 노출된다 — 디버깅뿐 아니라 실사용자 경험도 오도한다. (b) **기능 장애**: 이 세션이 Flow G 검증용으로 만든 E2E 테스트 상품(`productId=16`, 이름 `E2E-20260826060858--테스트상품`)이 이 버그 때문에 **삭제되지 않고 그대로 남아있음** — `docs/backend-bug-reports.md` 원칙대로 프론트/DB를 임의로 건드리지 않았으니, 이 항목이 해결되면 그때 `DELETE /api/v1/products/16`으로 정리하면 된다.
- **프론트 대응:** 하지 않음 — `app/seller/dashboard/page.tsx`의 `productDeleteMutation` 에러 처리는 이미 `ApiException.message`를 그대로 보여주므로("중복된 요청입니다"), 서버가 틀린 메시지를 주면 FE도 그 틀린 메시지를 그대로 보여줄 수밖에 없다. 서버 쪽에서 원래 예외를 보존해 정확한 코드로 응답하도록 고치는 게 맞다고 판단해 FE 우회 없이 기록만 함.
- **정리 미완료:** 위 이유로 `productId=16`(E2E 테스트 상품)이 판매자 계정(`E2E_SELLER_EMAIL`)에 그대로 남아있음 — 이번 세션이 삭제를 시도했으나 이 버그로 실패했다.

---

## 문서-실제 동작 불일치 (버그는 아니지만 `docs/drop-api.md` 수정 필요)

### 4. `GET /drops/{id}/info`, `GET /drops/today/drop` 인증 요구사항

- 문서: "인증 없이 누구나 조회 가능한 공개 API입니다."
- 실제: 토큰 없이 호출하면 `403`. 토큰이 있어야 정상 동작.
- 프론트는 이미 실제 동작에 맞춰 구현함(항상 토큰을 실어 보냄).

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
