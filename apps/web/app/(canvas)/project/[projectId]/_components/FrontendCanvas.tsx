"use client";

import React, { useState, useEffect } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { FrontendCanvasAdapter } from "@/lib/canvas-adapters/frontendAdapter";

interface FrontendCanvasProps {
  projectId: string;
}

export function FrontendCanvas({ projectId }: FrontendCanvasProps) {
  // Use STATE (not ref) so it's reactive — useEffect re-runs when editor mounts
  const [editor, setEditor] = useState<Editor | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const syncRecords = useMutation(api.canvas.syncFrontendRecords);

  // Convex reactive query — re-runs automatically when DB changes
  const initialRecords = useQuery(api.canvas.getFrontendRecords, {
    projectId: projectId as Id<"projects">,
  });

  const handleMount = (editor: Editor) => {
    setEditor(editor);
    (window as any).frontendAdapter = new FrontendCanvasAdapter(editor);

    // Listen to store diffs → push granular updates to Convex immediately
    editor.store.listen(
      ({ changes }) => {
        const put = [
          ...Object.values(changes.added),
          ...Object.values(changes.updated).map(([, next]) => next),
        ];
        const remove = Object.keys(changes.removed);
        if (put.length === 0 && remove.length === 0) return;

        syncRecords({
          projectId: projectId as Id<"projects">,
          put,
          remove,
        }).catch(console.error);
      },
      { scope: "document", source: "user" }
    );
  };

  // Both editor (state) and initialRecords are reactive —
  // this effect correctly waits until BOTH are ready before hydrating
  useEffect(() => {
    if (!editor || hydrated) return;
    if (initialRecords === undefined) return; // Convex still loading
    if (initialRecords.length === 0) {
      setHydrated(true);
      return; // empty canvas
    }

    try {
      editor.store.mergeRemoteChanges(() => {
        editor.store.put(initialRecords as any);
      });
      setHydrated(true);
    } catch (err) {
      console.error("Failed to hydrate tldraw from Convex:", err);
    }
  }, [editor, initialRecords, hydrated]);

  // Show loader until Convex data is ready
  if (initialRecords === undefined) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground">
        Loading canvas...
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ zIndex: 0 }}>
      <Tldraw onMount={handleMount} />
    </div>
  );
}
