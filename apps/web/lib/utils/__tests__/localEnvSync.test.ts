import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cleanEnvVarName,
  formatEnvVarRef,
  updateEnvString,
  saveLocalEnvVariable,
  getLocalEnvVariable,
} from "../localEnvSync";

describe("localEnvSync utility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes environment variable names cleanly", () => {
    expect(cleanEnvVarName("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
    expect(cleanEnvVarName("process.env.STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
    expect(cleanEnvVarName("stripe-api-key")).toBe("STRIPE_API_KEY");
    expect(cleanEnvVarName("  openai.api.key  ")).toBe("OPENAI_API_KEY");
    expect(cleanEnvVarName("")).toBe("");
  });

  it("formats environment variable code references", () => {
    expect(formatEnvVarRef("STRIPE_KEY")).toBe("process.env.STRIPE_KEY");
    expect(formatEnvVarRef("process.env.OPENAI_KEY")).toBe("process.env.OPENAI_KEY");
    expect(formatEnvVarRef("")).toBe("");
  });

  it("updates existing keys in .env string content", () => {
    const original = `# Server config\nPORT=3000\nSTRIPE_KEY=old_secret\nDEBUG=true\n`;
    const updated = updateEnvString(original, "STRIPE_KEY", "new_secret_123");

    expect(updated).toContain("STRIPE_KEY=new_secret_123");
    expect(updated).not.toContain("STRIPE_KEY=old_secret");
    expect(updated).toContain("PORT=3000");
    expect(updated).toContain("DEBUG=true");
  });

  it("appends new key=value when not present in .env string", () => {
    const original = `PORT=8080\n`;
    const updated = updateEnvString(original, "NEW_SECRET", "sk_live_999");

    expect(updated).toContain("PORT=8080");
    expect(updated).toContain("NEW_SECRET=sk_live_999");
  });

  it("stores and retrieves secret values locally without sending to database", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("sk_test_abc123");

    const result = await saveLocalEnvVariable("MY_SECRET_KEY", "sk_test_abc123");
    expect(result.success).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith("dezign2app_env_MY_SECRET_KEY", "sk_test_abc123");

    const retrieved = getLocalEnvVariable("MY_SECRET_KEY");
    expect(retrieved).toBe("sk_test_abc123");
  });
});
