export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark h-screen bg-[var(--llmchat-background)] text-[var(--llmchat-foreground)]">
      {children}
    </div>
  );
}
