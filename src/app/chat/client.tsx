"use client";

import { useState, useEffect, useRef } from "react";
import { ChatWidget } from "ucl-chat-widget/client";

export default function ChatPageClient() {
  const [available, setAvailable] = useState(true);
  const stageIdRef = useRef<number | null>(null);

  // Poll every 5 seconds to check stage status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/chat/status");
        if (!res.ok) return;
        const data = await res.json();

        if (!data.available) {
          setAvailable(false);
          return;
        }

        // If stage changed (moved to a different chatbot stage), reload
        if (stageIdRef.current === null) {
          stageIdRef.current = data.stageId;
        } else if (data.stageId !== stageIdRef.current) {
          // Stage changed — reload to get fresh conversations for the new stage
          window.location.reload();
        }
      } catch {}
    };

    // Check immediately on mount
    check();
    const interval = setInterval(check, 5000);

    // Also check when tab becomes visible again
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!available) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg">Chat is not available for this stage.</p>
          <p className="text-sm text-gray-500">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <ChatWidget
      config={{
        sidebarTitle: "AI Assistant",
        welcomeMessage: "How can I help with your analysis?",
        threadListLabel: "Your conversations",
        apiBasePath: "/api",
        sidebarPanels: [
          {
            title: "Scenario",
            content: (
              <p>
                You are assisting a professor in evaluating the outcome of an
                anti-discrimination campaign across schools in the US.
              </p>
            ),
            defaultExpanded: true,
          },
        ],
      }}
    />
  );
}
