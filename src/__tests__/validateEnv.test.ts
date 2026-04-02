import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test validateEnv by dynamically importing it with different env vars
// Since it calls process.exit, we mock that.

describe("validateEnv", () => {
  const originalEnv = process.env;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("passes with valid env vars", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@remote-host:5432/db";
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "my-service-role-key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).not.toThrow();
  });

  it("accepts SUPABASE_SERVICE_ROLE_KEY as alternative", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@remote-host:5432/db";
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "my-key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).not.toThrow();
  });

  it("exits when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when SUPABASE_URL is missing", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@remote-host:5432/db";
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE = "key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when neither SUPABASE_SERVICE_ROLE nor SUPABASE_SERVICE_ROLE_KEY is set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@remote-host:5432/db";
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when DATABASE_URL points to localhost", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).toThrow("process.exit called");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Local database connections are forbidden")
    );
  });

  it("exits when DATABASE_URL points to 127.0.0.1", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/db";
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE = "key";

    const { validateEnv } = await import("../lib/validateEnv");
    expect(() => validateEnv()).toThrow("process.exit called");
  });
});
