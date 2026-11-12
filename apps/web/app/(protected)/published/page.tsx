"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import {
  Globe,
  Search,
  Copy,
  ExternalLink,
  Layers,
  Network,
  FolderOpen,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const CATEGORIES = [
  "All",
  "Fullstack",
  "AI Agent / LangGraph",
  "API Backend",
  "Microservices",
  "Event-Driven",
  "E-Commerce",
  "SaaS Starter",
];

export default function PublishedProjectsPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [cloningProjectId, setCloningProjectId] = useState<string | null>(null);

  const cloneMutation = useMutation(api.projects.cloneProject);

  const {
    results: projects,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.projects.getPublishedProjects,
    {
      category: selectedCategory === "All" ? undefined : selectedCategory,
      search: searchQuery.trim() || undefined,
    },
    { initialNumItems: 12 },
  );

  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (status !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          loadMore(6);
        }
      },
      { threshold: 0.5 },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [status, loadMore]);

  const handleClone = async (projectId: Id<"projects">, projectName: string) => {
    try {
      setCloningProjectId(projectId);
      const newProjectId = await cloneMutation({
        projectId,
      });
      toast.success(`Cloned "${projectName}" into your workspace!`);
      router.push(`/project/${newProjectId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clone project";
      toast.error(msg);
    } finally {
      setCloningProjectId(null);
    }
  };

  return (
    <div className="w-full bg-background flex flex-col relative h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background/90 backdrop-blur-md px-8 py-5 z-40 border-b flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Globe className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Published Projects</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Explore open system architectures, microservices, and AI workflows published by the community. Clone any project to customize it for your needs.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects or tags..."
              className="pl-8 text-xs h-9 bg-muted/40"
            />
          </div>
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1 text-xs rounded-full font-medium transition-all whitespace-nowrap",
                  isSelected
                    ? "bg-foreground text-background shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Content */}
      <div className="p-8 w-full max-w-7xl mx-auto flex-1">
        {status === "LoadingFirstPage" ? (
          <div className="flex h-[320px] w-full items-center justify-center">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted/50 border border-border/80 text-muted-foreground mb-4">
              <Globe className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-lg font-semibold">No published projects found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1.5">
              {searchQuery || selectedCategory !== "All"
                ? "No published projects match your current search or category filter. Try clearing the filters."
                : "No projects have been published to the community yet. Be the first to publish one from your canvas toolbar!"}
            </p>
            {(searchQuery || selectedCategory !== "All") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => {
                  setSelectedCategory("All");
                  setSearchQuery("");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj) => {
              const isCloningThis = cloningProjectId === proj._id;
              const initials = (proj.creatorName || "A")
                .slice(0, 2)
                .toUpperCase();

              return (
                <Card
                  key={proj._id}
                  className="flex flex-col overflow-hidden border border-border/60 hover:border-border transition-all duration-200 group bg-card/60 backdrop-blur-xs"
                >
                  {/* Card Cover */}
                  <Link
                    href={`/preview/${proj._id}`}
                    className="relative aspect-video w-full bg-muted/40 overflow-hidden block"
                  >
                    <div className="absolute inset-0 z-10 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <FolderOpen className="text-white/30 group-hover:scale-105 transition-transform w-12 h-12" />
                    </div>
                    <img
                      src={`https://avatar.vercel.sh/${proj._id}`}
                      alt={proj.name}
                      className="w-full h-full object-cover brightness-60 grayscale group-hover:scale-102 transition-transform duration-300"
                    />

                    {/* Category pill on top of image */}
                    {proj.category && (
                      <div className="absolute top-3 left-3 z-20">
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-medium bg-background/80 backdrop-blur-md border border-border/50 shadow-xs"
                        >
                          {proj.category}
                        </Badge>
                      </div>
                    )}

                    {/* Clone Count badge */}
                    <div className="absolute top-3 right-3 z-20">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono bg-background/80 backdrop-blur-md border border-border/50 gap-1"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>{proj.cloneCount ?? 0}</span>
                      </Badge>
                    </div>
                  </Link>

                  {/* Header / Meta */}
                  <CardHeader className="p-4 pb-2 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/preview/${proj._id}`}
                        className="hover:underline"
                      >
                        <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                          {proj.name}
                        </CardTitle>
                      </Link>
                    </div>

                    <CardDescription className="text-xs line-clamp-2 leading-relaxed min-h-[32px]">
                      {proj.description ||
                        "A visual architecture ready to be explored and cloned."}
                    </CardDescription>

                    {/* Tags */}
                    {proj.tags && proj.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-1">
                        {proj.tags.slice(0, 3).map((tag: string) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                        {proj.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{proj.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </CardHeader>

                  {/* Stats Bar */}
                  <div className="px-4 py-2 border-t border-b border-border/40 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Network className="w-3 h-3 text-primary" />
                        <span>{proj.nodesCount} Nodes</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-emerald-500" />
                        <span>{proj.endpointsCount} Endpoints</span>
                      </span>
                    </div>

                    {proj.publishedAt && (
                      <span className="text-[10px]">
                        {dayjs(proj.publishedAt).fromNow()}
                      </span>
                    )}
                  </div>

                  {/* Footer with Creator info & Clone button */}
                  <CardFooter className="p-4 pt-3 flex items-center justify-between gap-3 bg-card">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="w-6 h-6 border">
                        {proj.creatorAvatar && (
                          <AvatarImage
                            src={proj.creatorAvatar}
                            alt={proj.creatorName}
                          />
                        )}
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate font-medium max-w-[100px]">
                        {proj.creatorName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Link href={`/preview/${proj._id}`} title="Inspect Canvas">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </Button>

                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-xs"
                        onClick={() => void handleClone(proj._id, proj.name)}
                        disabled={isCloningThis}
                      >
                        {isCloningThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Clone</span>
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Sentinel for Infinite Scroll */}
        <div ref={sentinelRef} className="h-6 w-full" />
      </div>
    </div>
  );
}

