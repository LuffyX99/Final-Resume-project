import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CandidateHome from "../CandidateHome";
import { makeApplication, makeJob } from "../../test/fixtures";

vi.mock("../../api/client", () => ({
  getPublicJobs: vi.fn(),
  getMyApplications: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getMyApplications, getPublicJobs } from "../../api/client";

const getPublicJobsMock = vi.mocked(getPublicJobs);
const getMyApplicationsMock = vi.mocked(getMyApplications);

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("CandidateHome", () => {
  it("lists every open job and marks jobs already applied to", async () => {
    const job = makeJob();
    getPublicJobsMock.mockResolvedValue([job]);
    getMyApplicationsMock.mockResolvedValue([
      makeApplication(job, { status: "shortlisted" }),
    ]);

    renderPage();

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(getPublicJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, limit: 12 }),
    );
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My Applications/ })).toHaveAttribute(
      "href",
      "/applications",
    );
  });

  it("sends search text to the API after debouncing", async () => {
    getPublicJobsMock.mockResolvedValue([]);
    getMyApplicationsMock.mockResolvedValue([]);
    renderPage();

    await screen.findByText("No open roles yet.");
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "python" },
    });

    await waitFor(
      () =>
        expect(getPublicJobsMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "python", skip: 0 }),
        ),
      { timeout: 1500 },
    );
  });

  it("passes job-type filters to the API and resets to page 1", async () => {
    getPublicJobsMock.mockResolvedValue([]);
    getMyApplicationsMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No open roles yet.");
    await user.selectOptions(screen.getByLabelText("Job type"), "contract");

    await waitFor(() =>
      expect(getPublicJobsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ job_type: "contract", skip: 0 }),
      ),
    );
  });

  it("requests the next page from the public jobs API", async () => {
    const jobs = Array.from({ length: 12 }, (_, index) =>
      makeJob({
        id: `job-${index + 1}`,
        title: `Role ${index + 1}`,
      }),
    );
    getPublicJobsMock.mockResolvedValue(jobs);
    getMyApplicationsMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Role 1");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(getPublicJobsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 12 }),
      ),
    );
  });
});
