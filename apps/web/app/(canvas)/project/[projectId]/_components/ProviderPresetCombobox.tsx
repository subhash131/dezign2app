import React from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty
} from "@workspace/ui/components/combobox";

export const PRESET_LABELS = [
  "Auth0",
  "Clerk",
  "Keycloak",
  "Okta",
  "AWS Cognito",
  "Firebase",
  "Supabase",
  "Azure Entra ID",
  "OpenID Connect",
  "Custom JWT"
];

export const LABEL_TO_KEY: Record<string, string> = {
  "Auth0": "auth0",
  "Clerk": "clerk",
  "Keycloak": "keycloak",
  "Okta": "okta",
  "AWS Cognito": "cognito",
  "Firebase": "firebase",
  "Supabase": "supabase",
  "Azure Entra ID": "entraid",
  "OpenID Connect": "oidc",
  "Custom JWT": "custom"
};

interface ProviderPresetComboboxProps {
  onValueChange: (label: string | null) => void;
  value?: string | null;
  inputValue?: string;
  onInputValueChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  autoFocus?: boolean;
}

export function ProviderPresetCombobox({
  onValueChange,
  value,
  inputValue,
  onInputValueChange,
  onKeyDown,
  placeholder = "Search preset...",
  className,
  contentClassName = "bg-sidebar!",
  autoFocus
}: ProviderPresetComboboxProps) {
  return (
    <Combobox 
      items={PRESET_LABELS} 
      value={value}
      onValueChange={onValueChange}
      inputValue={inputValue}
      onInputValueChange={onInputValueChange}
    >
      <ComboboxInput 
        placeholder={placeholder} 
        className={className}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
      />
      <ComboboxContent className={contentClassName}>
        <ComboboxEmpty>Type a custom provider...</ComboboxEmpty>
        <ComboboxList>
          {(label: string) => (
            <ComboboxItem key={label} value={label}>
              {label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
