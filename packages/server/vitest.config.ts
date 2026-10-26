import { defineConfig, mergeConfig } from "vitest/config";
import nodeConfig from "../../etc/vitest.node.config";

export default mergeConfig(
  nodeConfig,
  defineConfig({
    resolve: {
      alias: {
        "@mp-lb/zog-core": new URL("../core/src/index.ts", import.meta.url)
          .pathname,
      },
    },
  }),
);
