import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "../AdminDashboard";
import { AdminAuthProvider } from "../../auth/AdminAuthContext";
import type { AdminMetrics } from "../../types";

vi.mock("../../api/client", () => ({
  getAdminMetrics: vi.fn(),
  getAdminCandidates: vi.fn().mockResolvedValue({
    items: [
      {
        id: "cand-uuid-1",
        role: "candidate",
        full_name: "John Candidate",
        email: "john@example.com",
        phone_number: "+1234567890",
        age: 28,
        gender: "Male",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        resumes_count: 1,
        jobs_count: 0,
        applications_count: 2,
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  }),
  getAdminRecruiters: vi.fn().mockResolvedValue({
    items: [
      {
        id: "rec-uuid-1",
        role: "recruiter",
        full_name: "Sarah Recruiter",
        email: "sarah@acme.com",
        phone_number: "+1987654321",
        company_name: "Acme Corp",
        industry: "Technology",
        age: null,
        gender: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        resumes_count: 0,
        jobs_count: 3,
        applications_count: 0,
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  }),
  getAdminJobs: vi.fn().mockResolvedValue({
    items: [
      {
        id: "job-uuid-1",
        title: "Senior Backend Developer",
        company: "Acme Corp",
        status: "open",
        is_taken_down: false,
        takedown_reason: null,
        recruiter_id: "rec-uuid-1",
        recruiter_name: "Sarah Recruiter",
        recruiter_email: "sarah@acme.com",
        applicant_count: 5,
        shortlisted_count: 2,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  }),
  getAdminShortlisted: vi.fn().mockResolvedValue({
    items: [
      {
        id: "app-uuid-1",
        application_id: "app-uuid-1",
        job_id: "job-uuid-1",
        job_title: "Senior Backend Developer",
        job_company: "Acme Corp",
        recruiter_id: "rec-uuid-1",
        recruiter_name: "Sarah Recruiter",
        recruiter_email: "sarah@acme.com",
        candidate_id: "cand-uuid-1",
        candidate_name: "John Candidate",
        candidate_email: "john@example.com",
        status: "shortlisted",
        similarity_score: 0.9,
        trust_score: 0.95,
        final_score: 92,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  }),
  getStoredAdminToken: vi.fn().mockReturnValue("admin-test-token"),
  getAdminMe: vi.fn().mockResolvedValue({
    id: "admin",
    role: "admin",
    full_name: "Platform Administrator",
  }),
  storeAdminToken: vi.fn(),
  clearStoredAdminToken: vi.fn(),
  errorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Error",
}));

import { getAdminMetrics, getAdminCandidates, getAdminRecruiters, getAdminJobs, getAdminShortlisted } from "../../api/client";

const getAdminMetricsMock = vi.mocked(getAdminMetrics);
const getAdminCandidatesMock = vi.mocked(getAdminCandidates);
const getAdminRecruitersMock = vi.mocked(getAdminRecruiters);
const getAdminJobsMock = vi.mocked(getAdminJobs);
const getAdminShortlistedMock = vi.mocked(getAdminShortlisted);

const mockMetrics: AdminMetrics = {
  total_candidates: 50,
  total_recruiters: 20,
  total_jobs: 30,
  open_jobs: 25,
  closed_jobs: 5,
  total_applications: 120,
  total_shortlisted: 40,
  open_support_tickets: 3,
  resolved_support_tickets: 10,
};

function setupMocks() {
  getAdminMetricsMock.mockResolvedValue(mockMetrics);
  getAdminCandidatesMock.mockResolvedValue({
    items: [
      {
        id: "cand-uuid-1",
        role: "candidate",
        full_name: "John Candidate",
        email: "john@example.com",
        phone_number: "+1234567890",
        age: 28,
        gender: "Male",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        resumes_count: 1,
        jobs_count: 0,
        applications_count: 2,
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  });
  getAdminRecruitersMock.mockResolvedValue({
    items: [
      {
        id: "rec-uuid-1",
        role: "recruiter",
        full_name: "Sarah Recruiter",
        email: "sarah@acme.com",
        phone_number: "+1987654321",
        company_name: "Acme Corp",
        industry: "Technology",
        age: null,
        gender: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        resumes_count: 0,
        jobs_count: 3,
        applications_count: 0,
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  });
  getAdminJobsMock.mockResolvedValue({
    items: [
      {
        id: "job-uuid-1",
        title: "Senior Backend Developer",
        company: "Acme Corp",
        status: "open",
        is_taken_down: false,
        takedown_reason: null,
        recruiter_id: "rec-uuid-1",
        recruiter_name: "Sarah Recruiter",
        recruiter_email: "sarah@acme.com",
        applicant_count: 5,
        shortlisted_count: 2,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  });
  getAdminShortlistedMock.mockResolvedValue({
    items: [
      {
        id: "app-uuid-1",
        application_id: "app-uuid-1",
        job_id: "job-uuid-1",
        job_title: "Senior Backend Developer",
        job_company: "Acme Corp",
        recruiter_id: "rec-uuid-1",
        recruiter_name: "Sarah Recruiter",
        recruiter_email: "sarah@acme.com",
        candidate_id: "cand-uuid-1",
        candidate_name: "John Candidate",
        candidate_email: "john@example.com",
        status: "shortlisted",
        similarity_score: 0.9,
        trust_score: 0.95,
        final_score: 92,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    has_more: false,
  });
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders overview metrics and navigation tabs", async () => {
    getAdminMetricsMock.mockResolvedValue(mockMetrics);

    render(
      <MemoryRouter>
        <AdminAuthProvider>
          <AdminDashboard />
        </AdminAuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Platform Admin Center")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("40")).toBeInTheDocument();
    });
  });

  it("switches tabs to candidates, recruiters, jobs, and shortlisted", async () => {
    getAdminMetricsMock.mockResolvedValue(mockMetrics);

    render(
      <MemoryRouter>
        <AdminAuthProvider>
          <AdminDashboard />
        </AdminAuthProvider>
      </MemoryRouter>,
    );

    // Candidates Tab
    fireEvent.click(screen.getAllByRole("button", { name: /Manage Candidates/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("Candidate Management")).toBeInTheDocument();
      expect(screen.getByText("John Candidate")).toBeInTheDocument();
    });

    // Recruiters Tab
    fireEvent.click(screen.getAllByRole("button", { name: /Manage Recruiters/i })[0]);
    await waitFor(() => {
      expect(
        screen.getByText("Recruiter Directory & Account Provisioning"),
      ).toBeInTheDocument();
      expect(screen.getByText("Sarah Recruiter")).toBeInTheDocument();
    });

    // Jobs Tab
    fireEvent.click(screen.getAllByRole("button", { name: /Manage Job Posts/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("Job Posts Oversight")).toBeInTheDocument();
      expect(screen.getByText("Senior Backend Developer")).toBeInTheDocument();
    });

    // Shortlisted Tab
    fireEvent.click(
      screen.getAllByRole("button", { name: /Shortlisted Candidates/i })[0],
    );
    await waitFor(() => {
      expect(
        screen.getByText("Shortlisted Candidates Directory"),
      ).toBeInTheDocument();
      expect(screen.getByText("John Candidate")).toBeInTheDocument();
    });
  });
});
