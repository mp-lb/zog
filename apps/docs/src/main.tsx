import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import { RootProvider } from "fumadocs-ui/provider/base";
import { source } from "./lib/source.js";
import "./styles/app.css";

const currentPath = window.location.pathname.replace(/\/$/, "");
const selectedPage =
  source.getPage(
    currentPath.startsWith("/docs")
      ? currentPath.slice("/docs".length).split("/").filter(Boolean)
      : [],
  ) ?? source.getPage([]);

if (!selectedPage) {
  throw new Error("No documentation pages were found.");
}

const MDX = selectedPage.data.body;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootProvider search={{ enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <>
              <span aria-hidden="true">🐸</span>
              <span>Zog</span>
            </>
          ),
        }}
      >
        <DocsPage toc={selectedPage.data.toc}>
          <DocsTitle>{selectedPage.data.title}</DocsTitle>
          {selectedPage.data.description ? (
            <DocsDescription>{selectedPage.data.description}</DocsDescription>
          ) : null}
          <DocsBody>
            <MDX components={{ ...defaultMdxComponents }} />
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </RootProvider>
  </StrictMode>,
);
