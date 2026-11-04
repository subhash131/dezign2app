"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@workspace/ui/components/button";
import { Package, AlertTriangle, RefreshCw, Check, Copy, Lock, ArrowUpRight } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  createExtendedTypeNode,
  refreshPackageTypesFromNodeModules,
} from "@/lib/stores/backendCanvas/packageTypesSync";
import { getProjectWorkspaceDir } from "../../terminal/hooks/projectWorkspaceUtils";
import { getActiveProjectOutputDir } from "@/lib/utils/localEnvSync";
import type { PackageTypesBannerProps } from "./types";
import type { CustomTypeItem } from "@workspace/canvas/types";

export const PackageNodeTopBanner: React.FC<PackageTypesBannerProps> = ({
  nodeId,
  packageName,
  packageVersion,
  isInstalled,
  installError,
}) => {
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const installCmd = "pnpm i";
  const routeParams = useParams();
  const routeProjectId = (routeParams?.projectId as string) || "";

  const handleCopyInstall = () => {
    navigator.clipboard.writeText("pnpm i");
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleRefresh = async () => {
    if (!packageName) return;
    setIsRefreshing(true);
    try {
      const outputDir =
        (routeProjectId ? getProjectWorkspaceDir(routeProjectId) : "") ||
        getActiveProjectOutputDir(routeProjectId);
      await refreshPackageTypesFromNodeModules(nodeId, packageName, outputDir, routeProjectId);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 p-3.5 rounded-xl border",
        !isInstalled
          ? "border-red-500/50 bg-red-500/10 text-red-900 dark:text-red-200"
          : "border-border/60 bg-secondary/30 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={16} className={cn(!isInstalled ? "text-red-500" : "text-primary")} />
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
            <span>{packageName || "Package Contract"}</span>
            {packageVersion && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-normal text-muted-foreground">
                v{packageVersion}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
            !isInstalled
              ? "bg-red-500 text-white"
              : "bg-primary/20 text-primary border border-primary/30",
          )}
        >
          {!isInstalled ? "NOT INSTALLED" : "PACKAGE TYPES"}
        </span>
      </div>

      {!isInstalled ? (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              {installError || "Saved to package.json. Run 'pnpm i' in your terminal to install:"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-black/60 dark:bg-black/90 font-mono text-[11px] text-emerald-400 border border-red-500/30">
            <code className="select-all">{installCmd}</code>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-white shrink-0 cursor-pointer"
              onClick={handleCopyInstall}
              title="Copy command"
            >
              {copiedInstall ? (
                <Check size={13} className="text-emerald-400" />
              ) : (
                <Copy size={13} />
              )}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/20 cursor-pointer mt-1"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
            <span>{isRefreshing ? "Checking..." : "Check Again / Sync"}</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 mt-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
            Inferred from <code>node_modules/{packageName}</code>. Use <strong>Extend Type</strong> to create an editable custom model.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] gap-1 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={11} className={cn(isRefreshing && "animate-spin")} />
            <span>{isRefreshing ? "Syncing..." : "Re-sync"}</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export const ReadOnlyPackageContractBanner: React.FC<{
  nodeId: string;
  currentType: CustomTypeItem;
}> = ({ nodeId, currentType }) => {
  if (!currentType.isReadOnly) return null;

  return (
    <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide">
            Package Contract: {currentType.packageSource || "external"}
          </span>
        </div>
        {currentType.isExtendable !== false && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-xs font-semibold cursor-pointer"
            onClick={() => createExtendedTypeNode(nodeId, currentType.id)}
          >
            <ArrowUpRight size={13} />
            Extend Type
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        This data contract is read-only because it represents an external package model. Click <strong>Extend Type</strong> to create an editable custom model with inheritance on your canvas.
      </p>
    </div>
  );
};
