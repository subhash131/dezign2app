import fs from "fs";
import path from "path";
import ts from "typescript";
import type {
  CustomTypeItem,
  CustomTypeField,
  CustomTypeKind,
} from "@workspace/canvas/types";

export interface PackageExportSymbol {
  name: string;
  kind: "function" | "variable" | "class" | "interface" | "type" | "enum";
  signature?: string;
  description?: string;
  isDefault?: boolean;
}

export interface PackageTypeExtractionResult {
  installed: boolean;
  pkg: string;
  version?: string;
  types: CustomTypeItem[];
  exports?: PackageExportSymbol[];
  error?: string;
}

interface PackageJsonStructure {
  name?: string;
  version?: string;
  types?: string;
  typings?: string;
  main?: string;
  module?: string;
  exports?: Record<string, string | Record<string, string | Record<string, string>>>;
}

// In-memory cache keyed by "packageName@version"
const extractionCache = new Map<string, PackageTypeExtractionResult>();

export const UUID_BUILTIN_TYPES: CustomTypeItem[] = [
  {
    id: "type-uuid-v4",
    name: "v4",
    kind: "function",
    description: "Generate RFC4122 version 4 (random) UUID",
    returnType: "string",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-v1",
    name: "v1",
    kind: "function",
    description: "Generate RFC4122 version 1 (timestamp) UUID",
    returnType: "string",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-v5",
    name: "v5",
    kind: "function",
    description: "Generate RFC4122 version 5 (namespace with SHA-1) UUID",
    returnType: "string",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-v3",
    name: "v3",
    kind: "function",
    description: "Generate RFC4122 version 3 (namespace with MD5) UUID",
    returnType: "string",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-validate",
    name: "validate",
    kind: "function",
    description: "Validate if a string is a valid UUID",
    returnType: "boolean",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-version",
    name: "version",
    kind: "function",
    description: "Detect the RFC4122 version of a UUID",
    returnType: "number",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-parse",
    name: "parse",
    kind: "function",
    description: "Parse a UUID string into an array of bytes",
    returnType: "Uint8Array",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-stringify",
    name: "stringify",
    kind: "function",
    description: "Convert an array of bytes into a UUID string",
    returnType: "string",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-NIL",
    name: "NIL",
    kind: "type",
    typeAliasValue: '"00000000-0000-0000-0000-000000000000"',
    description: "The nil UUID string '00000000-0000-0000-0000-000000000000'",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
  {
    id: "type-uuid-UUID",
    name: "UUID",
    kind: "type",
    typeAliasValue: "string",
    description: "RFC4122 UUID string format",
    packageSource: "uuid",
    isReadOnly: true,
    isExtendable: true,
  },
];

export const UUID_BUILTIN_EXPORTS: PackageExportSymbol[] = [
  { name: "v4", kind: "function", description: "Generate RFC4122 version 4 (random) UUID" },
  { name: "v1", kind: "function", description: "Generate RFC4122 version 1 (timestamp) UUID" },
  { name: "v5", kind: "function", description: "Generate RFC4122 version 5 (namespace with SHA-1) UUID" },
  { name: "v3", kind: "function", description: "Generate RFC4122 version 3 (namespace with MD5) UUID" },
  { name: "validate", kind: "function", description: "Validate if a string is a valid UUID" },
  { name: "version", kind: "function", description: "Detect the RFC4122 version of a UUID" },
  { name: "parse", kind: "function", description: "Parse a UUID string into an array of bytes" },
  { name: "stringify", kind: "function", description: "Convert an array of bytes into a UUID string" },
  { name: "NIL", kind: "type", description: "The nil UUID string '00000000-0000-0000-0000-000000000000'" },
  { name: "UUID", kind: "type", description: "RFC4122 UUID string format" },
];

function findInPnpmStore(pnpmStoreDir: string, pkg: string): string | null {
  if (!fs.existsSync(pnpmStoreDir)) return null;
  const pkgParts = pkg.split("/");
  const escapedPkgPrefix = pkg.replace(/\//g, "+") + "@";
  try {
    const entries = fs.readdirSync(pnpmStoreDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(escapedPkgPrefix)) {
        const candidate = path.join(pnpmStoreDir, entry.name, "node_modules", ...pkgParts);
        if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "package.json"))) {
          return candidate;
        }
      }
    }
  } catch {}
  return null;
}

