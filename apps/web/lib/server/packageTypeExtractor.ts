import fs from "fs";
import path from "path";
import ts from "typescript";
import type {
  CustomTypeItem,
  CustomTypeField,
  CustomTypeKind,
} from "@workspace/canvas/types";

export interface PackageTypeExtractionResult {
  installed: boolean;
  pkg: string;
  version?: string;
  types: CustomTypeItem[];
  error?: string;
}

interface PackageJsonStructure {
  name?: string;
  version?: string;
  types?: string;
  typings?: string;
  exports?: Record<string, string | Record<string, string | Record<string, string>>>;
}

// In-memory cache keyed by "packageName@version"
const extractionCache = new Map<string, PackageTypeExtractionResult>();

function resolvePackageDirectory(pkg: string): string | null {
  const cwd = process.cwd();
  const pkgParts = pkg.split("/");

  // 1. Search upwards in node_modules from potential workspace roots (pure fs, no Turbopack bundler warnings)
  const searchRoots = [
    cwd,
    path.join(cwd, "apps", "web"),
    path.join(cwd, "packages", "backend"),
  ];

  for (const root of searchRoots) {
    let currentDir = path.resolve(root);
    while (true) {
      const candidateDir = path.join(currentDir, "node_modules", ...pkgParts);
      const pkgJsonPath = path.join(candidateDir, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        return candidateDir;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  // 2. Direct candidate directory checks
  const candidatePaths = [
    path.join(cwd, "node_modules", pkg),
    path.join(cwd, "node_modules", ...pkgParts),
    path.join(cwd, "apps/web/node_modules", pkg),
    path.join(cwd, "apps/web/node_modules", ...pkgParts),
    path.resolve(cwd, "../../node_modules", pkg),
    path.resolve(cwd, "../../node_modules", ...pkgParts),
    path.resolve(cwd, "../apps/web/node_modules", pkg),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveDtsEntry(pkgDir: string): { dtsPath: string | null; version?: string } {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return { dtsPath: null };
  }

  let pkgJson: PackageJsonStructure = {};
  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf-8");
    pkgJson = JSON.parse(raw);
  } catch {
    return { dtsPath: null };
  }

  const version = pkgJson.version;

  // 1. Check exports map for types
  if (pkgJson.exports) {
    const rootExport = pkgJson.exports["."];
    if (typeof rootExport === "string" && rootExport.endsWith(".d.ts")) {
      const candidate = path.resolve(pkgDir, rootExport);
      if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
    } else if (typeof rootExport === "object" && rootExport !== null) {
      if (typeof rootExport.types === "string") {
        const candidate = path.resolve(pkgDir, rootExport.types);
        if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
      }
      if (typeof rootExport.node === "object" && rootExport.node !== null) {
        const nodeTypes = rootExport.node.types;
        if (typeof nodeTypes === "string") {
          const candidate = path.resolve(pkgDir, nodeTypes);
          if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
        }
      }
      if (typeof rootExport.default === "object" && rootExport.default !== null) {
        const defaultTypes = rootExport.default.types;
        if (typeof defaultTypes === "string") {
          const candidate = path.resolve(pkgDir, defaultTypes);
          if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
        }
      }
    }
  }

  // 2. Check types or typings field
  const explicitTypes = pkgJson.types || pkgJson.typings;
  if (explicitTypes) {
    const candidate = path.resolve(pkgDir, explicitTypes);
    if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
  }

  // 3. Common fallback paths
  const commonFallbacks = [
    "index.d.ts",
    "dist/index.d.ts",
    "dist/esm/index.d.ts",
    "build/index.d.ts",
    "types/index.d.ts",
  ];

  for (const fallback of commonFallbacks) {
    const candidate = path.resolve(pkgDir, fallback);
    if (fs.existsSync(candidate)) return { dtsPath: candidate, version };
  }

  return { dtsPath: null, version };
}

function cleanPropertyType(typeString: string): string {
  const trimmed = typeString.trim();
  if (!trimmed || trimmed === "any" || trimmed === "unknown") {
    return "string";
  }
  // Normalize multi-line formatting without truncating types
  return trimmed.replace(/\s+/g, " ");
}

function extractJsDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges || ranges.length === 0) return undefined;

  for (const range of ranges) {
    const comment = fullText.slice(range.pos, range.end).trim();
    if (comment.startsWith("/**")) {
      return comment
        .replace(/^\/\*\*|\*\/$/g, "")
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, "").trim())
        .filter((line) => line.length > 0 && !line.startsWith("@"))
        .join(" ");
    }
  }
  return undefined;
}

