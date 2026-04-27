"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer used for stage content in both participant and preview
 * views. Centralises:
 *   - remark-gfm (tables, strikethrough, etc.)
 *   - rehype-raw (lets researchers use raw HTML like iframes)
 *   - external links always open in a new tab so back-navigation can't
 *     drop a participant off the study page mid-stage
 */
export function StageMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
