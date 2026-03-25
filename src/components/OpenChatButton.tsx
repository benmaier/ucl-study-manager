"use client";

export default function OpenChatButton() {
  return (
    <button
      onClick={() => window.open("/chat", "_blank")}
      className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
    >
      Open AI Assistant
    </button>
  );
}
