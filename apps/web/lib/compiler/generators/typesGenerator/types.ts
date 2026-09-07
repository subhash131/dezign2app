import { ParameterItem } from "../schemaToTypeScript";

export interface ResponseFieldItem extends ParameterItem {
  selectedColumns?: string[];
}

export interface ResponseInterfaceResult {
  code: string;
  entityImports: Set<string>;
}
