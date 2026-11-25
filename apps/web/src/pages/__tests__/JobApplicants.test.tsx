import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, Match } from "../../types";
import JobApplicants from "../JobApplicants";

vi.mock("../../api/client", () => ({
  getJob: vi.fn(),
  getJobMatches: vi.fn(),
  updateMatch: vi.fn(),
  computeMatches: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import {
  computeMatches,
  getJob,
  getJobMatches,
  updateMatch,
} from "../../api/client";

const getJobMock = vi.mocked(getJob);
const getJobMatchesMock = vi.mocked(getJobMatches);
const updateMatchMock = vi.mocked(updateMatch);
const computeMatchesMock = vi.mocked(computeMatches);

const job: Job = {
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build APIs with Python and PostgreSQL",
  skills: ["Python", "PostgreSQL"],
  required_skills: ["Python", "PostgreSQL"],
  extracted_skills: ["Python", "PostgreSQL"],
  location: null,
  experience: null,
  job_type: null,
  status: "open",
  recruiter_id: "recruiter-1",
  applicant_count: 2,
  shortlisted_count: 0,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: null,
};

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: "match-1",
    job_id: job.id,
    resume_id: "resume-1",
    similarity_score: 0.6,
    bias_reduced: false,
    shortlisted: false,
    created_at: "2026-01-06T00:00:00Z",
    candidate_name: "Alice",
    candidate_skills: ["python", "postgresql"],
    job_company: "Acme",
    ...overrides,
  };
}

const alice = makeMatch({ id: "match-alice", candidate_name: "Alice" });
const bob = makeMatch({
  id: "match-bob",
  candidate_name: "Bob",
  similarity_score: 0.95,
  candidate_skills: [],
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/job-1/applicants"]}>
      <Routes>
        <Route path="/jobs/:id/applicants" element={<JobApplicants />} />
        <Route
          path="/jobs/:jobId/applicants/:matchId"
          element={<div>Application detail page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getJobMock.mockResolvedValue(job);
});

describe("JobApplicants", () => {
  it("ranks by final score rather than the API's similarity order", async () => {
    getJobMatchesMock.mockResolvedValue([bob, alice]);
    renderPage();

    await screen.findByText("Alice");
    const rows = screen.getAllByRole("row");

    expect(getJobMock).toHaveBeenCalledWith("job-1");
    expect(getJobMatchesMock).toHaveBeenCalledWith("job-1", 100);
    expect(rows[1]).toHaveTextContent("Alice");
    expect(rows[2]).toHaveTextContent("Bob");
    expect(within(rows[1]).getByText("74%")).toBeInTheDocument();
    expect(within(rows[1]).getByText("01")).toBeInTheDocument();
    expect(within(rows[2]).getByText("02")).toBeInTheDocument();
    expect(within(rows[1]).getAllByText("100%").length).toBeGreaterThanOrEqual(1);
    expect(within(rows[2]).getByText("62%")).toBeInTheDocument();
  });

  it("shows matched and missing skills and links to application details", async () => {
    getJobMatchesMock.mockResolvedValue([alice, bob]);
    renderPage();

    await screen.findByText("Alice");
    const aliceRow = screen.getByRole("row", { name: /Alice/ });
    const bobRow = screen.getByRole("row", { name: /Bob/ });

    expect(within(aliceRow).getByText("Python")).toBeInTheDocument();
    expect(within(aliceRow).getByText("PostgreSQL")).toBeInTheDocument();
    expect(within(bobRow).getAllByText("Python").length).toBeGreaterThan(0);
    expect(within(bobRow).getByText("PostgreSQL")).toBeInTheDocument();
    expect(
      within(aliceRow).getByRole("link", { name: "Alice" }),
    ).toHaveAttribute("href", "/jobs/job-1/applicants/match-alice");
  });

  it("toggles shortlist through the API and re-fetches the list", async () => {
    getJobMatchesMock
      .mockResolvedValueOnce([alice])
      .mockResolvedValueOnce([{ ...alice, shortlisted: true }]);
    updateMatchMock.mockResolvedValue({ ...alice, shortlisted: true });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Alice");
    await user.click(screen.getByRole("button", { name: "Shortlist" }));

    expect(updateMatchMock).toHaveBeenCalledWith("match-alice", {
      shortlisted: true,
    });
    await waitFor(() => expect(getJobMatchesMock).toHaveBeenCalledTimes(2));

    const row = await screen.findByRole("row", { name: /Alice/ });
    expect(
      within(row).getByRole("button", { name: "Shortlisted" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("computes matches when none exist, then re-fetches", async () => {
    getJobMatchesMock.mockResolvedValue([]);
    computeMatchesMock.mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("No ranked applicants yet"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Find matches" }));

    expect(computeMatchesMock).toHaveBeenCalledWith({ job_id: "job-1" });
    await waitFor(() => expect(getJobMatchesMock).toHaveBeenCalledTimes(2));
  });

  it("shows a retry state when applicants cannot be loaded", async () => {
    getJobMatchesMock.mockRejectedValue(new Error("Forbidden"));
    renderPage();

    expect(
      await screen.findByText("Could not load applicants"),
    ).toBeInTheDocument();
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
