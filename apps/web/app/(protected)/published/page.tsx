"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import {
  Search,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  Sparkles,
  Globe,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
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
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuSeparator,
} from "@workspace/ui/components/action-menu";
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
    { initialNumItems: 16 },
  );

  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (status !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          loadMore(8);
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
    <div className="w-full bg-background hide-scrollbar flex flex-col relative h-full overflow-y-auto">
      {/* Header - aligned with /projects px-10 py-4 */}
      <div className="w-full sticky top-0 bg-background/80 backdrop-blur-md px-10 py-4 z-50 border-b flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Published Projects</h1>
          </div>

          {/* Search Bar */}
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search published projects..."
              className="pl-8 text-xs h-9 bg-muted/40"
            />
          </div>
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
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

      {/* Grid Content - matching projects-grid.tsx exactly with w-full p-8 */}
      <div className="flex flex-col w-full pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-8 w-full">
          {projects?.map((proj) => {
            const isCloningThis = cloningProjectId === proj._id;
            const initials = (proj.creatorName || "A")
              .slice(0, 2)
              .toUpperCase();

            const updatedAtText =
              dayjs(proj.publishedAt || proj.updatedAt).fromNow() === "a few seconds ago"
                ? "Just now"
                : dayjs(proj.publishedAt || proj.updatedAt).fromNow();

            const previewRoute = `/preview/${proj._id}`;

            const menuItems: (ActionMenuItem | ActionMenuSeparator)[] = [
              {
                label: "Preview",
                icon: <ExternalLink size={14} />,
                onClick: () => router.push(previewRoute),
              },
              {
                label: "Clone to Workspace",
                icon: <Copy size={14} />,
                onClick: () => void handleClone(proj._id, proj.name),
              },
              { isSeparator: true },
              {
                label: "Copy Preview Link",
                icon: <Globe size={14} />,
                onClick: () => {
                  if (typeof window !== "undefined") {
                    void navigator.clipboard.writeText(`${window.location.origin}${previewRoute}`);
                    toast.success("Preview link copied");
                  }
                },
              },
            ];

            return (
              <ActionMenu key={proj._id} items={menuItems} contentClassName="w-48">
                <Link href={previewRoute}>
                  <Card
                    className="gap-0 relative w-full pt-0 hover:shadow-lg transition-all border p-0 border-border/50 group bg-secondary/10 overflow-hidden cursor-pointer"
                  >
                    {/* Visual Cover identical to ProjectCard */}
                    <div className="absolute inset-0 z-30 aspect-video bg-black/20 group-hover:bg-black/10 transition-colors rounded-t-lg flex items-center justify-center">
                      <FolderOpen
                        className="text-white/20 group-hover:scale-110 transition-transform"
                        size={48}
                      />
                    </div>
                    <img
                      src={`https://avatar.vercel.sh/${proj._id}`}
                      alt={proj.name}
                      className="relative z-20 aspect-video w-full object-cover brightness-60 grayscale transition-all rounded-t-lg"
                    />

                    {/* Header with CardAction slot */}
                    <CardHeader className="p-4 bg-background/50 backdrop-blur-sm gap-0 rounded-none">
                      <CardAction className="flex items-center gap-1.5">
                        {proj.category && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {proj.category}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                          {updatedAtText}
                        </Badge>
                      </CardAction>
                      <CardTitle className="text-sm font-medium truncate">
                        {proj.name}
                      </CardTitle>
                      {proj.description && (
                        <CardDescription className="text-xs truncate">
                          {proj.description}
                        </CardDescription>
                      )}
                    </CardHeader>

                    {/* Minimal clean footer */}
                    <CardFooter className="px-4 py-2.5 bg-background/30 border-t border-border/40 flex items-center justify-between gap-2 rounded-b-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="w-5 h-5 border border-border/50">
                          {proj.creatorAvatar && (
                            <AvatarImage
                              src={proj.creatorAvatar}
                              alt={proj.creatorName}
                            />
                          )}
                          <AvatarFallback className="text-[9px] bg-muted text-muted-foreground font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground truncate">
                          {proj.creatorName || "Anonymous"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {proj.cloneCount ? (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {proj.cloneCount} {proj.cloneCount === 1 ? "clone" : "clones"}
                          </span>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1.5"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleClone(proj._id, proj.name);
                          }}
                          disabled={isCloningThis}
                        >
                          {isCloningThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Clone</span>
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              </ActionMenu>
            );
          })}
        </div>

        {/* Loading First Page Spinner */}
        {status === "LoadingFirstPage" && (
          <div className="flex h-[300px] w-full items-center justify-center">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        )}

        {/* Sentinel for Infinite Scroll */}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div ref={sentinelRef} className="flex justify-center mt-4 min-h-[40px]">
            {status === "LoadingMore" && <Spinner className="h-6 w-6" />}
          </div>
        )}

        {/* Empty State */}
        {projects?.length === 0 && status === "Exhausted" && (
          <div className="flex h-[400px] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 text-center animate-in fade-in zoom-in duration-300 mx-auto w-[95%]">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-lg bg-background shadow-sm">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mt-6 text-2xl font-bold">No published projects found</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              {searchQuery || selectedCategory !== "All"
                ? "No published projects match your current filters. Try clearing the search or category."
                : "No projects have been published to the community yet. Publish one from your canvas toolbar to share it!"}
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
        )}
      </div>
    </div>
  );
}
