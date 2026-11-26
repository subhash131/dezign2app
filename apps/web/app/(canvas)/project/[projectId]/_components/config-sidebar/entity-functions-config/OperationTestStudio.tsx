import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  DbOperationFunction,
  DbOperationTestCase,
  CanvasEntityColumn,
} from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { sanitizeForConvex } from "@/lib/utils/convexSanitizer";
import { toTableName } from "@/lib/compiler/utils";
import {
  generateDefaultParams,
  TestStudioHeader,
  TestCaseTabs,
  TestParamsForm,
  TestRunBar,
  TestResultViewer,
  ServerOfflineBanner,
} from "./test-studio";
import {
  testDatabaseOperation,
  checkDatabaseConnection,
} from "@/lib/services/databaseService";

export interface OperationTestStudioProps {
  selectedOp: DbOperationFunction;
  label: string;
  schema?: string;
  columns?: CanvasEntityColumn[];
  parentDb?: BackendNode;
  updateSelectedOp: (changes: Partial<DbOperationFunction>) => void;
}

export const OperationTestStudio: React.FC<OperationTestStudioProps> = React.memo(({
  selectedOp,
  label,
  schema,
  columns,
  parentDb,
  updateSelectedOp,
}) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  // Connection settings
  const isRedis =
    parentDb?.type === "redis_instance" ||
    parentDb?.data?.dbEngine === "redis" ||
    selectedOp.id.startsWith("redis-");

  const engine = isRedis ? "redis" : parentDb?.data?.dbEngine || "postgres";
  const isSqlite = engine === "sqlite";
  const dbData = parentDb?.data;
  const effectiveSchema = schema || dbData?.schema || "public";
  const host = dbData?.host || "localhost";
  const port: number | string = dbData?.port ?? (isRedis ? 6379 : isSqlite ? 0 : 5432);
  const dbFilePath = dbData?.dbFilePath || "dev.db";
  const dbFilePathEnv = dbData?.dbFilePathEnv || "DB_FILE_PATH";
  const database = dbData?.database;
  const user = dbData?.user || dbData?.username;
  const password = dbData?.password;
  const isPostgres = engine === "postgres";
  const rawConnString = dbData?.connectionString || dbData?.connectionStringPooled;

  const connectionConfig = useMemo(() => ({
    host: dbData?.host,
    port: dbData?.port ?? (isRedis ? 6379 : isSqlite ? 0 : 5432),
    database: dbData?.database,
    user: dbData?.user || dbData?.username,
    password: dbData?.password,
    connectionString: dbData?.connectionString || dbData?.connectionStringPooled,
    connectionStringEnv: dbData?.connectionStringEnv,
    connectionStringPooled: dbData?.connectionStringPooled,
    connectionStringPooledEnv: dbData?.connectionStringPooledEnv,
    sslMode: dbData?.sslMode,
    provider: dbData?.provider,
    dbFilePath: dbData?.dbFilePath || "dev.db",
    dbFilePathEnv: dbData?.dbFilePathEnv || "DB_FILE_PATH",
  }), [dbData, isRedis, isSqlite]);
  const connUri = isRedis
    ? `redis://${host}:${port}`
    : isSqlite
      ? `sqlite:${dbFilePath}`
      : isPostgres
        ? rawConnString
          ? rawConnString.replace(/:([^:@]+)@/, ":••••@")
          : `postgresql://${user || "postgres"}:${password ? "••••" : ""}@${host}:${port}/${database || "postgres"}`
        : `${host}:${port}`;
  const isParentConnected = parentDb?.data?.lastConnectionStatus?.connected === true;
  const isParentFailed = parentDb?.data?.lastConnectionStatus?.connected === false;
  const connectionError = parentDb?.data?.lastConnectionStatus?.error;

  // Studio Mode: live vs sandbox
  const [testMode, setTestMode] = useState<"live" | "sandbox">("live");
  const [executing, setExecuting] = useState(false);
  const [pingingParent, setPingingParent] = useState(false);

  // Local Test Cases state to avoid store updates on every keystroke
  const initialCases = useMemo(() => {
    if (selectedOp.testCases && selectedOp.testCases.length > 0) {
      return sanitizeForConvex(selectedOp.testCases);
    }
    return [
      {
        id: "case-1",
        name: "Standard Case",
        params: generateDefaultParams(selectedOp, label, isRedis, columns),
      },
    ];
  }, [selectedOp.testCases, selectedOp.params, label, isRedis, columns]);

  const [testCases, setTestCases] = useState<DbOperationTestCase[]>(initialCases);
  const [activeCaseId, setActiveCaseId] = useState<string>(initialCases[0]?.id || "case-1");
  const latestTestCasesRef = useRef(testCases);
  latestTestCasesRef.current = testCases;

  // Debounced persistence to parent canvas store
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const persistTestCases = useCallback(
    (cases: DbOperationTestCase[], immediate = false) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (immediate) {
        queueMicrotask(() => {
          updateSelectedOp({ testCases: cases });
        });
      } else {
        debounceTimerRef.current = setTimeout(() => {
          updateSelectedOp({ testCases: cases });
        }, 500);
      }
    },
    [updateSelectedOp],
  );

  // Sync test cases when switching operation or when parameters/columns change
  const prevOpIdRef = useRef(selectedOp.id);
  const prevParamsSignatureRef = useRef<string>(
    JSON.stringify((selectedOp.params || []).map((p) => `${p.name}:${p.type}`)),
  );
  const prevColumnsSignatureRef = useRef<string>(
    JSON.stringify((columns || []).map((c) => `${c.name}:${c.type}`)),
  );

  useEffect(() => {
    const currentParamsSig = JSON.stringify(
      (selectedOp.params || []).map((p) => `${p.name}:${p.type}`),
    );
    const currentColumnsSig = JSON.stringify(
      (columns || []).map((c) => `${c.name}:${c.type}`),
    );

    const isOpSwitch = selectedOp.id !== prevOpIdRef.current;
    const isParamsChanged = currentParamsSig !== prevParamsSignatureRef.current;
    const isColumnsChanged = currentColumnsSig !== prevColumnsSignatureRef.current;

    if (isOpSwitch) {
      prevOpIdRef.current = selectedOp.id;
      prevParamsSignatureRef.current = currentParamsSig;
      prevColumnsSignatureRef.current = currentColumnsSig;

      const cases =
        selectedOp.testCases && selectedOp.testCases.length > 0
          ? sanitizeForConvex(selectedOp.testCases)
          : [
              {
                id: "case-1",
                name: "Standard Case",
                params: generateDefaultParams(selectedOp, label, isRedis, columns),
              },
            ];
      setTestCases(cases);
      latestTestCasesRef.current = cases;
      setActiveCaseId(cases[0]?.id || "case-1");
      return;
    }

    if (isParamsChanged || isColumnsChanged) {
      prevParamsSignatureRef.current = currentParamsSig;
      prevColumnsSignatureRef.current = currentColumnsSig;

      // Reconcile missing/stale parameters across existing test cases
      const defaultParamValues = generateDefaultParams(selectedOp, label, isRedis, columns);
      const prevCases = latestTestCasesRef.current;
      const updated = prevCases.map((tc) => {
        const newParams: Record<string, unknown> = {};
        (selectedOp.params || []).forEach((p) => {
          const existingVal = tc.params?.[p.name];
          if (existingVal !== undefined) {
            // If existingVal is an object payload for data/item, heal stale dummy fields if they don't match any actual columns
            if (
              typeof existingVal === "object" &&
              existingVal !== null &&
              !Array.isArray(existingVal) &&
              (p.name === "data" || p.name === "item") &&
              columns &&
              columns.length > 0
            ) {
              const existingKeys = Object.keys(existingVal);
              const tableColNames = new Set(columns.map((c) => c.name));
              const hasValidColKey = existingKeys.some((k) => tableColNames.has(k));
              if (!hasValidColKey) {
                newParams[p.name] = defaultParamValues[p.name];
                return;
              }
            }
            newParams[p.name] = existingVal;
          } else {
            newParams[p.name] = defaultParamValues[p.name];
          }
        });
        return { ...tc, params: newParams };
      });
      latestTestCasesRef.current = updated;
      setTestCases(updated);
      persistTestCases(updated, false);
    }
  }, [
    selectedOp.id,
    selectedOp.testCases,
    selectedOp.params,
    label,
    isRedis,
    columns,
    persistTestCases,
  ]);

  // Flush pending updates when unmounting
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        updateSelectedOp({ testCases: latestTestCasesRef.current });
      }
    };
  }, [updateSelectedOp]);

  // Active test case guaranteed non-null
  const activeCase: DbOperationTestCase =
    testCases.find((tc) => tc.id === activeCaseId) ||
    testCases[0] || {
      id: "case-1",
      name: "Standard Case",
      params: generateDefaultParams(selectedOp, label, isRedis, columns),
    };

  // Add Test Case
  const handleAddTestCase = () => {
    const newCaseId = `case-${Date.now()}`;
    const newCase: DbOperationTestCase = {
      id: newCaseId,
      name: `Test Case ${testCases.length + 1}`,
      params: generateDefaultParams(selectedOp, label, isRedis, columns),
    };
    const updated = [...testCases, newCase];
    latestTestCasesRef.current = updated;
    setTestCases(updated);
    persistTestCases(updated, true);
    setActiveCaseId(newCaseId);
  };

  // Duplicate Test Case
  const handleDuplicateTestCase = (sourceCase: DbOperationTestCase) => {
    const newCaseId = `case-${Date.now()}`;
    const duplicated: DbOperationTestCase = {
      id: newCaseId,
      name: `${sourceCase.name} (Copy)`,
      params: JSON.parse(JSON.stringify(sourceCase.params)),
    };
    const updated = [...testCases, duplicated];
    latestTestCasesRef.current = updated;
    setTestCases(updated);
    persistTestCases(updated, true);
    setActiveCaseId(newCaseId);
  };

  // Delete Test Case
  const handleDeleteTestCase = (caseId: string) => {
    if (testCases.length <= 1) return;
    const updated = testCases.filter((tc) => tc.id !== caseId);
    latestTestCasesRef.current = updated;
    setTestCases(updated);
    persistTestCases(updated, true);
    if (activeCaseId === caseId) {
      setActiveCaseId(updated[0]?.id || "case-1");
    }
  };

  // Rename Test Case
  const handleRenameTestCase = (caseId: string, newName: string) => {
    const updated = testCases.map((c) =>
      c.id === caseId ? { ...c, name: newName } : c,
    );
    latestTestCasesRef.current = updated;
    setTestCases(updated);
    persistTestCases(updated, true);
  };

  // Update a parameter value in the active test case
  const handleParamChange = useCallback(
    (paramName: string, value: unknown) => {
      const current = latestTestCasesRef.current;
      const updated = current.map((tc) =>
        tc.id === activeCaseId
          ? { ...tc, params: { ...tc.params, [paramName]: value } }
          : tc,
      );
      latestTestCasesRef.current = updated;
      setTestCases(updated);
      persistTestCases(updated, false);
    },
    [activeCaseId, persistTestCases],
  );

  // Ping parent DB
  const handlePingConnection = async () => {
    if (!parentDb) return;
    setPingingParent(true);
    try {
      const data = await checkDatabaseConnection({
        engine,
        connection: connectionConfig,
      });
      updateNode(parentDb.id, {
        data: {
          ...parentDb.data,
          lastConnectionStatus: {
            connected: !!data.success,
            latencyMs: data.latencyMs,
            checkedAt: new Date().toLocaleTimeString(),
            serverInfo: data.info,
            error: data.error,
          },
        },
      });
    } catch {
      // Ignored
    } finally {
      setPingingParent(false);
    }
  };

  // Auto-verify server connection if untested when in Live mode
  useEffect(() => {
    if (
      testMode === "live" &&
      parentDb &&
      parentDb.data?.lastConnectionStatus === undefined &&
      !pingingParent
    ) {
      handlePingConnection();
    }
  }, [testMode, parentDb?.id]);

  // Execute the active test case
  const handleRunTest = async () => {
    if (!activeCase || executing) return;
    setExecuting(true);

    // Immediately flush and persist any pending edits before running
    persistTestCases(testCases, true);

    try {
      const data = await testDatabaseOperation({
        engine,
        connection: connectionConfig,
        entity: {
          name: toTableName(label),
          schema: effectiveSchema,
          columns,
        },
        operation: {
          id: selectedOp.id,
          name: selectedOp.name,
          kind: selectedOp.kind,
          code: selectedOp.code,
          query:
            selectedOp.query && !selectedOp.query.startsWith("//")
              ? selectedOp.query
              : undefined,
          signature: selectedOp.signature,
          params: selectedOp.params,
        },
        args: (() => {
          const opParamNames = new Set((selectedOp.params || []).map((p) => p.name));
          const effectiveArgs: Record<string, unknown> = {};
          if (opParamNames.size > 0) {
            for (const pName of opParamNames) {
              effectiveArgs[pName] = activeCase.params?.[pName];
            }
          } else if (isRedis) {
            effectiveArgs.key = activeCase.params?.key ?? `${label}:1001`;
          }
          return effectiveArgs;
        })(),
        mode: testMode,
      });

      // Sync parent node connection status based on live test result
      if (parentDb && testMode === "live") {
        if (data.serverActive === false) {
          updateNode(parentDb.id, {
            data: {
              ...parentDb.data,
              lastConnectionStatus: {
                connected: false,
                checkedAt: new Date().toLocaleTimeString(),
                latencyMs: 0,
                error: data.error,
              },
            },
          });
        } else if (data.serverActive === true || data.success) {
          updateNode(parentDb.id, {
            data: {
              ...parentDb.data,
              lastConnectionStatus: {
                connected: true,
                checkedAt: new Date().toLocaleTimeString(),
                latencyMs: data.durationMs || 1,
              },
            },
          });
        }
      }

      const lastResult = {
        success: !!data.success,
        output: sanitizeForConvex(data.output),
        error: data.error,
        durationMs: data.durationMs,
        executedAt: new Date().toLocaleTimeString(),
        rawCommand: data.rawCommand,
      };

      const updated = testCases.map((tc) =>
        tc.id === activeCase.id ? { ...tc, lastResult } : tc,
      );
      setTestCases(updated);
      persistTestCases(updated, true);
    } catch (err) {
      if (parentDb && testMode === "live") {
        updateNode(parentDb.id, {
          data: {
            ...parentDb.data,
            lastConnectionStatus: {
              connected: false,
              checkedAt: new Date().toLocaleTimeString(),
              latencyMs: 0,
              error: err instanceof Error ? err.message : "Network error executing test",
            },
          },
        });
      }

      const lastResult = {
        success: false,
        error: err instanceof Error ? err.message : "Network error executing test",
        durationMs: 0,
        executedAt: new Date().toLocaleTimeString(),
        rawCommand: `${selectedOp.name}()`,
      };
      const updated = testCases.map((tc) =>
        tc.id === activeCase.id ? { ...tc, lastResult } : tc,
      );
      setTestCases(updated);
      persistTestCases(updated, true);
    } finally {
      setExecuting(false);
    }
  };

  // Keyboard shortcut: Ctrl/Cmd + Enter to run test
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunTest();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCase, testMode]);

  const handleResetParamsToDefaults = useCallback(() => {
    const defaultParamValues = generateDefaultParams(selectedOp, label, isRedis, columns);
    const updated = testCases.map((tc) =>
      tc.id === activeCase.id ? { ...tc, params: defaultParamValues } : tc,
    );
    setTestCases(updated);
    persistTestCases(updated, true);
  }, [selectedOp, label, isRedis, columns, testCases, activeCase.id, persistTestCases]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      {/* 1. Header: Target Connection & Execution Mode Switcher */}
      <TestStudioHeader
        connUri={connUri}
        isParentConnected={isParentConnected}
        isParentFailed={isParentFailed}
        parentDb={parentDb}
        pingingParent={pingingParent}
        testMode={testMode}
        onPingConnection={handlePingConnection}
        onSetTestMode={setTestMode}
      />

      {/* 1.1 Server Not Active Error Banner */}
      {testMode === "live" && (!isParentConnected || isParentFailed) && (
        <ServerOfflineBanner
          connUri={connUri}
          engine={engine}
          host={host}
          port={port}
          error={connectionError}
          pingingParent={pingingParent}
          onPingConnection={handlePingConnection}
          onSwitchToSandbox={() => setTestMode("sandbox")}
        />
      )}

      {/* 2. Test Cases Tab Selector */}
      <TestCaseTabs
        testCases={testCases}
        activeCaseId={activeCase.id}
        onSelectCase={setActiveCaseId}
        onAddCase={handleAddTestCase}
        onDuplicateCase={handleDuplicateTestCase}
        onDeleteCase={handleDeleteTestCase}
        onRenameCase={handleRenameTestCase}
      />

      {/* 3. Parameter Inputs Form */}
      <TestParamsForm
        selectedOp={selectedOp}
        activeCase={activeCase}
        label={label}
        isRedis={isRedis}
        onParamChange={handleParamChange}
        onResetToDefaults={handleResetParamsToDefaults}
      />

      {/* 4. Action Trigger Bar */}
      <TestRunBar
        executing={executing}
        activeCase={activeCase}
        onRunTest={handleRunTest}
      />

      {/* 5. Live Command & Result Inspector */}
      {activeCase.lastResult && (
        <TestResultViewer
          lastResult={activeCase.lastResult}
          testMode={testMode}
          isRedis={isRedis}
          onSwitchToSandbox={() => setTestMode("sandbox")}
        />
      )}
    </div>
  );
});

OperationTestStudio.displayName = "OperationTestStudio";

