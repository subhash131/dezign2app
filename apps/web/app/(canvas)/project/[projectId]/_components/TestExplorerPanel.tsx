"use client";

import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { Play, FlaskConical, XCircle, CheckCircle } from "lucide-react";
import { SimulationTestCase, UIEventItem } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { simulateTestCase, SimulationTestCaseResult } from "@/lib/simulation/runtime";

function JSONDiff({ expected, actual }: { expected: unknown; actual: unknown }) {
  const eStr = JSON.stringify(expected, null, 2);
  const aStr = JSON.stringify(actual, null, 2);
  const isMatch = eStr === aStr;

  return (
    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
      <div className="border rounded bg-muted/20 p-2 overflow-auto max-h-64">
        <div className="font-bold mb-1 text-[10px] text-muted-foreground uppercase">Expected</div>
        <pre className="text-foreground">{eStr}</pre>
      </div>
      <div className={`border rounded p-2 overflow-auto max-h-64 ${isMatch ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
        <div className="font-bold mb-1 text-[10px] text-muted-foreground uppercase">Actual</div>
        <pre className="text-foreground">{aStr}</pre>
      </div>
    </div>
  );
}

export function TestExplorerPanel() {
  const { testExplorerOpen, toggleTestExplorer, testCases, start, status, selectedCaseId, selectTestCase } = useSimulationStore();
  const { nodes, edges, endpoints } = useBackendCanvasStore();
  
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SimulationTestCaseResult | { error: string } | null>(null);

  const handleRun = async (testCase: SimulationTestCase) => {
    setRunningId(testCase.id);
    selectTestCase(testCase.id);
    try {
      const client = nodes.find(n => n.id === testCase.targetNodeId);
      if (!client) throw new Error("Client node not found");
      
      const event = client.data.events?.find((e: UIEventItem) => e.id === testCase.targetEventId) || client.data.events?.[0];
      if (!event) throw new Error("Trigger event not found on client");

      const result = await simulateTestCase({
        client,
        event,
        testCase,
        nodes,
        edges,
        endpoints,
      });
      setLastResult(result);
      start(result.trace);
    } catch (e) {
      console.error(e);
      setLastResult({ error: String(e) });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Sheet open={testExplorerOpen} onOpenChange={(open) => { if (!open) toggleTestExplorer(); }}>
      <SheetContent side="left" className="w-[600px] sm:w-[600px] sm:max-w-[600px] flex flex-col gap-0 p-0 border-r shadow-xl">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="w-4 h-4" />
            Test Explorer
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/5">
          {testCases.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center mt-10">No test cases found. Save a test case from the Web Client Node.</div>
          ) : (
            testCases.map((tc) => (
              <div key={tc.id} className={`border rounded-lg p-3 bg-card shadow-sm ${selectedCaseId === tc.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium text-sm">{tc.name}</div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRun(tc)} disabled={runningId === tc.id || status === "running"}>
                    {runningId === tc.id ? "Running..." : <><Play className="w-3 h-3 mr-1" /> Run</>}
                  </Button>
                </div>
                
                {lastResult && selectedCaseId === tc.id && !("error" in lastResult) && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                      {("assertions" in lastResult) && lastResult.assertions?.map((a, i: number) => (
                        <span key={i} className={`px-2 py-1 rounded flex items-center gap-1 ${a.passed ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700'}`}>
                          {a.passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {a.name}
                        </span>
                      ))}
                    </div>
                    {tc.expectedBody !== undefined && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase">Response Body Diff</div>
                        <JSONDiff expected={tc.expectedBody} actual={"body" in lastResult ? lastResult.body : undefined} />
                      </div>
                    )}
                  </div>
                )}
                {lastResult && "error" in lastResult && selectedCaseId === tc.id && (
                  <div className="mt-4 p-2 bg-destructive/10 text-destructive text-xs rounded">
                    {lastResult.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
