"use client";

import { useState, useEffect } from "react";
import { ChatWidget } from "ucl-chat-widget/client";

export default function ChatPageClient() {
  const [available, setAvailable] = useState(true);

  // Poll every 5 seconds to check if still on a chatbot stage
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/chat/status");
        if (res.ok) {
          const data = await res.json();
          if (!data.available) setAvailable(false);
        }
      } catch {}
    };

    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
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
