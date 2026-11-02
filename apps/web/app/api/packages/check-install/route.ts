import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resolvePackageDirectory } from "@/lib/server/packageTypeExtractor";

export interface CheckInstallResponse {
  installed: boolean;
  pkg: string;
  version?: string;
  error?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pkg = searchParams.get("pkg")?.trim();

  if (!pkg) {
    return NextResponse.json<CheckInstallResponse>(
      { installed: false, pkg: "", error: "Package name is required" },
      { status: 400 },
    );
  }

  const outputDir = searchParams.get("outputDir")?.trim() || searchParams.get("projectDir")?.trim();

  try {
    const pkgDir = resolvePackageDirectory(pkg, outputDir);

    if (pkgDir) {
      let version: string | undefined;
      const pkgJsonPath = path.join(pkgDir, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const raw = fs.readFileSync(pkgJsonPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (typeof parsed.version === "string") {
            version = parsed.version;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      return NextResponse.json<CheckInstallResponse>({
        installed: true,
        pkg,
        version: version || "installed",
      });
    }

    return NextResponse.json<CheckInstallResponse>({
      installed: false,
      pkg,
      error: `Package "${pkg}" is not installed in node_modules. Run 'pnpm i' to install.`,
    });
  } catch (err) {
    return NextResponse.json<CheckInstallResponse>({
      installed: false,
      pkg,
      error: err instanceof Error ? err.message : "Failed to inspect node_modules",
    });
  }
}
