import browserCollections from "collections/browser";
import type { Root } from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import type { ComponentType } from "react";

export type DocPage = {
  path: string;
  url: string;
  title: string;
  description: string;
};

export type MdxPageModule = {
  default: ComponentType<{ components?: Record<string, ComponentType<any>> }>;
  frontmatter?: {
    title?: string;
    description?: string;
  };
  toc?: TOCItemType[];
};

export const pages: DocPage[] = [
  {
    path: "index.mdx",
    url: "/docs",
    title: "Introduction",
    description: "A tiny Zod-first persistence layer for MongoDB.",
  },
  {
    path: "quick-start.mdx",
    url: "/docs/quick-start",
    title: "Quick Start",
    description:
      "Define a model, create a database adapter, and read/write MongoDB records through Zog.",
  },
  {
    path: "features.mdx",
    url: "/docs/features",
    title: "Feature Backlog",
    description:
      "The roadmap and non-goals for keeping Zog useful without turning it into an ORM.",
  },
];

export const pageTree: Root = {
  name: "Zog",
  children: pages.map((page) => ({
    type: "page",
    name: page.title,
    url: page.url,
  })),
};

export function getPage(pathname: string): DocPage | undefined {
  const normalizedPath = pathname.replace(/\/$/, "") || "/docs";

  return pages.find((page) => page.url === normalizedPath);
}

export async function loadPage(page: DocPage): Promise<MdxPageModule> {
  const entry = browserCollections.docs.raw[page.path];

  if (!entry) {
    throw new Error(`Missing docs page: ${page.path}`);
  }

  return entry() as Promise<MdxPageModule>;
}
