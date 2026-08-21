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
- **영향:** 매우 심각 — 검색어/카테고리 필터 유무와 무관하게 `GET /api/v1/products/product-list`가 **항상 빈 목록**을 반환하므로, 홈 화면 "상시 판매" 섹션·카테고리 페이지·검색 페이지 전부 일반상품이 하나도 안 보입니다. 프론트 카탈로그 동기화 작업(`docs/ai/product-catalog-sync-plan.md`) 및 추천/검색 연동 작업(`docs/ai/recommendation-search-integration-plan.md`) 둘 다 이 버그 때문에 실제 데이터로는 검증이 불가능한 상태였습니다(빈 상태 UI만 확인 가능).

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
