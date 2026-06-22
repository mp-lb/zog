import { createBaseEslintConfig } from "@mp-lb/fssstack-config/eslint";

export default createBaseEslintConfig({
  project: [
    "./tsconfig.json",
    "./apps/**/tsconfig.json",
    "./apps/**/tsconfig.app.json",
    "./packages/**/tsconfig.json",
  ],
  tsconfigRootDir: import.meta.dirname,
});
