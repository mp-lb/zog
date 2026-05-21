import { StrictMode, useEffect, useState } from "react";
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
import { getPage, loadPage, pageTree, type MdxPageModule } from "./lib/docs.js";
import "./styles/app.css";

function App() {
  const selectedPage = getPage(window.location.pathname) ?? getPage("/docs");
  const [loadedPage, setLoadedPage] = useState<MdxPageModule | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let ignore = false;

    if (!selectedPage) return;

    setLoadedPage(null);
    setError(null);
    loadPage(selectedPage)
      .then((page) => {
        if (!ignore) setLoadedPage(page);
      })
      .catch((cause: unknown) => {
        if (!ignore) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedPage]);

  if (!selectedPage) {
    return <p>Page not found.</p>;
  }

  if (error) {
    return <p>{error.message}</p>;
  }

  const MDX = loadedPage?.default;
  const title = loadedPage?.frontmatter?.title ?? selectedPage.title;
  const description =
    loadedPage?.frontmatter?.description ?? selectedPage.description;

  return (
    <RootProvider search={{ enabled: false }}>
      <DocsLayout
        tree={pageTree}
        nav={{
          title: (
            <>
              <span aria-hidden="true">🐸</span>
              <span>Zog</span>
            </>
          ),
        }}
      >
        <DocsPage toc={loadedPage?.toc ?? []}>
          <DocsTitle>{title}</DocsTitle>
          <DocsDescription>{description}</DocsDescription>
          <DocsBody>
            {MDX ? <MDX components={{ ...defaultMdxComponents }} /> : null}
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </RootProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
