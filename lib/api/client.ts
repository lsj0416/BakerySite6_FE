import { clearTokens, getTokens, setTokens } from "@/lib/auth/token-storage";
import { ApiException, type ApiResponse } from "@/lib/api/types";

/**
 * 모든 요청은 API Gateway 하나로 나간다 — Gateway가 Authorization Bearer를 검증해
 * X-Openbake-Member-Id/Role/Auth-Source 내부 헤더를 만들어 각 서비스(root/member/
 * payment)로 전달한다. 그 내부 헤더는 게이트웨이만 만들 수 있어야 하므로(각 서비스의
 * HeaderAuthenticationFilter가 그 값만 신뢰함) 브라우저가 직접 만들거나 보내지 않는다.
 * 서비스별로 포트를 나눠 직접 호출하던 방식은 게이트웨이가 발급하지 않는 요청이라
 * 보호 API가 전부 401이 나서 폐기했다.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

let reissuePromise: Promise<string> | null = null;

/** 세션 만료로 강제 로그아웃될 때 현재 화면으로 돌아올 수 있게 returnTo를 실어 보낸다. */
function redirectToLogin() {
  if (typeof window === "undefined") return;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * accessToken(JWT)의 exp claim만 디코딩해서 만료 여부를 본다(서명 검증 아님 — 그건
 * 어차피 백엔드가 함, 여긴 "미리 갱신할지" 판단용). skewSeconds만큼 여유를 둬서
 * 요청이 서버에 도달하는 사이에 막 만료되는 경계 케이스를 피한다.
 */
function isTokenExpired(accessToken: string, skewSeconds = 10): boolean {
  try {
    const payload = accessToken.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof json.exp !== "number") return false;
    return Date.now() >= json.exp * 1000 - skewSeconds * 1000;
  } catch {
    return false;
  }
}

async function reissueAccessToken(): Promise<string> {
  const stored = getTokens();
  if (!stored) throw new ApiException("ME002", "유효하지 않은 인증 토큰입니다.");

  if (!reissuePromise) {
    reissuePromise = fetch(`${BASE_URL}/api/v1/auth/reissue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    })
      .then((res) => res.json() as Promise<ApiResponse<{ accessToken: string; refreshToken: string }>>)
      .then((json) => {
        if (!json.success) throw new ApiException(json.error.code, json.error.message);
        setTokens({
          memberId: stored.memberId,
          role: stored.role,
          provider: stored.provider,
          accessToken: json.data.accessToken,
          refreshToken: json.data.refreshToken,
        });
        return json.data.accessToken;
      })
      .finally(() => {
        reissuePromise = null;
      });
  }
  return reissuePromise;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const send = (accessToken?: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  const stored = auth ? getTokens() : null;

  /**
   * ⚠️ 만료된 accessToken을 그대로 보내면 안 됨: SecurityConfig의 필터 체인에
   * .cors(...) 연동이 없어서(WebConfig의 CORS 매핑은 MVC 레벨에만 적용) 인증
   * 실패로 필터 체인에서 막힌 응답엔 CORS 헤더가 안 붙고, 브라우저가 응답 자체를
   * JS에 전달하지 않고 통째로 막아버린다(docs/backend-bug-reports.md 참고).
   * 그러면 아래 401/403 처리 코드가 아예 실행될 기회조차 없이 fetch()가 바로
   * reject돼서 원인 모를 에러 메시지만 남는다 — 그래서 만료 여부를 미리 걸러
   * 보내기 전에 갱신해서 애초에 그 요청 자체가 안 나가게 만든다.
   */
  let accessToken = stored?.accessToken;
  if (auth && stored && isTokenExpired(stored.accessToken)) {
    try {
      accessToken = await reissueAccessToken();
    } catch {
      clearTokens();
      redirectToLogin();
      throw new ApiException("ME002", "로그인이 만료되었습니다. 다시 로그인해주세요.");
    }
  }

  let res = await send(accessToken);

  if (auth && (res.status === 401 || res.status === 403) && stored) {
    const cloned = (await res
      .clone()
      .json()
      .catch(() => null)) as ApiResponse<unknown> | null;
    const code = cloned && !cloned.success ? cloned.error.code : undefined;

    if (code === "ME002") {
      try {
        const newAccessToken = await reissueAccessToken();
        res = await send(newAccessToken);
      } catch {
        clearTokens();
        redirectToLogin();
        throw new ApiException("ME002", "유효하지 않은 인증 토큰입니다.");
      }
    } else if (cloned === null) {
      /**
       * 토큰이 없거나 만료/위조된 요청은 컨트롤러까지 도달하지 못하고 Spring Security
       * 필터 체인에서 막혀 바디가 빈 401/403을 반환한다(GlobalExceptionHandler를 거치지
       * 않아 {success,error} envelope이 없음 — docs/backend-bug-reports.md 참고). 이걸
       * 그냥 res.json()에 넘기면 파싱 자체가 실패해서 ApiException이 아닌 raw error가
       * 던져지고, 화면엔 각 컴포넌트의 fallback 문구("OO에 실패했습니다")만 뜬다.
       * 재시도해도 항상 같은 결과이므로 여기서 바로 재로그인으로 유도한다.
       */
      clearTokens();
      redirectToLogin();
      throw new ApiException("ME002", "로그인이 만료되었습니다. 다시 로그인해주세요.");
    }
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new ApiException(json.error.code, json.error.message);
  return json.data;
}
