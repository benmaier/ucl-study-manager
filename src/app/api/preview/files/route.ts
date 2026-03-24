import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".py": "text/x-python",
  ".txt": "text/plain",
  ".json": "application/json",
  ".md": "text/markdown",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
};

export async function GET(request: NextRequest) {
  const studyDir = request.nextUrl.searchParams.get("dir");
  const filename = request.nextUrl.searchParams.get("file");

  if (!studyDir || !filename) {
    return NextResponse.json({ error: "Missing 'dir' or 'file' parameter." }, { status: 400 });
  }

  const filePath = join(studyDir, filename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const data = readFileSync(filePath);
  const ext = extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename.split("/").pop()}"`,
    },
  });
}
