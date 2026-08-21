# 추천/검색 연동 메모

작성일: 2026-08-21
관련 계획: `docs/ai/recommendation-search-integration-plan.md`

- `GET /api/v1/recommendations` 응답엔 드롭이 절대 나오지 않는다 — 백엔드 설계(추천 후보가 GENERAL 타입 상품으로 한정됨)이지, 버그가 아니다. "왜 드롭이 추천에 안 뜨지?" 류 질문은 버그 리포트로 올리지 말 것.
- 이 엔드포인트는 인증 필수(로그인 회원 ID로 개인화). 비로그인 상태에선 호출하지 않는다((shop) 레이아웃 가드가 이미 로그인 사용자만 통과시킴).
- ai-service 장애 시 503 `AI_RECOMMENDATION_UNAVAILABLE`이 정상적인 열화 상태로 발생할 수 있다. 홈/드롭 상세/일반상품 상세의 추천 섹션은 이를 "추천을 준비하고 있어요" 톤으로 부드럽게 처리하고, 상세 페이지 본편 기능(구매 등)에는 영향을 주지 않는다.
- 검색은 `GET /api/v1/products/product-list?keyword=`(계약 불변, 내부적으로 BM25+임베딩 하이브리드로 고도화됨)를 그대로 재사용한다. `CatalogBrowser`의 GENERAL 분기가 이 API를 호출하며, DROP 분기는 검색 API가 없어 기존 클라이언트 사이드 `filterProducts` 부분일치로만 필터링한다.
