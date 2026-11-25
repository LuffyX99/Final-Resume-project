import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPanel from "../AdminPanel";
import type { AdminMetrics } from "../../types";

vi.mock("../../api/client", () => ({
  getAdminMetrics: vi.fn(),
  getAdminUsers: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    has_more: false,
    page: 1,
    limit: 10,
  }),
  updateAdminUserStatus: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getAdminMetrics } from "../../api/client";

const getAdminMetricsMock = vi.mocked(getAdminMetrics);

const mockMetrics: AdminMetrics = {
  total_candidates: 42,
  total_recruiters: 15,
  total_jobs: 28,
  open_jobs: 20,
  closed_jobs: 8,
  total_applications: 95,
  total_shortlisted: 34,
  open_support_tickets: 5,
  resolved_support_tickets: 12,
};

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders live metric totals and navigation cards", async () => {
    getAdminMetricsMock.mockResolvedValue(mockMetrics);

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText("Admin Nerve Center")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getByText("28")).toBeInTheDocument();
      expect(screen.getByText("95")).toBeInTheDocument();
      expect(screen.getByText("34")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    expect(screen.getByText("User & Recruiter Directory")).toBeInTheDocument();
    expect(screen.getByText("Jobs & Submissions Oversight")).toBeInTheDocument();
    expect(screen.getByText("Central Support Desk")).toBeInTheDocument();
  });

  it("handles metrics fetch failure gracefully", async () => {
    getAdminMetricsMock.mockRejectedValue(new Error("Server offline"));

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Server offline/)).toBeInTheDocument();
    });
  });
});
