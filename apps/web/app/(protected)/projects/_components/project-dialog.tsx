"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { toast } from "sonner";
import { Doc } from "@workspace/backend/_generated/dataModel";
import { useActiveOrganization } from "@/lib/auth-client";

interface ProjectDialogProps {
  project?: Doc<"projects">;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProjectDialog({
  project,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: ProjectDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const { data: activeOrg } = useActiveOrganization();

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const isEditing = !!project;
  const createProject = useMutation(api.projects.createProject);
  const updateProject = useMutation(api.projects.updateProject);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Invalid Name");
      return;
    }

    setIsLoading(true);
    try {
      if (isEditing) {
        await updateProject({
          projectId: project._id,
          name: name.trim(),
          description: description.trim(),
        });
        toast.success("Project updated");
      } else {
        await createProject({
          name: name.trim(),
          description: description.trim(),
          organizationId: activeOrg?.id ?? undefined,
        });
        toast.success("Project created");
      }
      setOpen(false);
      if (!isEditing) {
        setName("");
        setDescription("");
      }
    } catch (error) {
      toast.error(
        isEditing ? "Failed to update project" : "Failed to create project",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="sm:max-w-[425px]"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Project" : "Create New Project"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update your project's name and description."
                : `This action will create a new project in ${activeOrg?.name ? `"${activeOrg.name}"` : "your Personal Workspace"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-3">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="AI Dog"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe your project"
                onChange={(e) => setDescription(e.target.value)}
                value={description}
                className="min-h-[100px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
