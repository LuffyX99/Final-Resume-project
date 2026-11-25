import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationDetail as ApplicationDetailData } from "../../types";
import ApplicationDetail from "../ApplicationDetail";

const { authUser } = vi.hoisted(() => ({
  authUser: {
    id: "recruiter-1",
    role: "recruiter",
    full_name: "Jane Recruiter",
    email: "jane@acme.com",
    is_active: true,
  },
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: authUser,
    loading: false,
    refreshUser: vi.fn(),
  }),
}));

vi.mock("../../api/client", () => ({
  getJobApplication: vi.fn(),
  updateMatch: vi.fn(),
  sendShortlistInvite: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getJobApplication, updateMatch } from "../../api/client";

const getJobApplicationMock = vi.mocked(getJobApplication);
const updateMatchMock = vi.mocked(updateMatch);

const application: ApplicationDetailData = {
  job: {
    id: "job-1",
    title: "Backend Engineer",
    company: "Acme",
    description: "Build APIs",
    skills: ["Python", "FastAPI", "PostgreSQL"],
    required_skills: ["Python", "FastAPI", "PostgreSQL"],
    extracted_skills: ["Python", "FastAPI", "PostgreSQL"],
    location: null,
    experience: null,
    job_type: null,
    status: "open",
    recruiter_id: "recruiter-1",
    applicant_count: 3,
    shortlisted_count: 0,
    created_at: "2026-01-05T00:00:00Z",
    updated_at: null,
  },
  match: {
    id: "match-1",
    job_id: "job-1",
    resume_id: "resume-1",
    similarity_score: 0.8,
    bias_reduced: false,
    shortlisted: false,
    created_at: "2026-01-06T00:00:00Z",
    candidate_name: "Alice Candidate",
    candidate_skills: ["Python", "FastAPI"],
    job_company: "Acme",
  },
  resume: {
    id: "resume-1",
    candidate_name: "Alice Candidate",
    content:
      "Built FastAPI services and PostgreSQL pipelines for a payments platform.",
    skills: ["Python", "FastAPI"],
    file_name: "alice.pdf",
    candidate_id: "candidate-1",
    created_at: "2026-01-06T00:00:00Z",
  },
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={["/jobs/job-1/applicants/match-1"]}
    >
      <Routes>
        <Route
          path="/jobs/:jobId/applicants/:matchId"
          element={<ApplicationDetail />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ApplicationDetail", () => {
  it("renders the live application, scores, and skill alignment", async () => {
    getJobApplicationMock.mockResolvedValue(application);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Alice Candidate" }),
    ).toBeInTheDocument();
    expect(getJobApplicationMock).toHaveBeenCalledWith("job-1", "match-1");
    expect(
      screen.getByText(/Built FastAPI services and PostgreSQL pipelines/),
    ).toBeInTheDocument();
    expect(screen.getByText("alice.pdf", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 required skills matched/)).toBeInTheDocument();
  });

  it("toggles shortlist through the API and re-fetches the application", async () => {
    getJobApplicationMock
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce({
        ...application,
        match: { ...application.match, shortlisted: true },
        job: { ...application.job, shortlisted_count: 1 },
      });
    updateMatchMock.mockResolvedValue({
      ...application.match,
      shortlisted: true,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Alice Candidate" });
    await user.click(
      screen.getByRole("button", { name: "Shortlist candidate" }),
    );

    expect(updateMatchMock).toHaveBeenCalledWith("match-1", {
      shortlisted: true,
    });
    await waitFor(() =>
      expect(getJobApplicationMock).toHaveBeenCalledTimes(2),
    );
    expect(screen.getAllByText("Shortlisted").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Shortlisted" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a retry state when the application cannot be opened", async () => {
    getJobApplicationMock.mockRejectedValue(
      new Error("You do not have permission to perform this action"),
    );
    renderPage();

    expect(
      await screen.findByText("Could not open this application"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to perform this action"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
