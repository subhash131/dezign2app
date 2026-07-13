import { ConvexHttpClient } from "convex/browser";
import { GraphAnnotation } from "./state";

export function getConvexClient(state: typeof GraphAnnotation.State) {
  if (!state.convexUrl) throw new Error("Missing convexUrl in state");
  const client = new ConvexHttpClient(state.convexUrl);
  if (state.token) {
    client.setAuth(state.token);
  }
  return client;
}
