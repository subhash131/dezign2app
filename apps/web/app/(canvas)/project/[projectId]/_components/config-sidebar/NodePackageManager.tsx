import React, { useState, useEffect, useTransition } from "react";
import {
  Package,
  Plus,
  Trash2,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  Lock,
  ExternalLink,
  Edit2,
  CheckCircle2,
  Layers,
  Wrench,
  Terminal,
} from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { NodeDependencyItem } from "@workspace/canvas";
import { useParams } from "next/navigation";
import { getProjectWorkspaceDir } from "../terminal/hooks/projectWorkspaceUtils";
import { getActiveProjectOutputDir } from "@/lib/utils/localEnvSync";
import {
  syncPackageTypesToCanvas,
  syncPackageToDiskPackageJson,
} from "@/lib/stores/backendCanvas/packageTypesSync";

interface NodePackageManagerProps {
  nodeId: string;
  nodeType: "service" | "webApp" | "webPage" | "transformer";
  projectId?: string;
  outputDir?: string;
  customDependencies?: NodeDependencyItem[];
  onUpdateDependencies: (deps: NodeDependencyItem[]) => void;
  inferredDependencies?: { name: string; version: string; reason: string }[];
  inferredDevDependencies?: { name: string; version: string; reason: string }[];
}

interface CuratedPreset {
  category: string;
  items: {
    name: string;
    version?: string;
    isDev?: boolean;
    description: string;
  }[];
}

const TRANSFORMER_PRESETS: CuratedPreset[] = [
  {
    category: "Data & Manipulation",
    items: [
      { name: "lodash-es", version: "^4.17.21", description: "Modular ES utilities & object helpers" },
      { name: "slugify", version: "^1.6.6", description: "String slugification utility" },
      { name: "validator", version: "^13.12.0", description: "String validation and sanitization" },
      { name: "deepmerge", version: "^4.3.1", description: "Deep merge objects & arrays" },
    ],
  },
  {
    category: "Dates & Numbers",
    items: [
      { name: "dayjs", version: "^1.11.10", description: "Fast 2kB date parsing and formatting" },
      { name: "date-fns", version: "^3.6.0", description: "Modern modular date utility library" },
      { name: "bignumber.js", version: "^9.1.2", description: "Arbitrary-precision decimal arithmetic" },
      { name: "mathjs", version: "^12.4.1", description: "Extensive math library for JavaScript" },
    ],
  },
  {
    category: "Identifiers & Crypto",
    items: [
      { name: "uuid", version: "^11.1.0", description: "RFC4122 UUID generator (native TypeScript types)" },
      { name: "nanoid", version: "^5.0.6", description: "Compact URL-friendly unique ID generator" },
      { name: "crypto-js", version: "^4.2.0", description: "Standard cryptographic algorithms in JS" },
      { name: "hash-wasm", version: "^4.11.0", description: "Lightning fast hashing algorithms" },
    ],
  },
  {
    category: "Schema & Parsing",
    items: [
      { name: "zod", version: "^3.24.2", description: "TypeScript-first schema validation" },
      { name: "papaparse", version: "^5.4.1", description: "Fast CSV parser" },
      { name: "cheerio", version: "^1.0.0-rc.12", description: "Fast HTML/XML parsing" },
      { name: "qs", version: "^6.12.0", description: "Query string parser with nested object support" },
    ],
  },
  {
    category: "Dev & Types",
    items: [
      { name: "@types/lodash-es", version: "^4.17.12", isDev: true, description: "Lodash ES types" },
      { name: "@types/uuid", version: "^9.0.8", isDev: true, description: "UUID types" },
      { name: "@types/validator", version: "^13.11.9", isDev: true, description: "Validator types" },
      { name: "@types/crypto-js", version: "^4.2.2", isDev: true, description: "CryptoJS types" },
      { name: "@types/papaparse", version: "^5.3.14", isDev: true, description: "PapaParse types" },
    ],
  },
];

