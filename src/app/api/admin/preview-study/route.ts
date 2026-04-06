import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { parseStudyYaml } from "@/lib/yaml-parser";
import { writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import extract from "extract-zip";

/**
 * Validate and parse a study zip without importing to DB.
 * Returns the full ParsedStudy JSON for client-side preview.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || !file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "Please upload a .zip file." }, { status: 400 });
  }

  const tmpDir = join("/tmp", `study-preview-${randomUUID()}`);
  const zipPath = join(tmpDir, "upload.zip");

  try {
    mkdirSync(tmpDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    writeFileSync(zipPath, Buffer.from(bytes));

    await extract(zipPath, { dir: tmpDir });

    // Find study directory (may be nested in a single folder)
    let studyDir = tmpDir;
    const entries = readdirSync(tmpDir).filter((e) => e !== "upload.zip" && !e.startsWith("."));
    if (entries.length === 1 && existsSync(join(tmpDir, entries[0], "study.yaml"))) {
      studyDir = join(tmpDir, entries[0]);
    }

    if (!existsSync(join(studyDir, "study.yaml"))) {
      return NextResponse.json(
        { error: "No study.yaml found in the uploaded zip." },
        { status: 400 }
      );
    }

    // Parse and validate only — no DB import
    const parsed = parseStudyYaml(studyDir);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
