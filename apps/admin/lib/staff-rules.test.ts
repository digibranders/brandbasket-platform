import { describe, expect, it } from "vitest";
import { staffChangeProblem } from "./staff-rules";

const admin = { userId: "riya", role: "admin" as const, active: true };
const support = { userId: "rohit", role: "support" as const, active: true };

describe("staffChangeProblem", () => {
  it("lets an admin change someone else's role or switch them off", () => {
    expect(staffChangeProblem({ kind: "role", role: "finance" }, { actorUserId: "riya", target: support, activeAdmins: 1 })).toBeNull();
    expect(staffChangeProblem({ kind: "switch-off" }, { actorUserId: "riya", target: support, activeAdmins: 1 })).toBeNull();
  });

  it("refuses changes to yourself", () => {
    expect(staffChangeProblem({ kind: "switch-off" }, { actorUserId: "riya", target: admin, activeAdmins: 3 })).toBe("self-off");
    expect(staffChangeProblem({ kind: "role", role: "support" }, { actorUserId: "riya", target: admin, activeAdmins: 3 })).toBe("self-role");
  });

  it("keeps at least one active admin", () => {
    const other = { ...admin, userId: "deepa" };
    expect(staffChangeProblem({ kind: "switch-off" }, { actorUserId: "riya", target: other, activeAdmins: 1 })).toBe("last-admin");
    expect(staffChangeProblem({ kind: "role", role: "finance" }, { actorUserId: "riya", target: other, activeAdmins: 1 })).toBe("last-admin");
    expect(staffChangeProblem({ kind: "switch-off" }, { actorUserId: "riya", target: other, activeAdmins: 2 })).toBeNull();
  });

  it("says when nothing would change", () => {
    expect(staffChangeProblem({ kind: "switch-on" }, { actorUserId: "riya", target: support, activeAdmins: 1 })).toBe("already-on");
    expect(staffChangeProblem({ kind: "switch-off" }, { actorUserId: "riya", target: { ...support, active: false }, activeAdmins: 1 })).toBe("already-off");
    expect(staffChangeProblem({ kind: "switch-on" }, { actorUserId: "riya", target: { ...support, active: false }, activeAdmins: 1 })).toBeNull();
  });
});
