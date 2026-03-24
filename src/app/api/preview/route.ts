import { NextRequest, NextResponse } from "next/server";
import { parseStudyYaml } from "@/lib/yaml-parser";

export async function GET(request: NextRequest) {
  const studyDir = request.nextUrl.searchParams.get("dir");

  if (!studyDir) {
    return NextResponse.json({ error: "Missing 'dir' query parameter." }, { status: 400 });
  }

  try {
    const study = parseStudyYaml(studyDir);
    return NextResponse.json(study);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
