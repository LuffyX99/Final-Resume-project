import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../types";
import EditJob from "../EditJob";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "recruiter-1",
      role: "recruiter",
      full_name: "Riley Recruiter",
      email: "riley@example.com",
      age: null,
      gender: null,
      phone_number: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    },
    loading: false,
  }),
}));

vi.mock("../../api/client", () => ({
  getJob: vi.fn(),
  updateJob: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getJob, updateJob } from "../../api/client";

const getJobMock = vi.mocked(getJob);
const updateJobMock = vi.mocked(updateJob);

const job: Job = {
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build reliable APIs.",
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/job-1/edit"]}>
      <Routes>
        <Route path="/jobs/:id/edit" element={<EditJob />} />
        <Route path="/recruiter" element={<div>Dashboard landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("EditJob", () => {
  it("prefills the live job and saves the edited fields", async () => {
    getJobMock.mockResolvedValue(job);
    updateJobMock.mockResolvedValue({ ...job, title: "Staff Engineer" });

    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByLabelText("Job title");
    expect(title).toHaveValue("Backend Engineer");
    expect(screen.getByLabelText("Company")).toHaveValue("Acme");
    expect(screen.getByLabelText("Job description")).toHaveValue(
      "Build reliable APIs.",
    );
    expect(screen.getByLabelText("Required skills")).toBeInTheDocument();
    expect(getJobMock).toHaveBeenCalledWith("job-1");

    await user.clear(title);
    await user.type(title, "Staff Engineer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateJobMock).toHaveBeenCalledWith("job-1", {
        title: "Staff Engineer",
        company: "Acme",
        description: "Build reliable APIs.",
        required_skills: ["Python", "PostgreSQL"],
      }),
    );
    expect(await screen.findByText("Dashboard landing")).toBeInTheDocument();
  });

  it("blocks a recruiter who does not own the job", async () => {
    getJobMock.mockResolvedValue({ ...job, recruiter_id: "someone-else" });
    renderPage();

    expect(
      await screen.findByText(
        "You do not have permission to edit this job.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });

  it("shows an API error and stays on the form", async () => {
    getJobMock.mockResolvedValue(job);
    updateJobMock.mockRejectedValue(new Error("Could not save changes"));

    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Job title");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save changes",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});
