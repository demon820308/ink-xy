import { NextRequest, NextResponse } from "next/server";
import { listAvailableGenres, readGenreProfile, GenreProfileSchema } from "@actalk/inkos-core";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import "@/lib/env-init";

export const dynamic = "force-dynamic";

// GET /api/genres?cwd=<cwd>
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) {
    return NextResponse.json({ error: "cwd required" }, { status: 400 });
  }

  try {
    const genresList = await listAvailableGenres(cwd);
    const genres = await Promise.all(
      genresList.map(async (g) => {
        try {
          const detail = await readGenreProfile(cwd, g.id);
          return {
            id: g.id,
            name: g.name,
            source: g.source,
            profile: detail.profile,
            body: detail.body,
          };
        } catch (err) {
          return {
            id: g.id,
            name: g.name,
            source: g.source,
            error: String(err),
          };
        }
      })
    );
    return NextResponse.json({ success: true, genres });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/genres?cwd=<cwd>
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) {
    return NextResponse.json({ error: "cwd required" }, { status: 400 });
  }

  try {
    const { id, profile, body } = await request.json() as {
      id: string;
      profile: Record<string, unknown>;
      body: string;
    };

    if (!id || !profile || body === undefined) {
      return NextResponse.json({ error: "id, profile, and body are required" }, { status: 400 });
    }

    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanId || cleanId !== id || id === "." || id === "..") {
      return NextResponse.json({ error: "Invalid genre ID" }, { status: 400 });
    }

    // Validate using Zod schema exported from core
    const validatedProfile = GenreProfileSchema.parse(profile);

    // Convert profile to YAML frontmatter
    const frontmatterStr = yaml.dump(validatedProfile);
    const fileContent = `---\n${frontmatterStr}---\n\n${body}`;

    const genresDir = join(cwd, "genres");
    if (!existsSync(genresDir)) {
      mkdirSync(genresDir, { recursive: true });
    }

    const filePath = join(genresDir, `${id}.md`);
    writeFileSync(filePath, fileContent, "utf8");

    return NextResponse.json({ success: true, filePath });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
