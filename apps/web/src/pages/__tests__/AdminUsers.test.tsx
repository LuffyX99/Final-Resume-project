import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "../AdminUsers";
import type { AdminUserItem } from "../../types";

vi.mock("../../api/client", () => ({
  getAdminUsers: vi.fn(),
  updateAdminUserStatus: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { getAdminUsers, updateAdminUserStatus } from "../../api/client";

const getAdminUsersMock = vi.mocked(getAdminUsers);
const updateAdminUserStatusMock = vi.mocked(updateAdminUserStatus);

const mockUser: AdminUserItem = {
  id: "u-1",
  role: "candidate",
  full_name: "Alice Candidate",
  email: "alice@example.com",
  phone_number: "+1234567890",
  age: 26,
  gender: "female",
  is_active: true,
  created_at: "2026-01-10T00:00:00Z",
  resumes_count: 2,
  jobs_count: 0,
  applications_count: 3,
};

describe("AdminUsers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders user directory with status and actions", async () => {
    getAdminUsersMock.mockResolvedValue({
      items: [mockUser],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Alice Candidate")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
  });

  it("opens details modal and displays full user profile", async () => {
    const user = userEvent.setup();
    getAdminUsersMock.mockResolvedValue({
      items: [mockUser],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    const detailsBtn = await screen.findByRole("button", { name: "Details" });
    await user.click(detailsBtn);

    expect(screen.getByText("User Profile Inspection")).toBeInTheDocument();
    expect(screen.getByText("+1234567890")).toBeInTheDocument();
    expect(screen.getByText("26 yrs / female")).toBeInTheDocument();
    expect(screen.getByText(/2 resume files uploaded/)).toBeInTheDocument();
  });

  it("deactivates user through confirmation modal", async () => {
    const user = userEvent.setup();
    getAdminUsersMock.mockResolvedValue({
      items: [mockUser],
      total: 1,
      page: 1,
      page_size: 10,
      has_more: false,
    });
    updateAdminUserStatusMock.mockResolvedValue({
      ...mockUser,
      is_active: false,
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    const deactivateBtn = await screen.findByRole("button", { name: "Deactivate" });
    await user.click(deactivateBtn);

    expect(screen.getByText("Deactivate Account?")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm Deactivation" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(updateAdminUserStatusMock).toHaveBeenCalledWith("u-1", false);
    });
  });
});
