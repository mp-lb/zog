import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import mdx from "fumadocs-mdx/vite";

export default defineConfig({
  plugins: [mdx(), react(), tailwindcss()],
  resolve: {
    alias: {
      collections: new URL("./.source", import.meta.url).pathname,
    },
  },
});
