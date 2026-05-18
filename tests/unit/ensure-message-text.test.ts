import { describe, it, expect } from "vitest";
import { ensureTextOnLastUserMessage } from "../../src/lib/ensure-message-text";

describe("ensureTextOnLastUserMessage (parts shape — what the widget actually reads)", () => {
  it("leaves the body alone when the last user message already has text in parts", () => {
    const body = {
      id: "thread1",
      messages: [
        { role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as typeof body;
    expect(out.messages[0].parts).toEqual([{ type: "text", text: "hi" }]);
  });

  it("injects a placeholder when only file parts are attached", () => {
    const body = {
      id: "thread1",
      messages: [
        {
          role: "user",
          parts: [
            { type: "file", url: "data:image/png;base64,…" },
          ],
        },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { parts: { type: string; text?: string }[] }[];
    };
    const last = out.messages[0].parts;
    expect(last.length).toBe(2);
    expect(last[1].type).toBe("text");
    expect(last[1].text).toBe("(uploaded file)");
  });

  it("preserves the file part alongside the injected text", () => {
    const body = {
      messages: [
        {
          role: "user",
          parts: [{ type: "file", url: "data:…" }],
        },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { parts: { type: string }[] }[];
    };
    const types = out.messages[0].parts.map((p) => p.type);
    expect(types).toEqual(["file", "text"]);
  });

  it("only modifies the last user message, not earlier ones", () => {
    const body = {
      messages: [
        { role: "user", parts: [{ type: "text", text: "first" }] },
        { role: "assistant", parts: [{ type: "text", text: "hi" }] },
        { role: "user", parts: [{ type: "file", url: "data:…" }] },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { parts: { type: string; text?: string }[] }[];
    };
    expect(out.messages[0].parts).toEqual([{ type: "text", text: "first" }]);
    expect(out.messages[2].parts.length).toBe(2);
    expect(out.messages[2].parts[1].text).toBe("(uploaded file)");
  });

  it("does nothing when the last user message has no parts at all", () => {
    // Empty parts array — injecting a placeholder for a literally empty
    // message would be wrong; leave it for the widget to reject.
    const body = { messages: [{ role: "user", parts: [] as never[] }] };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { parts: unknown[] }[];
    };
    expect(out.messages[0].parts).toEqual([]);
  });
});

describe("ensureTextOnLastUserMessage (legacy content-array shape)", () => {
  it("injects a placeholder when content array has only file parts", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "file", file: { name: "a.csv" } }],
        },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    const types = out.messages[0].content.map((p) => p.type);
    expect(types).toEqual(["file", "text"]);
    expect(out.messages[0].content[1].text).toBe("(uploaded file)");
  });

  it("leaves content-string body untouched", () => {
    // `content` as a plain string is the widget's other fallback path —
    // the widget reads it directly, so we don't need to do anything.
    const body = {
      messages: [{ role: "user", content: "hi" }],
    };
    const out = ensureTextOnLastUserMessage(body) as typeof body;
    expect(out.messages[0].content).toBe("hi");
  });
});

describe("ensureTextOnLastUserMessage (edge cases)", () => {
  it("does nothing for a non-object body", () => {
    expect(ensureTextOnLastUserMessage(null)).toBeNull();
    expect(ensureTextOnLastUserMessage("not an object")).toBe("not an object");
  });
});
