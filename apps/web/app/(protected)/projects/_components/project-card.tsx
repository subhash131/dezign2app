"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Pencil, Trash, Copy, ExternalLink, FolderOpen, Globe } from "lucide-react";
import { Doc } from "@workspace/backend/_generated/dataModel";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuSeparator,
} from "@workspace/ui/components/action-menu";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { ProjectDialog } from "./project-dialog";
import { PublishProjectDialog } from "@/components/project/PublishProjectDialog";

import { deleteProjectWorkspaceDir } from "@/app/(canvas)/project/[projectId]/_components/terminal/hooks/projectWorkspaceUtils";

dayjs.extend(relativeTime);

interface ProjectCardProps {
  project: Doc<"projects">;
  className?: string;
}

export const ProjectCard = ({ project, className }: ProjectCardProps) => {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  const removeProject = useMutation(api.projects.removeProject);
  const duplicateProject = useMutation(api.projects.duplicateProject);

  const route = `/project/${project._id}`;

  const handleDelete = async () => {
    try {
      await removeProject({
        projectId: project._id,
      });
      // Delete the workspace folder link for this project (preserves files on disk)
      deleteProjectWorkspaceDir(project._id);
      setIsDeleteOpen(false);
      toast.success("Project deleted");
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateProject({
        projectId: project._id,
      });
      toast.success("Project duplicated");
    } catch (error) {
      toast.error("Failed to duplicate project");
    }
  };

  const menuItems: (ActionMenuItem | ActionMenuSeparator)[] = [
    {
      label: "Open",
      icon: <ExternalLink size={14} />,
      onClick: () => router.push(route),
    },
    {
      label: "Edit",
      icon: <Pencil size={14} />,
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        setIsEditOpen(true);
      },
    },
    {
      label: "Duplicate",
      icon: <Copy size={14} />,
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        handleDuplicate();
      },
    },
    {
      label: project.isPublished ? "Publishing Settings" : "Publish to Community",
      icon: <Globe size={14} />,
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        setIsPublishOpen(true);
      },
    },
    { isSeparator: true },
    {
      label: "Delete",
      icon: <Trash size={14} />,
      variant: "destructive",
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        setIsDeleteOpen(true);
      },
    },
  ];

  const updatedAtText =
    dayjs(project.updatedAt).fromNow() === "a few seconds ago"
      ? "Just now"
      : dayjs(project.updatedAt).fromNow();

  return (
    <>
      <ActionMenu items={menuItems} contentClassName="w-48">
        <Link href={route}>
          <Card
            className={cn(
              "gap-0 relative w-full pt-0 hover:shadow-lg transition-all border p-0 border-border/50 group bg-secondary/10 overflow-hidden",
              className,
            )}
          >
            <div className="absolute inset-0 z-30 aspect-video bg-black/20 group-hover:bg-black/10 transition-colors rounded-t-lg flex items-center justify-center">
              <FolderOpen
                className="text-white/20 group-hover:scale-110 transition-transform"
                size={48}
              />
            </div>
            <img
              src={`https://avatar.vercel.sh/${project._id}`}
              alt={project.name}
              className="relative z-20 aspect-video w-full object-cover brightness-60 grayscale transition-all rounded-t-lg"
            />
            <CardHeader className="p-4 bg-background/50 backdrop-blur-sm gap-0 rounded-none">
              <CardAction className="flex items-center gap-1.5">
                {project.isPublished && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 px-1.5 py-0 font-normal"
                  >
                    <Globe size={10} /> Published
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs font-normal">
                  {updatedAtText}
                </Badge>
              </CardAction>
              <CardTitle className="text-sm font-medium truncate">
                {project.name}
              </CardTitle>
              {project.description && (
                <CardDescription className="text-xs truncate">
                  {project.description}
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        </Link>
      </ActionMenu>

      <ProjectDialog
        project={project}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />

      <PublishProjectDialog
        projectId={project._id}
        projectName={project.name}
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        initialData={{
          description: project.description,
          category: project.category,
          tags: project.tags,
          isPublished: project.isPublished,
        }}
      />

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolute sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              project and all documents and templates inside it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
