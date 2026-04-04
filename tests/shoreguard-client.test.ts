import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShoreGuardClient, ShoreGuardApiError } from "../src/shoreguard-client.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function noContentResponse(): Response {
  return { ok: true, status: 204, json: async () => undefined, text: async () => "" } as Response;
}

describe("ShoreGuardClient", () => {
  let client: ShoreGuardClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ShoreGuardClient({ baseUrl: "http://localhost:8888", apiKey: "test-key" });
  });

  it("sends authorization header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    await client.healthz();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8888/healthz",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("strips trailing slash from baseUrl", async () => {
    const c = new ShoreGuardClient({ baseUrl: "http://localhost:8888/", apiKey: "k" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    await c.healthz();
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8888/healthz", expect.anything());
  });

  describe("healthz / readyz", () => {
    it("returns health status", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const result = await client.healthz();
      expect(result).toEqual({ status: "ok" });
    });

    it("returns readyz status", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const result = await client.readyz();
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("listGateways", () => {
    it("returns gateway list", async () => {
      const gateways = [{ name: "dev", endpoint: "localhost:443", scheme: "https", status: "ok" }];
      mockFetch.mockResolvedValueOnce(jsonResponse(gateways));
      const result = await client.listGateways();
      expect(result).toEqual(gateways);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/gateway/list",
        expect.anything(),
      );
    });
  });

  describe("getGateway", () => {
    it("encodes gateway name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ name: "my gw" }));
      await client.getGateway("my gw");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/gateway/my%20gw/info",
        expect.anything(),
      );
    });
  });

  describe("sandboxes", () => {
    it("lists sandboxes", async () => {
      const sandboxes = [{ name: "sb1", status: "running", image: "ubuntu", gpu: false }];
      mockFetch.mockResolvedValueOnce(jsonResponse(sandboxes));
      const result = await client.listSandboxes("dev");
      expect(result).toEqual(sandboxes);
    });

    it("lists sandboxes with pagination", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.listSandboxes("dev", { limit: 10, offset: 5 });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/gateways/dev/sandboxes?limit=10&offset=5",
        expect.anything(),
      );
    });

    it("creates sandbox and returns operation_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ operation_id: "op-123" }, 202));
      // The response is 202 but ok is true for 2xx
      const result = await client.createSandbox("dev", { name: "test", image: "ubuntu" });
      expect(result).toEqual({ operation_id: "op-123" });
    });

    it("gets sandbox details", async () => {
      const sandbox = { name: "sb1", status: "running", image: "ubuntu", gpu: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(sandbox));
      const result = await client.getSandbox("dev", "sb1");
      expect(result).toEqual(sandbox);
    });

    it("deletes sandbox", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());
      const result = await client.deleteSandbox("dev", "sb1");
      expect(result).toBeUndefined();
    });

    it("executes command in sandbox", async () => {
      const execResult = { stdout: "hello", stderr: "", exit_code: 0 };
      mockFetch.mockResolvedValueOnce(jsonResponse(execResult));
      const result = await client.execInSandbox("dev", "sb1", { command: "echo hello" });
      expect(result).toEqual(execResult);
    });
  });

  describe("operations", () => {
    it("gets operation status", async () => {
      const op = { operation_id: "op-1", status: "completed", resource_type: "sandbox" };
      mockFetch.mockResolvedValueOnce(jsonResponse(op));
      const result = await client.getOperation("op-1");
      expect(result).toEqual(op);
    });

    it("polls operation until completed", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ operation_id: "op-1", status: "running", resource_type: "sandbox" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ operation_id: "op-1", status: "completed", resource_type: "sandbox" }),
        );

      const result = await client.pollOperation("op-1", 10_000);
      expect(result.status).toBe("completed");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("polls operation returns on failure", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          operation_id: "op-1",
          status: "failed",
          resource_type: "sandbox",
          error: "boom",
        }),
      );
      const result = await client.pollOperation("op-1");
      expect(result.status).toBe("failed");
      expect(result.error).toBe("boom");
    });
  });

  describe("approvals", () => {
    it("gets pending approvals", async () => {
      const chunks = [{ chunk_id: "c1", proposed_rule: {}, security_flagged: false, status: "pending" }];
      mockFetch.mockResolvedValueOnce(jsonResponse(chunks));
      const result = await client.getPendingApprovals("dev", "sb1");
      expect(result).toEqual(chunks);
    });

    it("approves a chunk", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());
      await client.approveChunk("dev", "sb1", "c1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/approvals/c1/approve"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("rejects a chunk with reason", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());
      await client.rejectChunk("dev", "sb1", "c1", "not needed");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/approvals/c1/reject"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("templates", () => {
    it("lists templates", async () => {
      const templates = [{ name: "web-dev", description: "Web development" }];
      mockFetch.mockResolvedValueOnce(jsonResponse(templates));
      const result = await client.listTemplates();
      expect(result).toEqual(templates);
    });

    it("gets a template by name", async () => {
      const template = { name: "web-dev", image: "node:22" };
      mockFetch.mockResolvedValueOnce(jsonResponse(template));
      const result = await client.getTemplate("web-dev");
      expect(result).toEqual(template);
    });
  });

  describe("webhooks", () => {
    it("lists webhooks", async () => {
      const webhooks = [{ id: 1, url: "https://example.com/hook", is_active: true }];
      mockFetch.mockResolvedValueOnce(jsonResponse(webhooks));
      const result = await client.listWebhooks();
      expect(result).toEqual(webhooks);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/webhooks",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("creates a webhook", async () => {
      const created = { id: 2, url: "https://example.com/hook", secret: "abc123" };
      mockFetch.mockResolvedValueOnce(jsonResponse(created, 201));
      const result = await client.createWebhook("https://example.com/hook", ["sandbox.created"]);
      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/webhooks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ url: "https://example.com/hook", event_types: ["sandbox.created"] }),
        }),
      );
    });

    it("deletes a webhook", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());
      await client.deleteWebhook(5);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8888/api/webhooks/5",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("error handling", () => {
    it("throws ShoreGuardApiError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Not found" }, 404),
      );
      await expect(client.getSandbox("dev", "nope")).rejects.toThrow(ShoreGuardApiError);
    });

    it("includes status and detail in error", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Forbidden" }, 403));
      try {
        await client.listGateways();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ShoreGuardApiError);
        const apiErr = err as ShoreGuardApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.detail).toBe("Forbidden");
      }
    });

    it("handles non-JSON error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response);
      await expect(client.healthz()).rejects.toThrow("500");
    });
  });
});