"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password: password.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed.");
        return;
      }

      router.push("/study");
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-white">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 px-8">
        <h1 className="text-4xl font-normal text-heading text-center">
          UCL Study Manager
        </h1>

        <p className="text-sm text-body text-center">
          Enter your credentials to begin the study.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-heading mb-1">
              Identifier
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. stern-satin-karma"
              className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none focus:ring-2 focus:ring-input-border"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-heading mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. steam-creek-silk-moose-globe-cloak"
              className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none focus:ring-2 focus:ring-input-border"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !identifier || !password}
            className="flex-1 rounded-[5px] bg-btn-active-bg py-3 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          {loading && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-heading" />
          )}
        </div>
      </form>
    </main>
  );
}
