"use client";
import { api } from "@workspace/backend/_generated/api";
import { usePaginatedQuery } from "convex/react";
import React from "react";
import { useActiveOrganization } from "@/lib/auth-client";
import { ProjectCard } from "@/app/(protected)/projects/_components/project-card";
import { Spinner } from "@workspace/ui/components/spinner";
import { Sparkles } from "lucide-react";

export const ProjectsGrid = () => {
  const { data: activeOrg } = useActiveOrganization();
  const organizationId = activeOrg?.id ?? null;

  const {
    results: projects,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.projects.getProjectsByOrganization,
    { organizationId },
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

  return (
    <div className="flex flex-col w-full pb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-8 w-full">
        {projects?.map((project) => (
          <ProjectCard key={project._id} project={project} />
        ))}
      </div>

      {/* Loading First Page Spinner */}
      {status === "LoadingFirstPage" && (
        <div className="flex h-[300px] w-full items-center justify-center">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      )}

      {/* Sentinel for Infinite Scroll */}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div
          ref={sentinelRef}
          className="flex justify-center mt-4 min-h-[40px]"
        >
          {status === "LoadingMore" && <Spinner className="h-6 w-6" />}
        </div>
      )}

      {projects.length === 0 && status === "Exhausted" && (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 text-center animate-in fade-in zoom-in duration-300 mx-auto w-[95%]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-lg bg-background shadow-sm">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="mt-6 text-2xl font-bold">No projects found!</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            There are currently no projects in{" "}
            <span className="font-semibold text-foreground">
              {activeOrg?.name || "Personal Workspace"}
            </span>
            . Create one to get started!
          </p>
        </div>
      )}
    </div>
  );
};
