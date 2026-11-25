import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyApplications from "../MyApplications";
import { makeApplication, makeJob } from "../../test/fixtures";

vi.mock("../../api/client", () => ({
  getMyApplications: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getMyApplications } from "../../api/client";

const getMyApplicationsMock = vi.mocked(getMyApplications);

function renderPage(initialEntry = "/applications") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MyApplications />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("MyApplications", () => {
  it("shows live status and scores for each application", async () => {
    const job = makeJob();
    getMyApplicationsMock.mockResolvedValue([
      makeApplication(job, { status: "shortlisted" }),
    ]);

    renderPage();

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("resume.docx")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Backend Engineer/ }),
    ).toHaveAttribute("href", "/jobs/job-1");
  });

  it("opens and closes the Skill Gap analysis modal", async () => {
    const job = makeJob();
    const app = makeApplication(job, {
      readiness_score: 85,
      skill_gap_analysis: {
        readiness_score: 85,
        matched_skills: ["Python"],
        missing_skills: ["PostgreSQL"],
        stale_skills: [],
        critical_missing_skills: [],
        learning_steps: [
          {
            skill: "PostgreSQL",
            status: "missing",
            priority: 1,
            title: "Learn PostgreSQL Fundamentals",
            action: "Study relational schemas, indexing, and query plans.",
            resource_hint: "Official documentation",
            estimated_time: "1-2 weeks",
          },
        ],
      },
    });
    getMyApplicationsMock.mockResolvedValue([app]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Backend Engineer");
    const skillGapBtn = screen.getByRole("button", { name: /Skill Gap/i });
    await user.click(skillGapBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText("Skill Gap & Readiness Analysis"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("85%")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Learn PostgreSQL Fundamentals"),
    ).toBeInTheDocument();

    const closeBtn = within(dialog).getByRole("button", { name: "Close dialog" });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(
        screen.queryByText("Skill Gap & Readiness Analysis"),
      ).not.toBeInTheDocument();
    });
  });

  it("re-fetches applications when Refresh is clicked", async () => {
    getMyApplicationsMock.mockResolvedValue([makeApplication()]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Backend Engineer");
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(getMyApplicationsMock).toHaveBeenCalledTimes(2),
    );
  });

  it("shows the empty state and browse CTA", async () => {
    getMyApplicationsMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText(
        "No applications yet. Browse open roles to apply.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse open roles" }),
    ).toHaveAttribute("href", "/candidate");
  });

  it("shows the retry state when applications fail to load", async () => {
    getMyApplicationsMock.mockRejectedValue(new Error("Network down"));
    renderPage();

    expect(
      await screen.findByText("Could not load your applications"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the post-submit notice", async () => {
    getMyApplicationsMock.mockResolvedValue([]);
    renderPage({
      pathname: "/applications",
      state: { notice: "Application submitted for Backend Engineer." },
    } as never);

    expect(
      await screen.findByText("Application submitted for Backend Engineer."),
    ).toBeInTheDocument();
  });
});
