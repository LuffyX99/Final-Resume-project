import { useState, useEffect } from "react";
import { errorMessage, sendOTP, verifyOTP } from "../api/client";

interface EmailOTPVerificationProps {
  email: string;
  fullName?: string;
  verifiedEmail: string | null;
  onVerified: (email: string, token: string) => void;
  onResetVerification: () => void;
}

export default function EmailOTPVerification({
  email,
  fullName,
  verifiedEmail,
  onVerified,
  onResetVerification,
}: EmailOTPVerificationProps) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const isVerified = Boolean(
    verifiedEmail && verifiedEmail.toLowerCase() === normalizedEmail,
  );

  // Validate basic email structure before allowing Send OTP
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // If user changes email text after verification, reset verified state
  useEffect(() => {
    if (verifiedEmail && verifiedEmail.toLowerCase() !== normalizedEmail) {
      onResetVerification();
      setOtpSent(false);
      setOtpInput("");
      setError(null);
      setInfoMessage(null);
    }
  }, [normalizedEmail, verifiedEmail, onResetVerification]);

  async function handleSendOTP() {
    if (!isEmailValid) {
      setError("Please enter a valid email address first.");
      return;
    }

    try {
      setError(null);
      setSending(true);
      const res = await sendOTP({
        email: normalizedEmail,
        full_name: fullName?.trim() || undefined,
      });
      setOtpSent(true);
      setCooldown(res.cooldown_seconds || 60);
      setInfoMessage(res.message || "Verification code sent to your email.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyOTP() {
    const cleanOtp = otpInput.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter a valid 6-digit verification code.");
      return;
    }

    try {
      setError(null);
      setVerifying(true);
      const res = await verifyOTP({
        email: normalizedEmail,
        otp: cleanOtp,
      });
      setInfoMessage(res.message || "Email verified successfully!");
      onVerified(normalizedEmail, res.verification_token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  if (isVerified) {
    return (
      <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-accent/40 bg-emerald-accent/10 px-4 py-3 text-xs text-emerald-accent animate-fade-in shadow-[0_0_15px_rgba(16,185,129,0.15)]">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-accent animate-pulse" />
          <span className="font-semibold uppercase tracking-wider">
            Email Verified
          </span>
          <span className="font-mono text-base-300">({normalizedEmail})</span>
        </div>
        <button
          type="button"
          onClick={() => {
            onResetVerification();
            setOtpSent(false);
            setOtpInput("");
            setInfoMessage(null);
          }}
          className="text-base-400 hover:text-base-100 text-[11px] underline transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-xl border border-base-700/80 bg-base-900/90 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-neon">
              Email Verification Required
            </span>
          </div>
          <p className="text-xs text-base-300 mt-0.5">
            We will send a 6-digit OTP code to confirm your email before registration.
          </p>
        </div>

        {!otpSent ? (
          <button
            type="button"
            onClick={handleSendOTP}
            disabled={!isEmailValid || sending}
            className="shrink-0 rounded-lg bg-neon px-3.5 py-2 text-xs font-semibold text-base-950 hover:bg-neon-dim transition-all disabled:cursor-not-allowed disabled:opacity-40 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          >
            {sending ? "Sending Code..." : "Send OTP"}
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSendOTP}
              disabled={cooldown > 0 || sending}
              className="rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-xs font-medium text-base-200 hover:border-base-600 hover:text-base-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : sending ? "Sending..." : "Resend Code"}
            </button>
          </div>
        )}
      </div>

      {/* OTP Input & Verification Action when OTP sent */}
      {otpSent && (
        <div className="pt-2 border-t border-base-800 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-in">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpInput}
            onChange={(e) =>
              setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="6-digit OTP"
            className="w-full sm:w-44 rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-center font-mono text-sm font-bold tracking-[0.25em] text-neon placeholder:tracking-normal placeholder:font-normal placeholder:text-base-500 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all"
          />
          <button
            type="button"
            onClick={handleVerifyOTP}
            disabled={otpInput.length !== 6 || verifying}
            className="rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon-dim transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          >
            {verifying ? "Verifying..." : "Verify OTP"}
          </button>
        </div>
      )}

      {/* Status & Error feedback */}
      {infoMessage && !error && (
        <p className="text-xs text-neon-dim">{infoMessage}</p>
      )}

      {error && (
        <p className="text-xs text-rose-accent bg-rose-accent/10 border border-rose-accent/30 rounded-lg p-2.5">
          {error}
        </p>
      )}
    </div>
  );
}
