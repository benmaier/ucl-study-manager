import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

// Mirrors the plugin config used in StudyView, admin/preview, and preview pages.
// If any of those diverge from this config, update here too.
function renderStageMarkdown(source: string): string {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeRaw] },
      source
    )
  );
}

describe("stage markdown rendering", () => {
  it("renders plain markdown links as <a> tags", () => {
    const html = renderStageMarkdown("Please complete the [survey](https://example.com/survey).");
    expect(html).toContain('<a href="https://example.com/survey">survey</a>');
  });

  it("renders raw HTML anchor tags (rehype-raw)", () => {
    const html = renderStageMarkdown('Click <a href="https://example.com/test">test link</a> to continue.');
    expect(html).toContain('<a href="https://example.com/test">test link</a>');
  });

  it("renders raw HTML iframes (rehype-raw)", () => {
    const html = renderStageMarkdown(
      '<iframe src="https://www.youtube.com/embed/abc" title="YT"></iframe>'
    );
    expect(html).toMatch(/<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/abc"/);
  });

  it("renders raw HTML iframes with plain markdown around them", () => {
    const source = `# Survey\n\nPlease take the survey below.\n\n<iframe src="https://qualtrics.example/form" height="800"></iframe>\n\nThank you.`;
    const html = renderStageMarkdown(source);
    expect(html).toContain("<h1>Survey</h1>");
    expect(html).toMatch(/<iframe[^>]*src="https:\/\/qualtrics\.example\/form"/);
    expect(html).toContain("Thank you.");
  });

  it("baseline: without rehype-raw, raw HTML is escaped (regression guard)", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkGfm] },
        '<a href="https://example.com">test</a>'
      )
    );
    expect(html).not.toContain('<a href="https://example.com">');
    expect(html).toContain("&lt;a href");
  });
});
