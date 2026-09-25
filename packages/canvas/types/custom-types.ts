export type CustomTypeKind = "interface" | "type" | "enum" | "function";

export interface CustomTypeField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  isArray?: boolean;
  description?: string;
  defaultValue?: string;
  enumValues?: string[];
  /** True when this field was cloned from a base type (extendedFrom). Used to generate proper extends/intersection TS syntax. */
  isInherited?: boolean;
  /** True when the user has toggled this inherited field to be Omit<>'d from the extended type output. */
  isOmitted?: boolean;
}

export interface CustomTypeItem {
  id: string;
  name: string;
  kind: CustomTypeKind;
  description?: string;
  fields?: CustomTypeField[];
  enumValues?: string[];
  typeAliasValue?: string;
  returnType?: string;
  rawCode?: string;
  packageSource?: string;
  isReadOnly?: boolean;
  isExtendable?: boolean;
  extendedFrom?: string;
  extendedFromTypeId?: string;
}

export interface CanvasTypesNodeData {
  label?: string;
  description?: string;
  color?: string;
  scope?: "global" | "local";
  targetServiceId?: string;
  targetWebAppId?: string;
  definitionMode?: "visual" | "raw";
  rawTypeScript?: string;
  types?: CustomTypeItem[];
  packageSources?: string[];
  isExtended?: boolean;
  extendedFromNodeId?: string;
  isPackageNode?: boolean;
  packageName?: string;
  packageVersion?: string;
  isInstalled?: boolean;
  installError?: string;
  isReadOnly?: boolean;
  /** ID of the EntityNode this TypesNode was auto-generated from. Used for idempotent refresh. */
  sourceEntityId?: string;
  sourceEntityName?: string;
  entityUpdatedAt?: number;
  entitySyncWarning?: {
    entityId: string;
    entityName: string;
    updatedAt: number;
    affectedNodes: { id: string; name: string; type: string }[];
    dismissed?: boolean;
  };
}

