import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailOTPVerification from "../EmailOTPVerification";

vi.mock("../../api/client", () => ({
  sendOTP: vi.fn(),
  verifyOTP: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import { sendOTP, verifyOTP } from "../../api/client";

const sendOTPMock = vi.mocked(sendOTP);
const verifyOTPMock = vi.mocked(verifyOTP);

describe("EmailOTPVerification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders send OTP button and handles successful OTP dispatch", async () => {
    const user = userEvent.setup();
    sendOTPMock.mockResolvedValue({
      message: "Verification code sent to your email.",
      cooldown_seconds: 60,
      expires_in: 300,
    });

    const onVerified = vi.fn();
    const onReset = vi.fn();

    render(
      <EmailOTPVerification
        email="test@example.com"
        fullName="Test User"
        verifiedEmail={null}
        onVerified={onVerified}
        onResetVerification={onReset}
      />,
    );

    expect(screen.getByText("Email Verification Required")).toBeInTheDocument();
    const sendBtn = screen.getByRole("button", { name: /send otp/i });
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);

    expect(sendOTPMock).toHaveBeenCalledWith({
      email: "test@example.com",
      full_name: "Test User",
    });

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("6-digit OTP"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /verify otp/i })).toBeInTheDocument();
      expect(screen.getByText(/resend in/i)).toBeInTheDocument();
    });
  });

  it("handles OTP verification with correct 6-digit code", async () => {
    const user = userEvent.setup();
    sendOTPMock.mockResolvedValue({
      message: "Verification code sent.",
      cooldown_seconds: 60,
      expires_in: 300,
    });
    verifyOTPMock.mockResolvedValue({
      message: "Email verified successfully.",
      verification_token: "mock-jwt-token-xyz",
    });

    const onVerified = vi.fn();
    const onReset = vi.fn();

    render(
      <EmailOTPVerification
        email="test@example.com"
        fullName="Test User"
        verifiedEmail={null}
        onVerified={onVerified}
        onResetVerification={onReset}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send otp/i }));

    const otpInput = await screen.findByPlaceholderText("6-digit OTP");
    await user.type(otpInput, "123456");

    const verifyBtn = screen.getByRole("button", { name: /verify otp/i });
    await user.click(verifyBtn);

    expect(verifyOTPMock).toHaveBeenCalledWith({
      email: "test@example.com",
      otp: "123456",
    });

    expect(onVerified).toHaveBeenCalledWith("test@example.com", "mock-jwt-token-xyz");
  });

  it("renders verified state when email is already verified", () => {
    const onVerified = vi.fn();
    const onReset = vi.fn();

    render(
      <EmailOTPVerification
        email="verified@example.com"
        verifiedEmail="verified@example.com"
        onVerified={onVerified}
        onResetVerification={onReset}
      />,
    );

    expect(screen.getByText("Email Verified")).toBeInTheDocument();
    expect(screen.getByText("(verified@example.com)")).toBeInTheDocument();
  });

  it("displays error message when OTP verification fails", async () => {
    const user = userEvent.setup();
    sendOTPMock.mockResolvedValue({
      message: "Verification code sent.",
      cooldown_seconds: 60,
      expires_in: 300,
    });
    verifyOTPMock.mockRejectedValue(new Error("Invalid verification code. 4 attempt(s) remaining."));

    const onVerified = vi.fn();
    const onReset = vi.fn();

    render(
      <EmailOTPVerification
        email="test@example.com"
        verifiedEmail={null}
        onVerified={onVerified}
        onResetVerification={onReset}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send otp/i }));

    const otpInput = await screen.findByPlaceholderText("6-digit OTP");
    await user.type(otpInput, "000000");

    await user.click(screen.getByRole("button", { name: /verify otp/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid verification code. 4 attempt\(s\) remaining./),
      ).toBeInTheDocument();
    });

    expect(onVerified).not.toHaveBeenCalled();
  });
});
