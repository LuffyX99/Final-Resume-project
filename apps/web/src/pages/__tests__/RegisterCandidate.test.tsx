import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegisterCandidate from "../RegisterCandidate";

const startSessionMock = vi.fn();

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    startSession: startSessionMock,
    user: null,
  }),
}));

vi.mock("../../api/client", () => ({
  registerCandidate: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { registerCandidate } from "../../api/client";

const registerCandidateMock = vi.mocked(registerCandidate);

describe("RegisterCandidate without OTP verification requirement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("enables Create Account button directly and submits registration without OTP", async () => {
    const user = userEvent.setup();

    registerCandidateMock.mockResolvedValue({
      access_token: "test-token",
      token_type: "bearer",
      expires_in: 1800,
      user: {
        id: "cand-1",
        role: "candidate",
        full_name: "John Doe",
        email: "john@example.com",
        age: 25,
        gender: "male",
        phone_number: "+919876543210",
        is_active: true,
        created_at: new Date().toISOString(),
      },
    });

    render(
      <MemoryRouter>
        <RegisterCandidate />
      </MemoryRouter>,
    );

    // Verify OTP component is not rendered
    expect(screen.queryByRole("button", { name: /send otp/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("6-digit OTP")).not.toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Create Account" });
    expect(submitBtn).toBeEnabled();

    // Fill form fields
    await user.type(screen.getByLabelText("Full Name"), "John Doe");
    await user.type(screen.getByLabelText("Age"), "25");
    await user.type(screen.getByLabelText("Gender"), "male");
    await user.type(screen.getByLabelText("Email"), "john@example.com");
    await user.type(screen.getByLabelText("Phone Number"), "+919876543210");
    await user.type(screen.getByLabelText("Password"), "StrongPass123!");
    await user.type(screen.getByLabelText("Confirm Password"), "StrongPass123!");

    await user.click(submitBtn);

    await waitFor(() => {
      expect(registerCandidateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: "John Doe",
          age: 25,
          gender: "male",
          email: "john@example.com",
          password: "StrongPass123!",
          confirm_password: "StrongPass123!",
        }),
      );
      expect(startSessionMock).toHaveBeenCalled();
    });
  });

  it("displays error message if registration fails", async () => {
    const user = userEvent.setup();

    registerCandidateMock.mockRejectedValue(new Error("Email already registered"));

    render(
      <MemoryRouter>
        <RegisterCandidate />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Full Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Age"), "26");
    await user.type(screen.getByLabelText("Gender"), "female");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Phone Number"), "+919876543211");
    await user.type(screen.getByLabelText("Password"), "StrongPass123!");
    await user.type(screen.getByLabelText("Confirm Password"), "StrongPass123!");

    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeInTheDocument();
    });
  });
});
