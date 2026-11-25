import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLogin from "../AdminLogin";
import { AdminAuthProvider } from "../../auth/AdminAuthContext";

vi.mock("../../api/client", () => ({
  adminLogin: vi.fn(),
  getAdminMe: vi.fn(),
  getStoredAdminToken: vi.fn().mockReturnValue(null),
  storeAdminToken: vi.fn(),
  clearStoredAdminToken: vi.fn(),
  errorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Invalid admin ID or password",
}));

import { adminLogin } from "../../api/client";

const adminLoginMock = vi.mocked(adminLogin);

describe("AdminLogin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the admin login form with inputs", () => {
    render(
      <MemoryRouter>
        <AdminAuthProvider>
          <AdminLogin />
        </AdminAuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Admin Portal Login")).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign In to Admin Console/i }),
    ).toBeInTheDocument();
  });

  it("shows error when submitting wrong credentials", async () => {
    adminLoginMock.mockRejectedValue(
      new Error("Invalid admin ID or password"),
    );

    render(
      <MemoryRouter>
        <AdminAuthProvider>
          <AdminLogin />
        </AdminAuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Admin ID/i), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Sign In to Admin Console/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByText("Invalid admin ID or password"),
      ).toBeInTheDocument();
    });
  });
});
