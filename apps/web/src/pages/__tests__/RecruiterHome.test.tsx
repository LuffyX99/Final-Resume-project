import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../types";
import RecruiterHome from "../RecruiterHome";

vi.mock("../../api/client", () => ({
  getMyJobs: vi.fn(),
  closeJob: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { closeJob, getMyJobs } from "../../api/client";

const getMyJobsMock = vi.mocked(getMyJobs);
const closeJobMock = vi.mocked(closeJob);

const baseJob: Job = {
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build APIs",
  skills: ["Python"],
  required_skills: ["Python"],
  extracted_skills: ["Python"],
  location: null,
  experience: null,
  job_type: null,
  status: "open",
  recruiter_id: "recruiter-1",
  applicant_count: 4,
  shortlisted_count: 1,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: null,
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <RecruiterHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("RecruiterHome", () => {
  it("loads my jobs from the API and shows status and counts", async () => {
    getMyJobsMock.mockResolvedValue([baseJob]);
    renderDashboard();

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(getMyJobsMock).toHaveBeenCalledWith(0, 10, undefined);

    const row = screen.getByRole("row", { name: /Backend Engineer/ });
    expect(within(row).getByText("Open")).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/jobs/job-1/edit",
    );
    expect(
      within(row).getByRole("link", { name: "Applicants" }),
    ).toHaveAttribute("href", "/jobs/job-1/applicants");
  });

  it("re-fetches the list after closing a job instead of patching the row", async () => {
    const closedJob = { ...baseJob, status: "closed" };
    getMyJobsMock
      .mockResolvedValueOnce([baseJob])
      .mockResolvedValueOnce([closedJob]);
    closeJobMock.mockResolvedValue(closedJob);

    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText("Backend Engineer");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(closeJobMock).toHaveBeenCalledWith("job-1"));
    await waitFor(() => expect(getMyJobsMock).toHaveBeenCalledTimes(2));

    const refreshedRow = await screen.findByRole("row", {
      name: /Backend Engineer/,
    });
    expect(within(refreshedRow).getByText("Closed")).toBeInTheDocument();
    expect(
      within(refreshedRow).getByRole("button", { name: "Close" }),
    ).toBeDisabled();
  });

  it("shows an error and keeps the current row when close fails", async () => {
    getMyJobsMock.mockResolvedValue([baseJob]);
    closeJobMock.mockRejectedValue(new Error("Cannot close this job"));

    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText("Backend Engineer");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot close this job",
    );
    expect(getMyJobsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });

  it("filters through the API and resets to the first page", async () => {
    getMyJobsMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() =>
      expect(getMyJobsMock).toHaveBeenCalledWith(0, 10, undefined),
    );
    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() =>
      expect(getMyJobsMock).toHaveBeenLastCalledWith(0, 10, "open"),
    );
  });

  it("requests the next page from the API", async () => {
    const jobs = Array.from({ length: 10 }, (_, index) => ({
      ...baseJob,
      id: `job-${index + 1}`,
      title: `Role ${index + 1}`,
    }));
    getMyJobsMock.mockResolvedValue(jobs);

    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText("Role 1");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(getMyJobsMock).toHaveBeenCalledWith(10, 10, undefined),
    );
  });

  it("shows the empty state and the post-job CTA", async () => {
    getMyJobsMock.mockResolvedValue([]);
    renderDashboard();

    expect(
      await screen.findByText(/No jobs yet\. Post your first role/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post a job/ })).toHaveAttribute(
      "href",
      "/jobs/new",
    );
  });

  it("shows a retry state when the first load fails", async () => {
    getMyJobsMock.mockRejectedValue(new Error("Network down"));
    renderDashboard();

    expect(
      await screen.findByText("Could not load your jobs"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
