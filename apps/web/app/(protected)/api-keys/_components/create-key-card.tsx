"use client";

import { PlusIcon, Loader2Icon, FolderIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

interface Project {
  _id: string;
  name: string;
}

interface CreateKeyCardProps {
  newKeyName: string;
  setNewKeyName: (name: string) => void;
  isGenerating: boolean;
  handleGenerate: () => void;
  projects: Project[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string) => void;
}

export function CreateKeyCard({ 
  newKeyName, 
  setNewKeyName, 
  isGenerating, 
  handleGenerate,
  projects,
  selectedProjectId,
  setSelectedProjectId,
}: CreateKeyCardProps) {

  return (
    <Card className="border-primary/20 shadow-xl overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <PlusIcon className="size-24" />
      </div>
      <CardHeader>
        <CardTitle className="text-lg">Create New Key</CardTitle>
        <CardDescription>
          Each key is scoped to a single project — the MCP client will only access that project's architecture context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground">
            Descriptive Name
          </label>
          <Input
            placeholder="e.g. VS Code Plugin"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FolderIcon className="size-3" />
            Project <span className="text-destructive">*</span>
          </label>
          <Select
            value={selectedProjectId ?? ""}
            onValueChange={(val) => setSelectedProjectId(val)}
          >
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="Select a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No projects found. Create a project first.
                </div>
              ) : (
                projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The MCP client using this key will only be able to access context from this project.
          </p>
        </div>

        <Button 
          className="w-full shadow-lg shadow-primary/20" 
          onClick={handleGenerate} 
          disabled={isGenerating || !newKeyName.trim() || !selectedProjectId}
        >
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" />
              Generating...
            </div>
          ) : (
            <>
              <PlusIcon className="mr-2 h-4 w-4" />
              Generate Key
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
