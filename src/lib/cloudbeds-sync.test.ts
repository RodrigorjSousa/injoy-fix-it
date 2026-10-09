import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession }, functions: { invoke: mocks.invoke } },
}));
import { sincronizarCloudbeds } from "./cloudbeds-sync";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "initial-test-token" } }, error: null });
});

describe("Cloudbeds session recovery", () => {
  it("sends the current user token", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await sincronizarCloudbeds();
    expect(mocks.invoke).toHaveBeenCalledWith("consolidar-dados", { body: {}, headers: { Authorization: "Bearer initial-test-token" } });
  });
  it("refreshes a rejected session and retries with the new token", async () => {
    mocks.invoke.mockResolvedValueOnce({ error: { context: { status: 401 } } }).mockResolvedValueOnce({ data: { success: true }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "refreshed-test-token" } }, error: null });
    await sincronizarCloudbeds();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).toHaveBeenLastCalledWith("consolidar-dados", { body: {}, headers: { Authorization: "Bearer refreshed-test-token" } });
  });
  it("stops after one retry when the session remains invalid", async () => {
    mocks.invoke.mockResolvedValue({ error: { context: { status: 401 } } });
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "refreshed-test-token" } }, error: null });
    await expect(sincronizarCloudbeds()).rejects.toThrow("Sua sessão expirou.");
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("does not invoke a function without a user session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(sincronizarCloudbeds()).rejects.toThrow("Sua sessão expirou.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});