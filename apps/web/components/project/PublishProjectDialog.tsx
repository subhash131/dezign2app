"use client";

import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Badge } from "@workspace/ui/components/badge";
import { Globe, Copy, Check, Loader2, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export interface PublishProjectDialogProps {
  projectId: Id<"projects">;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    description?: string;
    category?: string;
    tags?: string[];
    isPublished?: boolean;
  };
}

const CATEGORIES = [
  "Fullstack",
  "AI Agent / LangGraph",
  "API Backend",
  "Microservices",
  "Event-Driven",
  "E-Commerce",
  "SaaS Starter",
  "General Architecture",
];

const SUGGESTED_TAGS = [
  "Next.js",
  "PostgreSQL",
  "LangGraph",
  "Redis",
  "FastAPI",
  "Kafka",
  "Auth0",
  "Docker",
  "TypeScript",
];

export function PublishProjectDialog({
  projectId,
  projectName,
  isOpen,
  onClose,
  initialData,
}: PublishProjectDialogProps) {
  const [isPublished, setIsPublished] = useState(
    initialData?.isPublished ?? false,
  );
  const [category, setCategory] = useState(
    initialData?.category || "Fullstack",
  );
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags ? initialData.tags.join(", ") : "",
  );
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const publishMutation = useMutation(api.projects.publishProject);

  useEffect(() => {
    if (initialData) {
      setIsPublished(initialData.isPublished ?? false);
      setCategory(initialData.category || "Fullstack");
      setDescription(initialData.description || "");
      setTagsInput(initialData.tags ? initialData.tags.join(", ") : "");
    }
  }, [initialData, isOpen]);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/preview/${projectId}`
      : "";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Public link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleAddSuggestedTag = (tag: string) => {
    const existing = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!existing.includes(tag)) {
      setTagsInput([...existing, tag].join(", "));
    }
  };

  const handleSubmit = async (targetPublishedState?: boolean) => {
    const nextPublished =
      targetPublishedState !== undefined ? targetPublishedState : isPublished;
    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setIsSubmitting(true);
    try {
      await publishMutation({
        projectId,
        isPublished: nextPublished,
        description: description.trim() || undefined,
        category,
        tags: parsedTags,
      });

      if (nextPublished) {
        toast.success("Project published successfully! Others can now view and clone it.");
      } else {
        toast.success("Project is now private.");
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update publish settings";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Publish & Share Project
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Make &ldquo;{projectName}&rdquo; public so other developers can inspect the architecture and clone it into their workspace.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Public Toggle Switch */}
          <div className="flex items-center justify-between rounded-lg border p-3.5 bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <span>Publicly Available</span>
                {isPublished && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] py-0 px-1.5">
                    Live
                  </Badge>
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                Anyone with the link or browsing Published Projects can view and clone this architecture.
              </p>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              aria-label="Toggle project visibility"
            />
          </div>

          {/* Shareable Link Box */}
          {isPublished && (
            <div className="space-y-1.5 rounded-lg border border-border/80 p-3 bg-secondary/20">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5" /> Shareable Public URL
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={publicUrl}
                  className="font-mono text-xs bg-background h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category" className="text-xs font-medium">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="h-9 text-xs">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-xs">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Explain the purpose of this architecture, key components, database design, or agent pipelines..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="tags" className="text-xs font-medium">
              Tags (comma separated)
            </Label>
            <Input
              id="tags"
              placeholder="e.g. Next.js, PostgreSQL, LangGraph, Microservices"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="text-xs h-9"
            />
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Quick add:
              </span>
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAddSuggestedTag(tag)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
          {initialData?.isPublished ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 text-xs"
              onClick={() => void handleSubmit(false)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : null}
              Unpublish
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              {isPublished ? "Save & Publish" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

