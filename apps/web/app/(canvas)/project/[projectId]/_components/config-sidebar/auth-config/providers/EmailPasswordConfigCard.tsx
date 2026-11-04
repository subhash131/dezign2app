import React from "react";
import { LocalInput } from "../LocalInput";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { ShieldCheck } from "lucide-react";
import { EmailPasswordConfig } from "@workspace/canvas";
import { BackendNodeData } from "@/types/canvas";

interface EmailPasswordConfigCardProps {
  emailPassword: EmailPasswordConfig;
  providers: NonNullable<BackendNodeData["providers"]>;
  updateData: (changes: Partial<BackendNodeData>) => void;
}

export const EmailPasswordConfigCard: React.FC<EmailPasswordConfigCardProps> = ({
  emailPassword,
  providers,
  updateData,
}) => {
  return (
    <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Email & Password Policy</Label>
        <Checkbox
          checked={emailPassword?.enabled}
          onCheckedChange={(checked) =>
            updateData({
              providers: {
                ...providers,
                emailPassword: {
                  ...emailPassword,
                  enabled: Boolean(checked),
                },
              },
            })
          }
        />
      </div>
      {emailPassword?.enabled && (
        <div className="flex flex-col gap-3 pt-2 text-xs border-t border-border/30">
          {/* Require Email Verification */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="require-verify"
              checked={Boolean(emailPassword?.requireVerification)}
              onCheckedChange={(c) =>
                updateData({
                  providers: {
                    ...providers,
                    emailPassword: {
                      ...emailPassword,
                      requireVerification: Boolean(c),
                    },
                  },
                })
              }
            />
            <Label htmlFor="require-verify" className="text-xs font-normal cursor-pointer">
              Require Email Verification
            </Label>
          </div>

          {/* Password Complexity Rules */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground font-medium">Min Password Length</Label>
              <Select
                value={String(emailPassword.minLength || 8)}
                onValueChange={(val) =>
                  updateData({
                    providers: {
                      ...providers,
                      emailPassword: {
                        ...emailPassword,
                        minLength: parseInt(val, 10),
                      },
                    },
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs font-mono bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="font-mono">
                  {[6, 8, 10, 12, 16].map((len) => (
                    <SelectItem key={len} value={String(len)} className="text-xs font-mono">
                      {len} characters
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 justify-end">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="req-upper"
                  checked={emailPassword.requireUppercase}
                  onCheckedChange={(c) =>
                    updateData({
                      providers: {
                        ...providers,
                        emailPassword: { ...emailPassword, requireUppercase: Boolean(c) },
                      },
                    })
                  }
                />
                <Label htmlFor="req-upper" className="text-[11px] font-normal cursor-pointer">
                  Require Uppercase
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="req-num"
                  checked={emailPassword.requireNumbers}
                  onCheckedChange={(c) =>
                    updateData({
                      providers: {
                        ...providers,
                        emailPassword: { ...emailPassword, requireNumbers: Boolean(c) },
                      },
                    })
                  }
                />
                <Label htmlFor="req-num" className="text-[11px] font-normal cursor-pointer">
                  Require Numbers
                </Label>
              </div>
            </div>
          </div>

          {/* Brute Force Rate Limiting */}
          <div className="flex flex-col gap-2 p-2.5 rounded bg-background border border-border/40 mt-1">
            <Label className="text-[11px] font-semibold flex items-center gap-1 text-primary">
              <ShieldCheck className="w-3.5 h-3.5" /> Brute-Force Rate Limiting & Lockout
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">Max Attempts</span>
                <LocalInput
                  className="h-7 text-xs font-mono bg-background"
                  type="number"
                  value={emailPassword.rateLimit?.maxAttempts ?? 5}
                  onChange={(e) =>
                    updateData({
                      providers: {
                        ...providers,
                        emailPassword: {
                          ...emailPassword,
                          rateLimit: {
                            maxAttempts: parseInt(e.target.value, 10) || 5,
                            windowSeconds: emailPassword.rateLimit?.windowSeconds ?? 60,
                            lockoutDurationSeconds: emailPassword.rateLimit?.lockoutDurationSeconds ?? 900,
                          },
                        },
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">Window (Sec)</span>
                <LocalInput
                  className="h-7 text-xs font-mono bg-background"
                  type="number"
                  value={emailPassword.rateLimit?.windowSeconds ?? 60}
                  onChange={(e) =>
                    updateData({
                      providers: {
                        ...providers,
                        emailPassword: {
                          ...emailPassword,
                          rateLimit: {
                            maxAttempts: emailPassword.rateLimit?.maxAttempts ?? 5,
                            windowSeconds: parseInt(e.target.value, 10) || 60,
                            lockoutDurationSeconds: emailPassword.rateLimit?.lockoutDurationSeconds ?? 900,
                          },
                        },
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">Lockout (Sec)</span>
                <LocalInput
                  className="h-7 text-xs font-mono bg-background"
                  type="number"
                  value={emailPassword.rateLimit?.lockoutDurationSeconds ?? 900}
                  onChange={(e) =>
                    updateData({
                      providers: {
                        ...providers,
                        emailPassword: {
                          ...emailPassword,
                          rateLimit: {
                            maxAttempts: emailPassword.rateLimit?.maxAttempts ?? 5,
                            windowSeconds: emailPassword.rateLimit?.windowSeconds ?? 60,
                            lockoutDurationSeconds: parseInt(e.target.value, 10) || 900,
                          },
                        },
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
