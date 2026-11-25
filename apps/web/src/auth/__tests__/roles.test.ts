import { describe, expect, it } from "vitest";
import { navigationFor, roleHome } from "../roles";

describe("role routing", () => {
  it("sends each role to its own home", () => {
    expect(roleHome("candidate")).toBe("/candidate");
    expect(roleHome("recruiter")).toBe("/recruiter");
    expect(roleHome("admin")).toBe("/admin");
  });

  it("only exposes allowed navigation per role", () => {
    expect(navigationFor("candidate").map((link) => link.label)).toEqual([
      "Dashboard",
      "My Applications",
      "My Resumes",
      "Inbox",
      "Support",
    ]);
    expect(navigationFor("recruiter").map((link) => link.label)).toEqual([
      "Dashboard",
      "Candidates",
      "Support",
    ]);
    expect(navigationFor("admin").map((link) => link.to)).toEqual([
      "/admin",
      "/admin/users",
      "/admin/jobs",
      "/admin/support",
    ]);
  });
});
