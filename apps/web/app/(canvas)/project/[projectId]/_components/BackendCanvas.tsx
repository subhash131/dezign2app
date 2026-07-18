"use client";

import React from "react";
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
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasView } from "@/types/canvas";
import { ChatContainer } from "@/app/(protected)/_components/chat/chat-container";
import { ConfigSidebar } from "./ConfigSidebar";
import { useBackendSync } from "./hooks/useBackendSync";
import { SchemaView } from "./SchemaView";
import { GraphView } from "./GraphView";
import { SequenceView } from "./SequenceView";

interface BackendCanvasProps {
  projectId: string;
  view: BackendCanvasView;
}

function Flow({ projectId, view }: BackendCanvasProps) {
  // Syncs the local zustand store with the remote Convex database
  useBackendSync(projectId, view);

  if (view === "sequence") {
    return <SequenceView />;
  }

  if (view === "schema") {
    return <SchemaView projectId={projectId} />;
  }

  return <GraphView projectId={projectId} />;
}

export function BackendCanvas(props: BackendCanvasProps) {
  if (!props.projectId) return null;
  
  const nodesPendingDeletion = useBackendCanvasStore(s => s.nodesPendingDeletion);
  const setNodesPendingDeletion = useBackendCanvasStore(s => s.setNodesPendingDeletion);
  const deleteNode = useBackendCanvasStore(s => s.deleteNode);

  return (
    <>
      <Flow {...props} />
      <AlertDialog open={nodesPendingDeletion.length > 0} onOpenChange={(open) => !open && setNodesPendingDeletion([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the {nodesPendingDeletion.length > 1 ? "selected items" : (nodesPendingDeletion[0]?.type === 'group' ? "group" : "table")} "{nodesPendingDeletion.map(n => n.data.label || 'Untitled').join(", ")}" and all of their contents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              nodesPendingDeletion.forEach(n => deleteNode(n.id));
              setNodesPendingDeletion([]);
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfigSidebar />
      <ChatContainer />
    </>
  );
}
