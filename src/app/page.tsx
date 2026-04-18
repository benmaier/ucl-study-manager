import { redirect } from "next/navigation";
import { getParticipant } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function IndexPage() {
  const participant = await getParticipant();

  // If a participant lands here with an active session (e.g. via back button
  // or URL-bar navigation), bounce them straight back to /study.
  if (participant) {
    redirect("/study");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-white">
      <LoginForm />
      <footer className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-gray-400">
          This site uses session-only cookies for authentication.{" "}
          <a href="/privacy-and-contact" className="underline hover:text-gray-500">Privacy & Contact</a>
        </p>
      </footer>
    </main>
  );
}
