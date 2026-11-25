import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddJob from "../AddJob";

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
  createJob: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { createJob } from "../../api/client";

const createJobMock = vi.mocked(createJob);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/new"]}>
      <Routes>
        <Route path="/jobs/new" element={<AddJob />} />
        <Route path="/recruiter" element={<div>Dashboard landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillRequiredFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Job title"), "Backend Engineer");
  await user.type(screen.getByLabelText("Company"), "Acme");
  await user.type(
    screen.getByLabelText("Job description"),
    "Build reliable APIs.",
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AddJob", () => {
  it("creates a job with tag-style required skills and returns to the dashboard", async () => {
    createJobMock.mockResolvedValue({
      id: "job-1",
      title: "Backend Engineer",
      company: "Acme",
      description: "Build reliable APIs.",
      skills: ["Python", "FastAPI"],
      required_skills: ["Python", "FastAPI"],
      extracted_skills: ["Python", "FastAPI"],
      location: null,
      experience: null,
      job_type: null,
      status: "open",
      recruiter_id: "recruiter-1",
      applicant_count: 0,
      shortlisted_count: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });

    renderPage();
    const user = await fillRequiredFields();

    const skillInput = screen.getByLabelText("Required skills");
    await user.type(skillInput, "Python{Enter}");
    await user.type(skillInput, "FastAPI{Enter}");

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("FastAPI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Post job" }));

    await waitFor(() =>
      expect(createJobMock).toHaveBeenCalledWith({
        title: "Backend Engineer",
        company: "Acme",
        description: "Build reliable APIs.",
        required_skills: ["Python", "FastAPI"],
      }),
    );
    expect(await screen.findByText("Dashboard landing")).toBeInTheDocument();
  });

  it("validates required fields before calling the API", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Post job" }));

    expect(await screen.findByText("Job title is required.")).toBeInTheDocument();
    expect(screen.getByText("Company is required.")).toBeInTheDocument();
    expect(screen.getByText("Job description is required.")).toBeInTheDocument();
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it("shows the API error and stays on the form when creation fails", async () => {
    createJobMock.mockRejectedValue(new Error("Could not create the job"));
    renderPage();
    const user = await fillRequiredFields();

    await user.click(screen.getByRole("button", { name: "Post job" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not create the job",
    );
    expect(screen.getByRole("button", { name: "Post job" })).toBeInTheDocument();
  });

  it("links the cancel action back to the dashboard", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/recruiter",
    );
  });
});
