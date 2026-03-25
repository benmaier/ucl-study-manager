"use client";

import { ChatWidget } from "ucl-chat-widget/client";

export default function ChatPage() {
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