export function resolvePackageDirectory(pkg: string, projectDir?: string): string | null {
  const cwd = process.cwd();
  const pkgParts = pkg.split("/");

  const searchStarts: string[] = [];
  if (projectDir) {
    const clean = path.resolve(projectDir);
    if (fs.existsSync(clean)) {
      searchStarts.push(clean);
      const subTransformers = path.join(clean, "packages", "transformers");
      if (fs.existsSync(subTransformers)) searchStarts.push(subTransformers);
      const subBackend = path.join(clean, "packages", "backend");
      if (fs.existsSync(subBackend)) searchStarts.push(subBackend);
    }
  }
  searchStarts.push(cwd);

  const knownLocations = [
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "apps/web"),
    path.resolve(cwd, "packages/backend"),
  ];
  for (const loc of knownLocations) {
    if (fs.existsSync(loc) && !searchStarts.includes(loc)) {
      searchStarts.push(loc);
    }
  }

  const visitedDirs = new Set<string>();

  for (const startDir of searchStarts) {
    let currentDir = startDir;
    while (currentDir && !visitedDirs.has(currentDir)) {
      visitedDirs.add(currentDir);

      // 1. Direct candidate: <currentDir>/node_modules/<pkg>
      const direct = path.join(currentDir, "node_modules", ...pkgParts);
      if (fs.existsSync(direct) && fs.existsSync(path.join(direct, "package.json"))) {
        return direct;
      }

      // 2. pnpm virtual store: <currentDir>/node_modules/.pnpm/<escapedPkg>@<version>/node_modules/<pkg>
      const pnpmVirtual = path.join(currentDir, "node_modules", ".pnpm");
      const foundInPnpm = findInPnpmStore(pnpmVirtual, pkg);
      if (foundInPnpm) {
        return foundInPnpm;
      }

      // 3. Monorepo subpackages: <currentDir>/apps/*/node_modules/<pkg> & <currentDir>/packages/*/node_modules/<pkg>
      for (const sub of ["apps", "packages"]) {
        const subFolder = path.join(currentDir, sub);
        if (fs.existsSync(subFolder)) {
          try {
            const entries = fs.readdirSync(subFolder, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const cand = path.join(subFolder, entry.name, "node_modules", ...pkgParts);
                if (fs.existsSync(cand) && fs.existsSync(path.join(cand, "package.json"))) {
                  return cand;
                }
              }
            }
          } catch {}
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return null;
}

function resolveDtsEntry(
  pkgDir: string,
  pkgName?: string,
  projectDir?: string,
): { dtsPath: string | null; jsPath: string | null; version?: string } {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return { dtsPath: null, jsPath: null };
  }

  let pkgJson: PackageJsonStructure = {};
  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf-8");
    pkgJson = JSON.parse(raw);
  } catch {
    return { dtsPath: null, jsPath: null };
  }

  const version = pkgJson.version;
  let dtsCandidate: string | null = null;
  let jsCandidate: string | null = null;

  // 1. Check exports map for types or js entry
  if (pkgJson.exports) {
    const rootExport = pkgJson.exports["."];
    if (typeof rootExport === "string") {
      if (rootExport.endsWith(".d.ts") || rootExport.endsWith(".d.mts")) {
        const candidate = path.resolve(pkgDir, rootExport);
        if (fs.existsSync(candidate)) dtsCandidate = candidate;
      } else {
        const candidate = path.resolve(pkgDir, rootExport);
        if (fs.existsSync(candidate)) jsCandidate = candidate;
      }
    } else if (typeof rootExport === "object" && rootExport !== null) {
      if (typeof rootExport.types === "string") {
        const candidate = path.resolve(pkgDir, rootExport.types);
        if (fs.existsSync(candidate)) dtsCandidate = candidate;
      }
      if (typeof rootExport.node === "object" && rootExport.node !== null) {
        const nodeTypes = rootExport.node.types;
        if (typeof nodeTypes === "string") {
          const candidate = path.resolve(pkgDir, nodeTypes);
          if (fs.existsSync(candidate)) dtsCandidate = candidate;
        }
        if (!jsCandidate) {
          const nodeModule =
            rootExport.node.module || rootExport.node.import || rootExport.node.require;
          if (typeof nodeModule === "string") {
            const cand = path.resolve(pkgDir, nodeModule);
            if (fs.existsSync(cand)) jsCandidate = cand;
          }
        }
      }
      if (typeof rootExport.default === "object" && rootExport.default !== null) {
        const defaultTypes = rootExport.default.types;
        if (typeof defaultTypes === "string") {
          const candidate = path.resolve(pkgDir, defaultTypes);
          if (fs.existsSync(candidate)) dtsCandidate = candidate;
        }
      }
      if (!jsCandidate) {
        const def =
          rootExport.import || rootExport.module || rootExport.default || rootExport.require;
        if (typeof def === "string") {
          const cand = path.resolve(pkgDir, def);
          if (fs.existsSync(cand)) jsCandidate = cand;
        }
      }
    }
  }

  // 2. Check types or typings field
  if (!dtsCandidate) {
    const explicitTypes = pkgJson.types || pkgJson.typings;
    if (explicitTypes) {
      const candidate = path.resolve(pkgDir, explicitTypes);
      if (fs.existsSync(candidate)) dtsCandidate = candidate;
    }
  }

  // 3. Common d.ts fallback paths
  if (!dtsCandidate) {
    const commonDtsFallbacks = [
      "index.d.ts",
      "index.d.mts",
      "dist/index.d.ts",
      "dist/index.d.mts",
      "dist/esm/index.d.ts",
      "dist/esm-node/index.d.ts",
      "build/index.d.ts",
      "types/index.d.ts",
      "lib/index.d.ts",
    ];
    for (const fallback of commonDtsFallbacks) {
      const candidate = path.resolve(pkgDir, fallback);
      if (fs.existsSync(candidate)) {
        dtsCandidate = candidate;
        break;
      }
    }
  }

  // 4. DefinitelyTyped fallback (@types/<pkg>) if no in-package .d.ts
  if (!dtsCandidate && pkgName) {
    const typesPkgName = pkgName.startsWith("@")
      ? `@types/${pkgName.slice(1).replace(/\//g, "__")}`
      : `@types/${pkgName}`;
    const typesPkgDir = resolvePackageDirectory(typesPkgName, projectDir);
    if (typesPkgDir) {
      const typesRes = resolveDtsEntry(typesPkgDir);
      if (typesRes.dtsPath) {
        dtsCandidate = typesRes.dtsPath;
      }
    }
  }

  // 5. If no d.ts found, locate JavaScript entry candidate
  if (!jsCandidate) {
    const jsFields = [pkgJson.module, pkgJson.main];
    for (const f of jsFields) {
      if (typeof f === "string") {
        const cand = path.resolve(pkgDir, f);
        if (fs.existsSync(cand)) {
          jsCandidate = cand;
          break;
        }
      }
    }
  }

  if (!jsCandidate) {
    const commonJsFallbacks = [
      "dist/esm-node/index.js",
      "dist/esm/index.js",
      "dist/index.js",
      "index.js",
      "lib/index.js",
      "wrapper.mjs",
    ];
    for (const fallback of commonJsFallbacks) {
      const candidate = path.resolve(pkgDir, fallback);
      if (fs.existsSync(candidate)) {
        jsCandidate = candidate;
        break;
      }
    }
  }

  return { dtsPath: dtsCandidate, jsPath: jsCandidate, version };
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

export function extractPackageTypesFromNodeModules(
  pkg: string,
  projectDir?: string,
): PackageTypeExtractionResult {
  const trimmedPkg = pkg.trim();
  if (!trimmedPkg) {
    return {
      installed: false,
      pkg: trimmedPkg,
      types: [],
      error: "Package name cannot be empty",
    };
  }

  const pkgDir = resolvePackageDirectory(trimmedPkg, projectDir);
  if (!pkgDir) {
    if (trimmedPkg === "uuid") {
      const fallbackResult: PackageTypeExtractionResult = {
        installed: true,
        pkg: trimmedPkg,
        version: "native",
        types: [...UUID_BUILTIN_TYPES],
        exports: [...UUID_BUILTIN_EXPORTS],
      };
      return fallbackResult;
    }

    return {
      installed: false,
      pkg: trimmedPkg,
      types: [],
      error: `Package "${trimmedPkg}" is missing from node_modules. Run 'pnpm i' to install.`,
    };
  }

  const { dtsPath, jsPath, version } = resolveDtsEntry(pkgDir, trimmedPkg, projectDir);
  const targetEntryPath = dtsPath || jsPath;

  const cacheKey = `${trimmedPkg}@${version || "unknown"}:${projectDir || "default"}`;
  const cached = extractionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const extractedTypes: CustomTypeItem[] = [];
  const extractedExports: PackageExportSymbol[] = [];
  const seenNames = new Set<string>();
  const seenExportNames = new Set<string>();

  if (targetEntryPath && fs.existsSync(targetEntryPath)) {
    try {
      const program = ts.createProgram([targetEntryPath], {
        allowJs: true,
        declaration: true,
        target: ts.ScriptTarget.Latest,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      });

      const typeChecker = program.getTypeChecker();
      const sourceFile = program.getSourceFile(targetEntryPath);

      if (sourceFile) {
        // Helper to determine kind and signature
        const recordExportSymbol = (sym: ts.Symbol, name: string, isDefault = false) => {
          if (seenExportNames.has(name) || name.startsWith("_")) return;
          seenExportNames.add(name);

          let targetSym = sym;
          if ((sym.flags & ts.SymbolFlags.Alias) !== 0) {
            try {
              targetSym = typeChecker.getAliasedSymbol(sym);
            } catch {}
          }

          const decls = targetSym.declarations;
          const primaryDecl = decls && decls.length > 0 ? decls[0] : undefined;
          const desc = primaryDecl ? extractJsDocComment(primaryDecl, sourceFile) : undefined;

          let kind: PackageExportSymbol["kind"] = "function";
          let signature: string | undefined;

          if (primaryDecl) {
            if (ts.isFunctionDeclaration(primaryDecl)) {
              kind = "function";
              try {
                const sig = typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(targetSym, primaryDecl));
                signature = sig;
              } catch {}
            } else if (ts.isClassDeclaration(primaryDecl)) {
              kind = "class";
            } else if (ts.isInterfaceDeclaration(primaryDecl)) {
              kind = "interface";
            } else if (ts.isTypeAliasDeclaration(primaryDecl)) {
              kind = "type";
            } else if (ts.isEnumDeclaration(primaryDecl)) {
              kind = "enum";
            } else if (ts.isVariableDeclaration(primaryDecl)) {
              try {
                const symType = typeChecker.getTypeOfSymbolAtLocation(targetSym, primaryDecl);
                if (symType.getCallSignatures().length > 0) {
                  kind = "function";
                  signature = typeChecker.typeToString(symType);
                } else {
                  kind = "variable";
                }
              } catch {
                kind = "variable";
              }
            }
          }

          extractedExports.push({
            name,
            kind,
            signature,
            description: desc,
            isDefault,
          });
        };

        // 1. Process module exports if available
        const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
        if (moduleSymbol) {
          const exports = typeChecker.getExportsOfModule(moduleSymbol);
          for (const exportSym of exports) {
            const symName = exportSym.name;
            if (symName === "default") {
              recordExportSymbol(exportSym, "default", true);
              continue;
            }

            if (symName.startsWith("_")) continue;

            let targetSym = exportSym;
            if ((exportSym.flags & ts.SymbolFlags.Alias) !== 0) {
              try {
                targetSym = typeChecker.getAliasedSymbol(exportSym);
              } catch {}
            }

            const declarations = targetSym.declarations;
            if (declarations && declarations.length > 0) {
              const primaryDecl = declarations[0];
              if (primaryDecl) {
                const item = extractTypeFromDecl(primaryDecl, symName, trimmedPkg, seenNames);
                if (item) extractedTypes.push(item);
              }
            }

            recordExportSymbol(exportSym, symName, false);
          }
        }

        // 2. Process top-level statements directly in sourceFile (interfaces, type aliases, enums, functions)
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

          // Check for top-level function declarations
          if (ts.isFunctionDeclaration(stmt) && stmt.name) {
            const fnName = stmt.name.text;
            if (!fnName.startsWith("_") && !seenExportNames.has(fnName)) {
              seenExportNames.add(fnName);
              extractedExports.push({
                name: fnName,
                kind: "function",
                description: extractJsDocComment(stmt, sourceFile),
              });
            }
          }
        }
      }
    } catch {
      // Best-effort AST extraction
    }
  }

  // 3. Fallback: For packages with exports but no extracted types (or uuid), ensure types are populated
  if (trimmedPkg === "uuid") {
    for (const b of UUID_BUILTIN_TYPES) {
      if (!extractedTypes.some((t) => t.name === b.name)) {
        extractedTypes.push(b);
      }
    }
  } else if (extractedTypes.length === 0 && extractedExports.length > 0) {
    for (const exp of extractedExports) {
      if (seenNames.has(exp.name)) continue;
      seenNames.add(exp.name);
      extractedTypes.push({
        id: `type-${trimmedPkg}-${exp.name}`,
        name: exp.name,
        kind: exp.kind === "function" ? "function" : "type",
        description: exp.description || `Exported ${exp.kind} ${exp.name} from ${trimmedPkg}`,
        returnType: exp.kind === "function" ? (exp.signature || "any") : undefined,
        typeAliasValue: exp.kind !== "function" ? (exp.signature || "any") : undefined,
        packageSource: trimmedPkg,
        isReadOnly: true,
        isExtendable: true,
      });
    }
  }

  const result: PackageTypeExtractionResult = {
    installed: true,
    pkg: trimmedPkg,
    version: version || "installed",
    types: extractedTypes,
    exports: extractedExports,
  };

  extractionCache.set(cacheKey, result);
  return result;
}
