import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { importStudyFromDir } from "@/lib/study-importer";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import extract from "extract-zip";
import { readdirSync, existsSync } from "fs";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || !file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "Please upload a .zip file." }, { status: 400 });
  }

  const tmpDir = join("/tmp", `study-upload-${randomUUID()}`);
  const zipPath = join(tmpDir, "upload.zip");

  try {
    // Write zip to temp
    mkdirSync(tmpDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    writeFileSync(zipPath, Buffer.from(bytes));

    // Extract
    await extract(zipPath, { dir: tmpDir });

    // Find the study directory (may be nested in a single folder)
    let studyDir = tmpDir;
    const entries = readdirSync(tmpDir).filter((e) => e !== "upload.zip" && !e.startsWith("."));
    if (entries.length === 1 && existsSync(join(tmpDir, entries[0], "study.yaml"))) {
      studyDir = join(tmpDir, entries[0]);
    }

    if (!existsSync(join(studyDir, "study.yaml"))) {
      return NextResponse.json(
        { error: "No study.yaml found in the uploaded zip. Make sure it's at the root or in a single top-level folder." },
        { status: 400 }
      );
    }

    // Import
    const result = await importStudyFromDir(studyDir);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    // Cleanup
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