function extractTypeFromDecl(
  primaryDecl: ts.Node,
  symName: string,
  trimmedPkg: string,
  seenNames: Set<string>,
): CustomTypeItem | null {
  // Check for Interface Declaration
  if (ts.isInterfaceDeclaration(primaryDecl)) {
    seenNames.add(symName);
    const description = extractJsDocComment(primaryDecl, primaryDecl.getSourceFile());
    const fields: CustomTypeField[] = [];

    for (const member of primaryDecl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText(primaryDecl.getSourceFile());
        const rawType = member.type ? member.type.getText(primaryDecl.getSourceFile()) : "string";
        const propDesc = extractJsDocComment(member, primaryDecl.getSourceFile());
        const isArray = member.type ? ts.isArrayTypeNode(member.type) : false;

        fields.push({
          id: `f-${symName}-${propName}`,
          name: propName,
          type: cleanPropertyType(rawType),
          required: member.questionToken === undefined,
          isArray,
          description: propDesc,
        });
      }
    }

    const item: CustomTypeItem = {
      id: `type-${trimmedPkg}-${symName}`,
      name: symName,
      kind: "interface",
      description: description || `Contract definition for ${symName} from ${trimmedPkg}`,
      fields,
      packageSource: trimmedPkg,
      isReadOnly: true,
      isExtendable: true,
      rawCode: primaryDecl.getText(primaryDecl.getSourceFile()),
    };
    return item;
  }

  // Check for Type Alias Declaration
  if (ts.isTypeAliasDeclaration(primaryDecl)) {
    seenNames.add(symName);
    const description = extractJsDocComment(primaryDecl, primaryDecl.getSourceFile());
    const aliasType = primaryDecl.type;
    const rawCode = primaryDecl.getText(primaryDecl.getSourceFile());

    // Object literal type alias: type Foo = { a: string }
    if (ts.isTypeLiteralNode(aliasType)) {
      const fields: CustomTypeField[] = [];
      for (const member of aliasType.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(primaryDecl.getSourceFile());
          const rawType = member.type ? member.type.getText(primaryDecl.getSourceFile()) : "string";
          const propDesc = extractJsDocComment(member, primaryDecl.getSourceFile());
          const isArray = member.type ? ts.isArrayTypeNode(member.type) : false;

          fields.push({
            id: `f-${symName}-${propName}`,
            name: propName,
            type: cleanPropertyType(rawType),
            required: member.questionToken === undefined,
            isArray,
            description: propDesc,
          });
        }
      }

      const item: CustomTypeItem = {
        id: `type-${trimmedPkg}-${symName}`,
        name: symName,
        kind: "type",
        description: description || `Type contract for ${symName} from ${trimmedPkg}`,
        fields,
        typeAliasValue: aliasType.getText(primaryDecl.getSourceFile()),
        packageSource: trimmedPkg,
        isReadOnly: true,
        isExtendable: true,
        rawCode,
      };
      return item;
    }

    // Union of string literals: type Status = "active" | "inactive"
    if (ts.isUnionTypeNode(aliasType)) {
      const enumValues: string[] = [];
      let allLiterals = true;

      for (const unionMember of aliasType.types) {
        if (ts.isLiteralTypeNode(unionMember) && ts.isStringLiteral(unionMember.literal)) {
          enumValues.push(unionMember.literal.text);
        } else {
          allLiterals = false;
        }
      }

      if (allLiterals && enumValues.length > 0) {
        const item: CustomTypeItem = {
          id: `type-${trimmedPkg}-${symName}`,
          name: symName,
          kind: "enum",
          description: description || `Enum union values for ${symName} from ${trimmedPkg}`,
          enumValues,
          packageSource: trimmedPkg,
          isReadOnly: true,
          isExtendable: true,
          rawCode,
        };
        return item;
      }

      const item: CustomTypeItem = {
        id: `type-${trimmedPkg}-${symName}`,
        name: symName,
        kind: "type",
        description: description || `Type alias for ${symName} from ${trimmedPkg}`,
        typeAliasValue: aliasType.getText(primaryDecl.getSourceFile()),
        packageSource: trimmedPkg,
        isReadOnly: true,
        isExtendable: true,
        rawCode,
      };
      return item;
    }

    const item: CustomTypeItem = {
      id: `type-${trimmedPkg}-${symName}`,
      name: symName,
      kind: "type",
      description: description || `Type alias for ${symName} from ${trimmedPkg}`,
      typeAliasValue: aliasType.getText(primaryDecl.getSourceFile()),
      packageSource: trimmedPkg,
      isReadOnly: true,
      isExtendable: true,
      rawCode,
    };
    return item;
  }

  // Check for Enum Declaration
  if (ts.isEnumDeclaration(primaryDecl)) {
    seenNames.add(symName);
    const description = extractJsDocComment(primaryDecl, primaryDecl.getSourceFile());
    const enumValues: string[] = primaryDecl.members.map((m) =>
      m.name.getText(primaryDecl.getSourceFile()),
    );

    const item: CustomTypeItem = {
      id: `type-${trimmedPkg}-${symName}`,
      name: symName,
      kind: "enum",
      description: description || `Enum contract for ${symName} from ${trimmedPkg}`,
      enumValues,
      packageSource: trimmedPkg,
      isReadOnly: true,
      isExtendable: true,
      rawCode: primaryDecl.getText(primaryDecl.getSourceFile()),
    };
    return item;
  }

  return null;
}