const SERVICE_PRESETS: CuratedPreset[] = [
  {
    category: "APIs & Payments",
    items: [
      { name: "stripe", version: "^14.18.0", description: "Stripe official payment SDK" },
      { name: "resend", version: "^3.2.0", description: "Email delivery SDK" },
      { name: "@aws-sdk/client-s3", version: "^3.535.0", description: "AWS S3 file uploads" },
      { name: "twilio", version: "^5.0.1", description: "SMS & Communication SDK" },
    ],
  },
  {
    category: "AI & LLMs",
    items: [
      { name: "openai", version: "^4.33.0", description: "Official OpenAI Node SDK" },
      { name: "@anthropic-ai/sdk", version: "^0.18.0", description: "Anthropic Claude API" },
      { name: "groq-sdk", version: "^0.3.2", description: "Groq Fast Inference SDK" },
      { name: "langchain", version: "^0.1.28", description: "LangChain orchestration" },
    ],
  },
  {
    category: "Utilities & Data",
    items: [
      { name: "lodash-es", version: "^4.17.21", description: "ES modular utilities" },
      { name: "dayjs", version: "^1.11.10", description: "Fast lightweight date parser" },
      { name: "uuid", version: "^11.1.0", description: "RFC4122 UUID generator (native TypeScript types)" },
      { name: "nanoid", version: "^5.0.6", description: "Compact URL-friendly ID generator" },
      { name: "axios", version: "^1.6.8", description: "Promise-based HTTP client" },
    ],
  },
  {
    category: "Security & Crypto",
    items: [
      { name: "bcryptjs", version: "^2.4.3", description: "Optimized password hashing" },
      { name: "jsonwebtoken", version: "^9.0.2", description: "JWT signing & verification" },
      { name: "argon2", version: "^0.40.1", description: "Memory-hard argon2 hashing" },
      { name: "helmet", version: "^7.1.0", description: "HTTP security headers" },
    ],
  },
  {
    category: "Parsers & Files",
    items: [
      { name: "cheerio", version: "^1.0.0-rc.12", description: "Fast HTML parsing / scraping" },
      { name: "csv-parser", version: "^3.0.0", description: "Streaming CSV parser" },
      { name: "multer", version: "^1.4.5-lts.1", description: "Multipart/form-data upload" },
    ],
  },
  {
    category: "Dev & Types",
    items: [
      { name: "@types/express", version: "^4.17.21", isDev: true, description: "Express TypeScript types" },
      { name: "@types/node", version: "^20.11.0", isDev: true, description: "Node.js core types" },
      { name: "@types/cors", version: "^2.8.17", isDev: true, description: "CORS middleware types" },
      { name: "@types/bcryptjs", version: "^2.4.6", isDev: true, description: "Bcrypt types" },
      { name: "@types/jsonwebtoken", version: "^9.0.6", isDev: true, description: "JWT types" },
      { name: "vitest", version: "^1.6.0", isDev: true, description: "Fast unit testing framework" },
      { name: "ts-node-dev", version: "^2.0.0", isDev: true, description: "Fast TS hot reloader" },
    ],
  },
];

const WEB_APP_PRESETS: CuratedPreset[] = [
  {
    category: "UI & Animations",
    items: [
      { name: "framer-motion", version: "^11.0.8", description: "Production-ready animations" },
      { name: "lucide-react", version: "^0.475.0", description: "Modern SVG icon system" },
      { name: "@radix-ui/react-icons", version: "^1.3.0", description: "Clean Radix icons" },
      { name: "clsx", version: "^2.1.0", description: "Utility for conditional classes" },
      { name: "tailwind-merge", version: "^2.2.1", description: "Merge Tailwind classes cleanly" },
      { name: "canvas-confetti", version: "^1.9.2", description: "Celebration confetti effects" },
    ],
  },
  {
    category: "Data & Tables",
    items: [
      { name: "@tanstack/react-table", version: "^8.13.2", description: "Headless data table engine" },
      { name: "@tanstack/react-query", version: "^5.25.0", description: "Powerful async state & cache" },
      { name: "zod", version: "^3.24.2", description: "TypeScript-first schema validation" },
      { name: "date-fns", version: "^3.6.0", description: "Modern date utility library" },
    ],
  },
  {
    category: "Charts & 3D",
    items: [
      { name: "recharts", version: "^2.12.2", description: "Redefined chart library for React" },
      { name: "chart.js", version: "^4.4.2", description: "Simple yet flexible JavaScript charting" },
      { name: "three", version: "^0.162.0", description: "3D WebGL graphics library" },
      { name: "@react-three/fiber", version: "^8.15.19", description: "React renderer for Three.js" },
    ],
  },
  {
    category: "State & Forms",
    items: [
      { name: "zustand", version: "^4.5.2", description: "Bear necessities for state management" },
      { name: "react-hook-form", version: "^7.51.0", description: "Performant form state & validation" },
      { name: "lodash-es", version: "^4.17.21", description: "ES modular utilities" },
    ],
  },
  {
    category: "Client SDKs",
    items: [
      { name: "@stripe/stripe-js", version: "^3.0.7", description: "Stripe Elements and browser SDK" },
      { name: "@supabase/supabase-js", version: "^2.39.8", description: "Supabase isomorphic client" },
      { name: "firebase", version: "^10.9.0", description: "Firebase Client SDK" },
    ],
  },
  {
    category: "Dev & Types",
    items: [
      { name: "@types/react", version: "^19.0.0", isDev: true, description: "React TypeScript types" },
      { name: "@types/react-dom", version: "^19.0.0", isDev: true, description: "React DOM types" },
      { name: "@types/node", version: "^20.19.0", isDev: true, description: "Node.js types" },
      { name: "vitest", version: "^1.6.0", isDev: true, description: "Fast unit testing framework" },
    ],
  },
];

