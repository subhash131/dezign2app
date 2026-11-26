"use client";

import React, { useEffect } from "react";
import {
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { RocketIcon, PowerOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import {
  WORKFLOW_NODE_MIME_TYPE,
  type WorkflowEditorEdge,
  type WorkflowEditorNode,
  type WorkflowNodeKind,
} from "./workflow-editor-types";
import { WorkflowBuilderNode } from "./workflow-builder-node";
import { WORKFLOW_NODE_REGISTRY } from "./workflow-node-registry";
import { WorkflowHistoryControls } from "./workflow-history-controls";

const nodeTypes = {
  workflow: WorkflowBuilderNode,
};

import { useWorkflowEditorContext } from "./workflow-editor-context";

export const WorkflowCanvas = () => {
  const {
    nodes,
    edges,
    isReadOnly,
    handleNodesChange: onNodesChange,
    handleEdgesChange: onEdgesChange,
    handleConnect: onConnect,
    handleAddNode: onDropNode,
    setSelectedNodeId: onSelectionChange,
    handlePublish: onPublish,
    handleUnpublish: onUnpublish,
    isPublishing,
    isUnpublishing,
    publishedVersionId,
    canPublish,
    handleDragStart,
  } = useWorkflowEditorContext();

  const [message, setMessage] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const { fitView, screenToFlowPosition } = useReactFlow<
    WorkflowEditorNode,
    WorkflowEditorEdge
  >();

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 250, maxZoom: 0.85 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodes.length]);

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(event) => {
        if (isReadOnly) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (isReadOnly) {
          return;
        }

        event.preventDefault();

        const nodeType = event.dataTransfer.getData(
          WORKFLOW_NODE_MIME_TYPE,
        ) as WorkflowNodeKind;

        if (!nodeType || !(nodeType in WORKFLOW_NODE_REGISTRY)) {
          return;
        }

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        onDropNode(nodeType, position);
      }}
    >
      {isReadOnly ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex justify-center">
          <Badge variant="outline" className="bg-background/90 backdrop-blur">
            Read-only mode
          </Badge>
        </div>
      ) : (
        <div className="absolute left-1/2 -translate-x-1/2 top-4 z-50 flex items-center gap-2">
          <WorkflowHistoryControls />
        </div>
      )}

      {!isReadOnly && (
        <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
          {publishedVersionId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-background/90 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 shadow-sm transition-all active:scale-95"
                  disabled={isUnpublishing}
                >
                  {isUnpublishing ? (
                    <Spinner className="size-4" />
                  ) : (
                    <PowerOff className="size-4" />
                  )}
                  Unpublish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Unpublishing will immediately stop all automated triggers
                    and scheduled runs for this workflow. You will need to
                    republish it to take it back online.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onUnpublish}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Unpublish Anyway
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="shadow-md transition-all active:scale-95"
                disabled={isPublishing || !canPublish}
              >
                {isPublishing ? (
                  <Spinner className="size-4" />
                ) : (
                  <RocketIcon className="size-4" />
                )}
                Publish
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Publish Workflow</DialogTitle>
                <DialogDescription>
                  Give this version a name or description to help you identify
                  it in the future.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="message">Version Message</Label>
                  <Textarea
                    id="message"
                    placeholder="e.g. Added retry logic, Updated API endpoints..."
                    className="h-24 resize-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setMessage("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    onPublish(message);
                    setOpen(false);
                    setMessage("");
                  }}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <RocketIcon className="mr-2 h-4 w-4" />
                  )}
                  Publish Version
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={handleDragStart}
        onSelectionDragStart={handleDragStart}
        onSelectionChange={({
          nodes: selectedNodes,
        }: {
          nodes: WorkflowEditorNode[];
        }) => onSelectionChange(selectedNodes[0]?.id ?? null)}
        onPaneClick={() => onSelectionChange(null)}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        snapToGrid={false}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable
        edgesFocusable
        edgesReconnectable={!isReadOnly}
        deleteKeyCode={isReadOnly ? null : ["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: false,
        }}
      >
        <MiniMap
          pannable
          zoomable
          className="!border !rounded-lg !overflow-hidden"
          bgColor="hsl(var(--background) / 0.9)"
          maskStrokeColor="hsl(var(--border))"
          maskStrokeWidth={4}
          nodeColor={(node: WorkflowEditorNode) =>
            WORKFLOW_NODE_REGISTRY[
              (node.data?.nodeType as WorkflowNodeKind) ?? "api"
            ]?.minimapColor ?? "hsl(var(--border))"
          }
          nodeStrokeColor="hsl(var(--border))"
          nodeBorderRadius={10}
          nodeStrokeWidth={2}
        />
        <Controls
          className="!border !rounded-lg !shadow-none overflow-hidden bg-accent hover:bg-accent/80"
          style={{
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            // Override React Flow's hardcoded button colors
            "--xy-controls-button-background-color": "transparent",
            "--xy-controls-button-background-color-hover": "hsl(var(--muted))",
            "--xy-controls-button-color": "hsl(var(--foreground))",
            "--xy-controls-button-color-hover": "hsl(var(--foreground))",
            "--xy-controls-button-border-color": "hsl(var(--border))",
          }}
        />
      </ReactFlow>
    </div>
  );
};