export function extractPackageTypesFromNodeModules(pkg: string): PackageTypeExtractionResult {
  const trimmedPkg = pkg.trim();
  if (!trimmedPkg) {
    return {
      installed: false,
      pkg: trimmedPkg,
      types: [],
      error: "Package name cannot be empty",
    };
  }

  const pkgDir = resolvePackageDirectory(trimmedPkg);
  if (!pkgDir) {
    return {
      installed: false,
      pkg: trimmedPkg,
      types: [],
      error: `Package "${trimmedPkg}" is missing from node_modules. Run 'pnpm i' to install.`,
    };
  }

  const { dtsPath, version } = resolveDtsEntry(pkgDir);
  if (!dtsPath) {
    return {
      installed: false,
      pkg: trimmedPkg,
      version,
      types: [],
      error: `Could not locate TypeScript declaration entry (.d.ts) for package "${trimmedPkg}".`,
    };
  }

  const cacheKey = `${trimmedPkg}@${version || "unknown"}`;
  const cached = extractionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const program = ts.createProgram([dtsPath], {
      allowJs: true,
      declaration: true,
      target: ts.ScriptTarget.Latest,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    });

    const typeChecker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(dtsPath);

    if (!sourceFile) {
      return {
        installed: true,
        pkg: trimmedPkg,
        version,
        types: [],
        error: `Could not parse TypeScript source file at ${dtsPath}`,
      };
    }

    const extractedTypes: CustomTypeItem[] = [];
    const seenNames = new Set<string>();

    // 1. Process module exports if available
    const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = typeChecker.getExportsOfModule(moduleSymbol);
      for (const exportSym of exports) {
        const symName = exportSym.name;
        if (
          symName.startsWith("_") ||
          symName === "default" ||
          seenNames.has(symName)
        ) {
          continue;
        }

        const declarations = exportSym.declarations;
        if (!declarations || declarations.length === 0) continue;

        const primaryDecl = declarations[0];
        if (!primaryDecl) continue;

        const item = extractTypeFromDecl(primaryDecl, symName, trimmedPkg, seenNames);
        if (item) extractedTypes.push(item);
      }
    }

    // 2. Process top-level statements directly in sourceFile (interfaces, type aliases, enums)
    for (const stmt of sourceFile.statements) {
      if (
        (ts.isInterfaceDeclaration(stmt) ||
          ts.isTypeAliasDeclaration(stmt) ||
          ts.isEnumDeclaration(stmt)) &&
        stmt.name
      ) {
        const symName = stmt.name.text;
        if (
          !symName.startsWith("_") &&
          symName !== "default" &&
          !seenNames.has(symName)
        ) {
          const item = extractTypeFromDecl(stmt, symName, trimmedPkg, seenNames);
          if (item) extractedTypes.push(item);
        }
      }
    }

    const result: PackageTypeExtractionResult = {
      installed: true,
      pkg: trimmedPkg,
      version: version || "installed",
      types: extractedTypes,
    };

    extractionCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to extract package types";
    return {
      installed: true,
      pkg: trimmedPkg,
      version,
      types: [],
      error: message,
    };
  }
}