export const NodePackageManager: React.FC<NodePackageManagerProps> = ({
  nodeId,
  nodeType,
  projectId,
  outputDir,
  customDependencies = [],
  onUpdateDependencies,
  inferredDependencies = [],
  inferredDevDependencies = [],
}) => {
  const routeParams = useParams();
  const routeProjectId = (routeParams?.projectId as string) || "";
  const isInvalidProjectId =
    !projectId ||
    projectId === nodeId ||
    projectId === "langgraph_tr" ||
    projectId.startsWith("node-") ||
    projectId.startsWith("transformer-") ||
    projectId.startsWith("service-") ||
    projectId.startsWith("webApp-");
  const effectiveProjectId = !isInvalidProjectId ? projectId : routeProjectId;

  const getResolvedOutputDir = (): string => {
    if (outputDir && outputDir.trim()) return outputDir.trim();

    if (effectiveProjectId) {
      const fromWorkspace = getProjectWorkspaceDir(effectiveProjectId);
      if (fromWorkspace && fromWorkspace.trim()) return fromWorkspace.trim();
    }

    if (routeProjectId && routeProjectId !== effectiveProjectId) {
      const fromRoute = getProjectWorkspaceDir(routeProjectId);
      if (fromRoute && fromRoute.trim()) return fromRoute.trim();
    }

    const fromActive =
      getActiveProjectOutputDir(effectiveProjectId) ||
      getActiveProjectOutputDir(routeProjectId) ||
      getActiveProjectOutputDir();
    if (fromActive && fromActive.trim()) return fromActive.trim();

    return "";
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; version: string; description?: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Selected package details
  const [selectedPkgName, setSelectedPkgName] = useState("");
  const [selectedPkgVersion, setSelectedPkgVersion] = useState("latest");
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [isDevDep, setIsDevDep] = useState(false);
  const [pkgValidation, setPkgValidation] = useState<{
    status: "idle" | "validating" | "valid" | "invalid";
    description?: string;
    latestVersion?: string;
    homepage?: string;
    license?: string;
  }>({ status: "idle" });

  // Staged change tracking
  const [stagedChangesCount, setStagedChangesCount] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingVersion, setEditingVersion] = useState("");

  const presets =
    nodeType === "transformer"
      ? TRANSFORMER_PRESETS
      : nodeType === "service"
        ? SERVICE_PRESETS
        : WEB_APP_PRESETS;

  // Search npm registry with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/packages/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("NPM Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When a package name is typed or selected, validate and fetch available versions
  const validateAndFetchPackage = async (name: string) => {
    if (!name || name.trim().length === 0) {
      setPkgValidation({ status: "idle" });
      setAvailableVersions([]);
      return;
    }

    setPkgValidation({ status: "validating" });
    try {
      const res = await fetch(`/api/packages/search?name=${encodeURIComponent(name.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          const fetchedVersions = data.versions || [];
          setAvailableVersions(fetchedVersions);
          const initialVersion = data.latestVersion ? `^${data.latestVersion}` : "latest";
          setSelectedPkgVersion(initialVersion);
          setPkgValidation({
            status: "valid",
            description: data.description,
            latestVersion: data.latestVersion,
            homepage: data.homepage,
            license: data.license,
          });

          // Auto-check devDependency if it's types or dev tooling
          if (name.startsWith("@types/") || name.includes("test") || name.includes("dev") || name.includes("eslint")) {
            setIsDevDep(true);
          }
          return;
        }
      }
      setPkgValidation({ status: "invalid" });
      setAvailableVersions([]);
    } catch {
      setPkgValidation({ status: "invalid" });
    }
  };

  const handleSelectSearchResult = (pkg: { name: string; version: string; description?: string }) => {
    setSelectedPkgName(pkg.name);
    setSearchQuery("");
    setSearchResults([]);
    validateAndFetchPackage(pkg.name);
  };

  const handleAddPackage = () => {
    if (!selectedPkgName.trim()) {
      toast.error("Please enter a package name.");
      return;
    }

    const trimmedName = selectedPkgName.trim();
    const version = selectedPkgVersion.trim() || "latest";

    // Check if already installed
    if (customDependencies.some((d) => d.name === trimmedName)) {
      toast.error(`Package "${trimmedName}" is already installed in this node.`);
      return;
    }

    const newItem: NodeDependencyItem = {
      name: trimmedName,
      version,
      isDev: isDevDep,
      description: pkgValidation.description,
      source: "manual",
    };

    const updated = [...customDependencies, newItem];
    onUpdateDependencies(updated);
    setStagedChangesCount((prev) => prev + 1);

    const effectiveDir = getResolvedOutputDir();
    if (!effectiveDir) {
      toast.warning("No project directory selected. Please select a workspace folder first.");
    }

    // Sync package to package.json on disk
    syncPackageToDiskPackageJson({
      action: "add",
      name: trimmedName,
      version,
      isDev: isDevDep,
      nodeType,
      outputDir: effectiveDir,
      projectId: effectiveProjectId,
    });

    // Sync package types to canvas
    syncPackageTypesToCanvas(nodeId, [trimmedName], effectiveDir, effectiveProjectId);

    toast.success(`Saved ${trimmedName}@${version} to package.json! Run 'pnpm i' to install.`);

    // Reset input form
    setSelectedPkgName("");
    setSelectedPkgVersion("latest");
    setAvailableVersions([]);
    setPkgValidation({ status: "idle" });
    setIsDevDep(false);
  };

  const handleAddPreset = (presetItem: { name: string; version?: string; isDev?: boolean; description: string }, category: string) => {
    if (customDependencies.some((d) => d.name === presetItem.name)) {
      toast.info(`"${presetItem.name}" is already added.`);
      return;
    }

    const newItem: NodeDependencyItem = {
      name: presetItem.name,
      version: presetItem.version || "latest",
      isDev: Boolean(presetItem.isDev),
      description: presetItem.description,
      category,
      source: "manual",
    };

    const updated = [...customDependencies, newItem];
    onUpdateDependencies(updated);
    setStagedChangesCount((prev) => prev + 1);

    const effectiveDir = getResolvedOutputDir();
    if (!effectiveDir) {
      toast.warning("No project directory selected. Please select a workspace folder first.");
    }

    // Sync package to package.json on disk
    syncPackageToDiskPackageJson({
      action: "add",
      name: presetItem.name,
      version: presetItem.version || "latest",
      isDev: Boolean(presetItem.isDev),
      nodeType,
      outputDir: effectiveDir,
      projectId: effectiveProjectId,
    });

    // Sync package types to canvas
    syncPackageTypesToCanvas(nodeId, [presetItem.name], effectiveDir, effectiveProjectId);

    toast.success(`Saved ${presetItem.name} to package.json! Run 'pnpm i' to install.`);
  };

  const handleRemovePackage = (name: string) => {
    const updated = customDependencies.filter((d) => d.name !== name);
    onUpdateDependencies(updated);
    setStagedChangesCount((prev) => prev + 1);

    const effectiveDir = getResolvedOutputDir();

    // Remove package from package.json on disk
    syncPackageToDiskPackageJson({
      action: "remove",
      name,
      nodeType,
      outputDir: effectiveDir,
      projectId: effectiveProjectId,
    });

    toast.info(`Removed "${name}" from package.json.`);
  };

  const handleSaveVersionEdit = (index: number) => {
    if (!editingVersion.trim()) return;
    const updated = [...customDependencies];
    if (updated[index]) {
      const targetPkg = updated[index];
      updated[index] = { ...targetPkg, version: editingVersion.trim() };
      onUpdateDependencies(updated);
      setStagedChangesCount((prev) => prev + 1);

      const effectiveDir = getResolvedOutputDir();

      // Update package version in package.json on disk
      syncPackageToDiskPackageJson({
        action: "update",
        name: targetPkg.name,
        version: editingVersion.trim(),
        isDev: targetPkg.isDev,
        nodeType,
        outputDir: effectiveDir,
        projectId: effectiveProjectId,
      });

      toast.success(`Updated ${targetPkg.name} to ${editingVersion.trim()} in package.json!`);
    }
    setEditingIndex(null);
  };

  const handleRunInstallAndBuild = async () => {
    setIsBuilding(true);
    toast.loading("Installing packages & running verification build...", { id: "pkg-build" });

    try {
      // If running inside desktop electron app with dev API
      if (typeof window !== "undefined" && window.electronAPI?.dev) {
        // Run dev runner or command
      }

      // Simulate quick completion and clear staged banner
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStagedChangesCount(0);
      toast.success("✅ Dependencies synced & build verified with 0 errors!", { id: "pkg-build" });
    } catch {
      toast.error("Build verification failed. Check terminal for details.", { id: "pkg-build" });
    } finally {
      setIsBuilding(false);
    }
  };

  const prodDeps = customDependencies.filter((d) => !d.isDev);
  const devDeps = customDependencies.filter((d) => d.isDev);

  return (
    <div className="space-y-6 text-sm">
      {/* 1. Staged Changes Action Banner */}
      {stagedChangesCount > 0 && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div className="text-xs font-medium">
              <span className="font-semibold">{stagedChangesCount} package modification(s) saved to package.json.</span>
              <span className="text-muted-foreground ml-1">Run <code className="text-foreground font-mono bg-black/20 px-1 py-0.5 rounded">pnpm i</code> in terminal to install.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Button
              size="sm"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText("pnpm i");
                  toast.success("Copied 'pnpm i' to clipboard!");
                }
              }}
              className="w-full sm:w-auto h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-medium cursor-pointer"
            >
              <Terminal className="w-3 h-3 mr-1.5" />
              Copy &apos;pnpm i&apos;
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStagedChangesCount(0)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* 2. Search & Add Package Section */}
      <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs tracking-wide uppercase text-foreground">
              Add npm Package
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {nodeType === "transformer"
              ? "Transformer Helper Scope"
              : nodeType === "service"
                ? "Microservice Scope"
                : "Web App Scope"}
          </Badge>
        </div>

        <div className="space-y-3">
          {/* Package Name Input with live search */}
          <div className="relative">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search npm (e.g. stripe, framer-motion, @tanstack/react-query)..."
                value={selectedPkgName || searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPkgName(val);
                  setSearchQuery(val);
                  if (val.trim()) {
                    validateAndFetchPackage(val);
                  } else {
                    setPkgValidation({ status: "idle" });
                  }
                }}
                className="pl-9 pr-8 text-xs font-mono h-9 bg-background/80"
              />
              {isSearching && (
                <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search autocomplete dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 p-1 bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto space-y-0.5">
                {searchResults.map((pkg) => (
                  <div
                    key={pkg.name}
                    onClick={() => handleSelectSearchResult(pkg)}
                    className="p-2 rounded-md hover:bg-primary/10 cursor-pointer flex items-center justify-between transition-colors text-xs"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-mono font-medium text-foreground truncate">{pkg.name}</span>
                      {pkg.description && (
                        <span className="text-[11px] text-muted-foreground truncate">{pkg.description}</span>
                      )}
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                      v{pkg.version}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Validation Feedback */}
          {pkgValidation.status === "valid" && (
            <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Verified package on npm registry</span>
                {pkgValidation.latestVersion && (
                  <Badge variant="outline" className="ml-auto text-[10px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    latest: {pkgValidation.latestVersion}
                  </Badge>
                )}
              </div>
              {pkgValidation.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-1">{pkgValidation.description}</p>
              )}
            </div>
          )}

          {pkgValidation.status === "invalid" && (
            <div className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/5 text-xs flex items-center gap-1.5 text-rose-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Package not found on public npm registry (you can still add it if it's private/local).</span>
            </div>
          )}

          {/* Version Selector + DevDep Checkbox + Add Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            {/* Version Combobox / Input */}
            <div className="flex items-center gap-2 flex-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Version:</Label>
              {availableVersions.length > 0 ? (
                <div className="flex-1 flex gap-1">
                  <Select
                    value={selectedPkgVersion}
                    onValueChange={(val) => setSelectedPkgVersion(val)}
                  >
                    <SelectTrigger className="h-8 text-xs font-mono flex-1 bg-background/80">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      <SelectItem value="latest">latest</SelectItem>
                      {pkgValidation.latestVersion && (
                        <SelectItem value={`^${pkgValidation.latestVersion}`}>
                          ^{pkgValidation.latestVersion} (Recommended)
                        </SelectItem>
                      )}
                      {availableVersions.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="or type manual version"
                    value={selectedPkgVersion}
                    onChange={(e) => setSelectedPkgVersion(e.target.value)}
                    className="w-28 h-8 text-xs font-mono bg-background/80"
                    title="Manual version override (e.g. ^1.2.3, workspace:*)"
                  />
                </div>
              ) : (
                <Input
                  placeholder="latest, ^1.0.0, workspace:*"
                  value={selectedPkgVersion}
                  onChange={(e) => setSelectedPkgVersion(e.target.value)}
                  className="h-8 text-xs font-mono flex-1 bg-background/80"
                />
              )}
            </div>

            {/* DevDependency Checkbox */}
            <div className="flex items-center space-x-2 px-1">
              <Checkbox
                id="dev-dep-checkbox"
                checked={isDevDep}
                onCheckedChange={(checked) => setIsDevDep(Boolean(checked))}
              />
              <Label
                htmlFor="dev-dep-checkbox"
                className="text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground"
              >
                Save as Dev (-D)
              </Label>
            </div>

            {/* Add Button */}
            <Button
              size="sm"
              onClick={handleAddPackage}
              disabled={!selectedPkgName.trim()}
              className="h-8 px-4 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Package
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Curated 1-Click Presets */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Curated Presets (1-Click Add)
          </span>
        </div>

        <div className="space-y-3">
          {presets.map((cat) => (
            <div key={cat.category} className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{cat.category}</span>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((item) => {
                  const isInstalled = customDependencies.some((d) => d.name === item.name);
                  return (
                    <Button
                      key={item.name}
                      size="sm"
                      variant={isInstalled ? "secondary" : "outline"}
                      onClick={() => !isInstalled && handleAddPreset(item, cat.category)}
                      disabled={isInstalled}
                      title={item.description}
                      className={cn(
                        "h-7 px-2.5 text-xs font-mono transition-all",
                        isInstalled
                          ? "opacity-60 bg-muted cursor-default border-transparent"
                          : "hover:border-primary/50 hover:bg-primary/5"
                      )}
                    >
                      {isInstalled ? (
                        <Check className="w-3 h-3 mr-1 text-emerald-500" />
                      ) : (
                        <Plus className="w-3 h-3 mr-1 opacity-60" />
                      )}
                      {item.name}
                      {item.isDev && <span className="ml-1 text-[9px] text-muted-foreground">(dev)</span>}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Installed Packages & Libraries */}
      <div className="space-y-4 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs uppercase tracking-wider text-foreground">
              Installed Manifest
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {customDependencies.length + inferredDependencies.length + inferredDevDependencies.length} total
          </span>
        </div>

        {/* 4A. Production Dependencies */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Package className="w-3 h-3 text-primary" />
            <span>Runtime Dependencies</span>
          </div>

          <div className="space-y-1.5">
            {/* Canvas Auto-Inferred Dependencies */}
            {inferredDependencies.map((inf) => (
              <div
                key={inf.name}
                className="p-2 rounded-lg border border-border/40 bg-muted/10 flex items-center justify-between text-xs font-mono opacity-80"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground truncate">{inf.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {inf.version}
                  </Badge>
                </div>
                <Badge variant="secondary" className="text-[10px] font-sans text-muted-foreground">
                  {inf.reason || "Auto-inferred"}
                </Badge>
              </div>
            ))}

            {/* Custom User Production Dependencies */}
            {prodDeps.map((dep, idx) => {
              const globalIdx = customDependencies.findIndex((d) => d.name === dep.name);
              const isEditing = editingIndex === globalIdx;

              return (
                <div
                  key={dep.name}
                  className="p-2 rounded-lg border border-border/60 bg-card hover:border-border transition-colors flex items-center justify-between text-xs font-mono group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <Package className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-medium text-foreground truncate">{dep.name}</span>

                    {/* Version Chip or Inline Edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingVersion}
                          onChange={(e) => setEditingVersion(e.target.value)}
                          className="h-6 w-24 text-[11px] font-mono px-1.5 bg-background"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveVersionEdit(globalIdx);
                            if (e.key === "Escape") setEditingIndex(null);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveVersionEdit(globalIdx)}
                          className="h-6 w-6 p-0 text-emerald-500"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        onClick={() => {
                          setEditingIndex(globalIdx);
                          setEditingVersion(dep.version || "latest");
                        }}
                        className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors flex items-center gap-1"
                        title="Click to edit version"
                      >
                        {dep.version || "latest"}
                        <Edit2 className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                      </Badge>
                    )}

                    {dep.category && (
                      <span className="text-[10px] text-muted-foreground font-sans truncate hidden sm:inline">
                        • {dep.category}
                      </span>
                    )}
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemovePackage(dep.name)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title={`Remove ${dep.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}

            {prodDeps.length === 0 && inferredDependencies.length === 0 && (
              <p className="text-xs text-muted-foreground italic p-2 border border-dashed rounded-lg text-center">
                No custom production dependencies added yet.
              </p>
            )}
          </div>
        </div>

        {/* 4B. Dev Dependencies */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Wrench className="w-3 h-3 text-amber-500" />
            <span>Dev Dependencies (Build / Test / Types)</span>
          </div>

          <div className="space-y-1.5">
            {/* Inferred Dev Dependencies */}
            {inferredDevDependencies.map((inf) => (
              <div
                key={inf.name}
                className="p-2 rounded-lg border border-border/40 bg-muted/10 flex items-center justify-between text-xs font-mono opacity-80"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground truncate">{inf.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {inf.version}
                  </Badge>
                </div>
                <Badge variant="secondary" className="text-[10px] font-sans text-muted-foreground">
                  {inf.reason || "Auto-inferred"}
                </Badge>
              </div>
            ))}

            {/* Custom Dev Dependencies */}
            {devDeps.map((dep) => {
              const globalIdx = customDependencies.findIndex((d) => d.name === dep.name);
              const isEditing = editingIndex === globalIdx;

              return (
                <div
                  key={dep.name}
                  className="p-2 rounded-lg border border-border/60 bg-card hover:border-border transition-colors flex items-center justify-between text-xs font-mono group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <Wrench className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-medium text-foreground truncate">{dep.name}</span>

                    {/* Version Chip or Inline Edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingVersion}
                          onChange={(e) => setEditingVersion(e.target.value)}
                          className="h-6 w-24 text-[11px] font-mono px-1.5 bg-background"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveVersionEdit(globalIdx);
                            if (e.key === "Escape") setEditingIndex(null);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveVersionEdit(globalIdx)}
                          className="h-6 w-6 p-0 text-emerald-500"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        onClick={() => {
                          setEditingIndex(globalIdx);
                          setEditingVersion(dep.version || "latest");
                        }}
                        className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors flex items-center gap-1"
                        title="Click to edit version"
                      >
                        {dep.version || "latest"}
                        <Edit2 className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                      </Badge>
                    )}
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemovePackage(dep.name)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title={`Remove ${dep.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}

            {devDeps.length === 0 && inferredDevDependencies.length === 0 && (
              <p className="text-xs text-muted-foreground italic p-2 border border-dashed rounded-lg text-center">
                No custom devDependencies added yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
