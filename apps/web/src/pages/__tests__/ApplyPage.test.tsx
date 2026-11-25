import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApplyPage from "../ApplyPage";
import { makeApplication, makeJob } from "../../test/fixtures";

const { authUser, refreshUserMock } = vi.hoisted(() => ({
  authUser: {
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
  refreshUserMock: vi.fn(),
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: authUser,
    loading: false,
    refreshUser: refreshUserMock,
  }),
}));

vi.mock("../../api/client", () => ({
  getJob: vi.fn(),
  getMyApplications: vi.fn(),
  submitApplication: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import {
  getJob,
  getMyApplications,
  submitApplication,
} from "../../api/client";

const getJobMock = vi.mocked(getJob);
const getMyApplicationsMock = vi.mocked(getMyApplications);
const submitApplicationMock = vi.mocked(submitApplication);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs/job-1/apply"]}>
      <Routes>
        <Route path="/jobs/:id/apply" element={<ApplyPage />} />
        <Route
          path="/applications"
          element={<div>Applications landing</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  refreshUserMock.mockResolvedValue(authUser);
  getJobMock.mockResolvedValue(makeJob());
  getMyApplicationsMock.mockResolvedValue([]);
});

describe("ApplyPage", () => {
  it("prefills profile details and submits one multipart application call", async () => {
    submitApplicationMock.mockResolvedValue(makeApplication());
    const user = userEvent.setup();
    renderPage();

    const fullName = await screen.findByLabelText("Full name");
    expect(fullName).toHaveValue("Test Candidate");
    expect(screen.getByLabelText("Email")).toHaveValue("candidate@example.com");
    expect(screen.getByLabelText("Phone number")).toHaveValue(
      "+919876543210",
    );

    await user.click(
      screen.getByRole("button", { name: "Continue to resume" }),
    );
    const file = new File(["%PDF-1.4"], "resume.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Resume file"), file);
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    await waitFor(() =>
      expect(submitApplicationMock).toHaveBeenCalledTimes(1),
    );
    expect(submitApplicationMock).toHaveBeenCalledWith({
      jobId: "job-1",
      fullName: "Test Candidate",
      phoneNumber: "+919876543210",
      age: 29,
      gender: "female",
      file,
    });
    expect(refreshUserMock).toHaveBeenCalled();
    expect(await screen.findByText("Applications landing")).toBeInTheDocument();
  });

  it("blocks step 1 until required personal details are valid", async () => {
    const user = userEvent.setup();
    renderPage();

    const fullName = await screen.findByLabelText("Full name");
    await user.clear(fullName);
    await user.click(
      screen.getByRole("button", { name: "Continue to resume" }),
    );

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit application" }),
    ).not.toBeInTheDocument();
  });

  it("rejects an invalid resume file before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Full name");
    await user.click(
      screen.getByRole("button", { name: "Continue to resume" }),
    );
    fireEvent.change(screen.getByLabelText("Resume file"), {
      target: {
        files: [new File(["hello"], "resume.txt", { type: "text/plain" })],
      },
    });
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    expect(
      await screen.findByText("Only PDF and DOCX resumes are supported."),
    ).toBeInTheDocument();
    expect(submitApplicationMock).not.toHaveBeenCalled();
  });

  it("shows an already-applied state instead of the form", async () => {
    getMyApplicationsMock.mockResolvedValue([
      makeApplication(makeJob(), { status: "shortlisted" }),
    ]);
    renderPage();

    expect(
      await screen.findByText("You have already applied to this role"),
    ).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("shows a duplicate error with a link to applications", async () => {
    submitApplicationMock.mockRejectedValue(
      new Error("You have already applied to this job."),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Full name");
    await user.click(
      screen.getByRole("button", { name: "Continue to resume" }),
    );
    await user.upload(
      screen.getByLabelText("Resume file"),
      new File(["%PDF-1.4"], "resume.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You have already applied to this job.");
    expect(
      screen.getByRole("link", { name: "View My Applications" }),
    ).toHaveAttribute("href", "/applications");
  });
});
