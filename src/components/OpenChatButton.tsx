"use client";

export default function OpenChatButton() {
  function handleClick() {
    if (typeof window !== "undefined" && (window as any).electronAPI?.openChat) {
      (window as any).electronAPI.openChat({});
    } else {
      // Fallback for browser dev: open in new tab
      window.open("http://localhost:3001", "_blank");
    }
  }

  return (
    <button
      onClick={handleClick}
      className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
    >
      Open AI Assistant
    </button>
  );
}
