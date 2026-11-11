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
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
  ]),
  // Raw Cloudflare API JSON is untyped at the boundary; typing every response isn't worth it.
  { files: ["lib/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
]);

export default eslintConfig;
