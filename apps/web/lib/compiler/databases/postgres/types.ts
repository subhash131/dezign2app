import type { BackendNode } from "@/types/canvas";
import type { ReusableFunction } from "@workspace/canvas/types";

export interface PgColumnMeta {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  isNotNull?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

import type { PersonaSeed } from "../../types/testPersona";

export interface PostgresOptions {
  packageName?: string;
  packageFolder?: string;
  connectionEnvVar?: string;
  dbNode?: BackendNode;
  personas?: PersonaSeed[];
}

export interface InlinePgOpContext {
  tableName: string;
  pascal: string;
  pascalSingular: string;
  pkColName: string;
  pkVarName: string;
  pkTsType: string;
  isStringPk: boolean;
  writableCols: PgColumnMeta[];
  colVarNames: Set<string>;
  effectiveName: string;
}

export interface TableHelperResult {
  code: string;
  fns: ReusableFunction[];
  typeExports: string[];
  valueExports: string[];
}
