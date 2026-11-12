"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useSession } from "@/lib/auth-client";
import { BackendCanvasView } from "@/types/canvas";
import { BackendCanvas } from "@/app/(canvas)/project/[projectId]/_components/BackendCanvas";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Network,
  Database,
  Globe,
  Copy,
  Share2,
  Check,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function PublicProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = React.use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: isSessionLoading } = useSession();

  const [view, setView] = useState<BackendCanvasView>("graph");
  const [copied, setCopied] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  // Require authentication to view /preview/[projectId]
  useEffect(() => {
    if (!isSessionLoading && !session?.user) {
      const returnUrl = `/preview/${projectId}`;
      router.replace(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);
    }
  }, [session, isSessionLoading, projectId, router]);

  const project = useQuery(
    api.projects.getProjectById,
    session?.user
      ? {
          projectId: projectId as Id<"projects">,
        }
      : "skip",
  );

  const cloneMutation = useMutation(api.projects.cloneProject);

  // If user signed in with ?action=clone, auto-trigger clone
  useEffect(() => {
    if (session?.user && searchParams.get("action") === "clone" && project) {
      void handleClone();
    }
  }, [session, searchParams, project]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Preview link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleClone = async () => {
    if (!session?.user) {
      // Redirect to sign in with return URL and clone action
      const returnUrl = `/preview/${projectId}?action=clone`;
      router.push(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);
      return;
    }

    try {
      setIsCloning(true);
      const newProjectId = await cloneMutation({
        projectId: projectId as Id<"projects">,
      });
      toast.success(`Cloned "${project?.name || "App"}" into your workspace!`);
      router.push(`/project/${newProjectId}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to clone project";
      toast.error(msg);
    } finally {
      setIsCloning(false);
    }
  };

  if (isSessionLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-mono">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground p-6 text-center">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold">Authentication Required</h2>
        <p className="text-xs text-muted-foreground max-w-md">
          You must be signed in to view this preview.
        </p>
        <Button asChild size="sm" className="mt-2 text-xs">
          <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/preview/${projectId}`)}`}>
            Sign In to Continue
          </Link>
        </Button>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-mono">Loading architecture preview...</p>
        </div>
      </div>
    );
  }

  if (project === null || (!project.isPublished && !project.isOwner)) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground p-6 text-center">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold">Project is Private or Not Found</h2>
        <p className="text-xs text-muted-foreground max-w-md">
          This project has not been published to the community or is restricted to its owner.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-2 text-xs">
          <Link href="/published" className="flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Browse Published Projects</span>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground flex flex-col select-none">
      {/* ========================================================================= */}
      {/* TOP SHOWCASE NAVBAR                                                      */}
      {/* ========================================================================= */}
      <header className="h-14 border-b bg-background/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Branding, Navigation & Project Metadata */}
        <div className="flex items-center space-x-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
            <Link
              href="/published"
              title="Back to Published Projects"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-xs px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/60">
              d2a
            </span>

            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-sm truncate max-w-[220px]">
                {project.name}
              </span>

              {project.category && (
                <Badge
                  variant="secondary"
                  className="text-[10px] py-0 px-2 font-normal hidden sm:inline-flex"
                >
                  {project.category}
                </Badge>
              )}

              <Badge
                variant="outline"
                className="text-[10px] gap-1 hidden md:inline-flex py-0 px-1.5"
              >
                <Globe className="w-2.5 h-2.5" /> Published
              </Badge>
            </div>
          </div>
        </div>

        {/* Center: Graph / Schema View Switcher */}
        <div className="flex items-center justify-center">
          <div className="bg-muted text-muted-foreground inline-flex h-8 items-center justify-center rounded-lg p-0.5 border border-border/50">
            <button
              type="button"
              onClick={() => setView("graph")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all",
                view === "graph"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Network className="w-3 h-3 mr-1.5" />
              Graph
            </button>
            <button
              type="button"
              onClick={() => setView("schema")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all",
                view === "schema"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Database className="w-3 h-3 mr-1.5" />
              Schema
            </button>
          </div>
        </div>

        {/* Right: Actions (Share, Owner Edit Link, and Clone CTA) */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Share Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-primary" />
                    <span className="hidden sm:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Share</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Copy public preview link
            </TooltipContent>
          </Tooltip>

          {/* Clones counter */}
          <Badge
            variant="secondary"
            className="text-xs h-8 gap-1.5 font-mono px-2.5 hidden sm:inline-flex"
            title="Number of times this project was cloned"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
            <span>{project.cloneCount ?? 0}</span>
          </Badge>

          {/* If Owner: shortcut to edit */}
          {project.isOwner && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-primary/30"
            >
              <Link href={`/project/${projectId}`}>
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Open in Workspace</span>
              </Link>
            </Button>
          )}

          {/* Prominent Clone Button */}
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold px-3.5"
            onClick={() => void handleClone()}
            disabled={isCloning}
          >
            {isCloning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{session?.user ? "Clone to Workspace" : "Clone App"}</span>
          </Button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* SUB-BANNER: Showcase description & metadata                               */}
      {/* ========================================================================= */}
      {project.description && (
        <div className="bg-muted/30 border-b px-4 py-2 flex items-center justify-between text-xs text-muted-foreground z-20">
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{project.description}</span>
          </div>

          {project.tags && project.tags.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 shrink-0 ml-4">
              {project.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* INTERACTIVE READ-ONLY VISUAL CANVAS                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 w-full h-full relative overflow-hidden">
        <ReactFlowProvider>
          <BackendCanvas
            projectId={projectId}
            projectName={project.name}
            view={view}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

