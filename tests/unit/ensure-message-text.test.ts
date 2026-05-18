import { describe, it, expect } from "vitest";
import { ensureTextOnLastUserMessage } from "../../src/lib/ensure-message-text";

describe("ensureTextOnLastUserMessage", () => {
  it("leaves the body alone when the last user message already has text", () => {
    const body = {
      id: "thread1",
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as typeof body;
    expect(out.messages[0].content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("injects a placeholder text part when only files are attached", () => {
    const body = {
      id: "thread1",
      messages: [
        {
          role: "user",
          content: [
            { type: "file", file: { name: "data.csv" } },
          ],
        },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    const last = out.messages[0].content;
    expect(last.length).toBe(2);
    expect(last[1].type).toBe("text");
    expect(last[1].text).toBe("(uploaded file)");
  });

  it("preserves file parts alongside the injected text", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "file", file: { name: "a.csv" } }],
        },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { content: { type: string }[] }[];
    };
    const types = out.messages[0].content.map((p) => p.type);
    expect(types).toEqual(["file", "text"]);
  });

  it("only modifies the last user message, not earlier ones", () => {
    const body = {
      messages: [
        { role: "user", content: [{ type: "text", text: "first" }] },
        { role: "assistant", content: [{ type: "text", text: "hi" }] },
        { role: "user", content: [{ type: "file", file: {} }] },
      ],
    };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    expect(out.messages[0].content).toEqual([{ type: "text", text: "first" }]);
    expect(out.messages[2].content.length).toBe(2);
    expect(out.messages[2].content[1].text).toBe("(uploaded file)");
  });

  it("does nothing for a non-object body", () => {
    expect(ensureTextOnLastUserMessage(null)).toBeNull();
    expect(ensureTextOnLastUserMessage("not an object")).toBe("not an object");
  });

  it("does nothing when the last user message has no parts at all", () => {
    // Empty array — injecting a placeholder for a literally empty message
    // would be wrong; leave it for the widget to reject.
    const body = { messages: [{ role: "user", content: [] as never[] }] };
    const out = ensureTextOnLastUserMessage(body) as {
      messages: { content: unknown[] }[];
    };
    expect(out.messages[0].content).toEqual([]);
  });
});
