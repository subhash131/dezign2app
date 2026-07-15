import { z } from "zod";
import { MessagesAnnotation, Annotation } from "@langchain/langgraph";

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  projectId: Annotation<string>(),
  convexUrl: Annotation<string>(),
  token: Annotation<string>(),
  viewportCenter: Annotation<{ x: number; y: number }>(),
  intent: Annotation<string>(),
  canvasStateContext: Annotation<string>(),
  toolCallCount: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),
  requirements: Annotation<{
    functional: string[];
    nonFunctional: string[];
    assumptions: string[];
    status: "pending" | "confirmed";
  }>({
    reducer: (_, y) => y, // last-write-wins — this is a snapshot, not something to accumulate
    default: () => ({ functional: [], nonFunctional: [], assumptions: [], status: "pending" }),
  }),
  implementationPlan: Annotation<{
    content: string;
    status: "none" | "proposed" | "approved" | "schema_built" | "schema_approved" | "nodes_built" | "nodes_approved" | "edges_built";
  }>({
    reducer: (_, y) => y,
    default: () => ({ content: "", status: "none" }),
  }),
  // Per-turn classifier signals, consumed immediately by routing — not meant to
  // carry meaning across turns the way requirements/implementationPlan do.
  readyForRequirementsSync: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  planDecision: Annotation<"approve" | "revise" | "not_applicable">({
    reducer: (_, y) => y,
    default: () => "not_applicable",
  }),
});

export const requirementsSchema = z.object({
  functional: z.array(z.string()),
  nonFunctional: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export type RequirementsState = typeof GraphAnnotation.State["requirements"];
export type ImplementationPlanState = typeof GraphAnnotation.State["implementationPlan"];

export const DEFAULT_REQUIREMENTS: RequirementsState = {
  functional: [],
  nonFunctional: [],
  assumptions: [],
  status: "pending",
};

export const DEFAULT_PLAN: ImplementationPlanState = { content: "", status: "none" };
