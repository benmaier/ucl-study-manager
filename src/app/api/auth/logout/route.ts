import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Clear all session cookies
  for (const name of ["participant_id", "chat_provider", "is_test_user"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
