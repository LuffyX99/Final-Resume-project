import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminJobs from "../AdminJobs";
import type { AdminJobItem, AdminApplicationItem } from "../../types";

vi.mock("../../api/client", () => ({
  getAdminJobs: vi.fn(),
  getAdminApplications: vi.fn(),
  takedownJob: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getAdminJobs, getAdminApplications, takedownJob } from "../../api/client";

const getAdminJobsMock = vi.mocked(getAdminJobs);
const getAdminApplicationsMock = vi.mocked(getAdminApplications);
const takedownJobMock = vi.mocked(takedownJob);

const mockJob: AdminJobItem = {
  id: "job-1",
  title: "Frontend Engineer",
  company: "TechCorp",
  status: "open",
  is_taken_down: false,
  takedown_reason: null,
  recruiter_id: "rec-1",
  recruiter_name: "Bob Recruiter",
  recruiter_email: "bob@techcorp.com",
  applicant_count: 5,
  shortlisted_count: 2,
  created_at: "2026-01-05T00:00:00Z",
};

const mockApp: AdminApplicationItem = {
  id: "app-1",
  job_id: "job-1",
  candidate_id: "cand-1",
  job_title: "Frontend Engineer",
  job_company: "TechCorp",
  candidate_name: "Alice Candidate",
  candidate_email: "alice@example.com",
  status: "shortlisted",
  final_score: 0.88,
  similarity_score: 0.85,
  trust_score: 1.0,
  readiness_score: 90.0,
  created_at: "2026-01-06T00:00:00Z",
};

describe("AdminJobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders jobs directory and executes takedown action with reason", async () => {
    const user = userEvent.setup();
    getAdminJobsMock.mockResolvedValue({
      items: [mockJob],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });
    takedownJobMock.mockResolvedValue({
      ...mockJob,
      status: "closed",
      is_taken_down: true,
      takedown_reason: "Violates terms of service",
    });

    render(
      <MemoryRouter>
        <AdminJobs />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("TechCorp")).toBeInTheDocument();
    expect(screen.getByText("Bob Recruiter")).toBeInTheDocument();

    const takedownBtn = screen.getByRole("button", { name: "Take Down" });
    await user.click(takedownBtn);

    expect(screen.getByText("Take Down Inappropriate Job Listing")).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/Explain why this posting is being removed/);
    await user.type(reasonInput, "Violates terms of service");

    const submitBtn = screen.getByRole("button", { name: "Confirm Takedown" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(takedownJobMock).toHaveBeenCalledWith("job-1", "Violates terms of service");
    });
  });

  it("switches to applications tab and renders candidate submissions", async () => {
    const user = userEvent.setup();
    getAdminJobsMock.mockResolvedValue({
      items: [mockJob],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });
    getAdminApplicationsMock.mockResolvedValue({
      items: [mockApp],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });

    render(
      <MemoryRouter>
        <AdminJobs />
      </MemoryRouter>,
    );

    const appsTabBtn = await screen.findByRole("button", { name: /All Applications/ });
    await user.click(appsTabBtn);

    expect(await screen.findByText("Alice Candidate")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
  });
});
