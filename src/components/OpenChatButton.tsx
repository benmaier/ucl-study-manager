"use client";

import { useRouter } from "next/navigation";

export default function OpenChatButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push("/chat")}
      className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
    >
      Open AI Assistant
    </button>
  );
}
