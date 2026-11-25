import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetail from "../JobDetail";
import { makeApplication, makeJob } from "../../test/fixtures";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "candidate-1",
      role: "candidate",
      full_name: "Test Candidate",
      email: "candidate@example.com",
      age: 29,
      gender: "female",
      phone_number: "+919876543210",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    },
    loading: false,
  }),
}));

vi.mock("../../api/client", () => ({
  getJob: vi.fn(),
  getJobMatches: vi.fn(),
  getMyApplications: vi.fn(),
  computeMatches: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import {
  computeMatches,
  getJob,
  getJobMatches,
  getMyApplications,
} from "../../api/client";

const getJobMock = vi.mocked(getJob);
const getJobMatchesMock = vi.mocked(getJobMatches);
const getMyApplicationsMock = vi.mocked(getMyApplications);
const computeMatchesMock = vi.mocked(computeMatches);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/job-1"]}>
      <Routes>
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getJobMock.mockResolvedValue(makeJob());
  getJobMatchesMock.mockResolvedValue([]);
  getMyApplicationsMock.mockResolvedValue([]);
});

describe("JobDetail for candidates", () => {
  it("shows the job and Apply CTA without requesting recruiter matches", async () => {
    renderPage();

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Build APIs with Python/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute(
      "href",
      "/jobs/job-1/apply",
    );
    expect(screen.queryByText("Matching Candidates")).not.toBeInTheDocument();
    expect(getJobMatchesMock).not.toHaveBeenCalled();
    expect(computeMatchesMock).not.toHaveBeenCalled();
  });

  it("shows the candidate's existing application status and score", async () => {
    getMyApplicationsMock.mockResolvedValue([
      makeApplication(makeJob(), { status: "shortlisted" }),
    ]);
    renderPage();

    expect(await screen.findByText("Your application")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View My Applications" }),
    ).toHaveAttribute("href", "/applications");
    expect(
      screen.queryByRole("link", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });
});
