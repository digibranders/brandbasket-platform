import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncTenantForBusiness } from "./tenant-sync";

// Payload itself is a test double: what matters here is what this module does with it (look before creating, don't
// throw on failure), not Payload's own create/find behaviour, which is Payload's to test.
vi.mock("payload", () => ({ getPayload: vi.fn() }));

const mockedGetPayload = vi.mocked(getPayload);

/** Each app passes its own config; this module only forwards it to Payload. */
const CONFIG = {} as Parameters<typeof syncTenantForBusiness>[0];

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NAME = "Riverside Plumbing";

/** A minimal APIError-shaped rejection, matching how Payload signals a unique-field violation (data.errors[].path). */
class FakeValidationError extends Error {
  readonly data: { readonly errors: ReadonlyArray<{ readonly path: string }> };
  constructor(path: string) {
    super("The following field is invalid: " + path);
    this.name = "ValidationError";
    this.data = { errors: [{ path }] };
  }
}

let find: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  find = vi.fn().mockResolvedValue({ docs: [] });
  create = vi.fn().mockResolvedValue({ id: "tenant-1" });
  mockedGetPayload.mockResolvedValue({ find, create } as never);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("syncTenantForBusiness", () => {
  it("creates a tenant with the same id and name when none exists yet", async () => {
    await syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "tenants",
        where: { businessId: { equals: BUSINESS_ID } },
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "tenants",
        data: { businessId: BUSINESS_ID, name: NAME },
      }),
    );
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not create a duplicate tenant when one already exists for this business", async () => {
    find.mockResolvedValue({ docs: [{ id: "tenant-1", businessId: BUSINESS_ID, name: NAME }] });

    await syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME });

    expect(create).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("treats a duplicate-businessId race at create time as already synced, not an error", async () => {
    create.mockRejectedValue(new FakeValidationError("businessId"));

    await expect(syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME })).resolves.toBeUndefined();

    expect(logged).not.toHaveBeenCalled();
  });

  it("calling the path twice for the same business creates exactly one tenant", async () => {
    await syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME });
    find.mockResolvedValue({ docs: [{ id: "tenant-1", businessId: BUSINESS_ID, name: NAME }] });
    await syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("logs and does not throw when Payload is unreachable, so a signup or staff repair is never blocked by it", async () => {
    const outage = new Error("connect ECONNREFUSED");
    find.mockRejectedValue(outage);

    await expect(syncTenantForBusiness(CONFIG, { businessId: BUSINESS_ID, name: NAME })).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledTimes(1);
    const [message, details] = logged.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("tenant");
    expect(details).toMatchObject({ businessId: BUSINESS_ID, error: outage });
  });
});
