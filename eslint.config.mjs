import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 이식 원본 참고 자료일 뿐, 이 프로젝트의 린트 대상이 아님
    "docs/**",
    // 임시 E2E 브라우저 테스트 스크립트(Playwright) — 앱 코드가 아니고 git에도 안 올라감
    "e2e-scratch/**",
  ]),
]);

export default eslintConfig;
