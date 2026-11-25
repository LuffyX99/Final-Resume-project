import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  errorMessage,
  getJob,
  getMyApplications,
  submitApplication,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ApplicationStatusBadge from "../components/ApplicationStatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import { useLiveResource } from "../hooks/useLiveResource";
import { deriveMatchInsight } from "../lib/matchInsight";
import type { AuthUser, FieldErrors, Job, JobApplication } from "../types";
import {
  validateApplicantDetails,
  validateResumeFile,
  type ApplicantDetails,
} from "../validation/application";
import { normalizePhone } from "../validation/auth";

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-xl border ${
    hasError ? "border-rose-accent/60" : "border-base-600"
  } bg-base-800 px-4 py-3 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200`;
}

export default function ApplyPage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const { data, loading, error, refresh } = useLiveResource(
    `apply:${id ?? "missing"}:${user?.id ?? "anonymous"}`,
    async () => {
      if (!id) throw new Error("Job id is missing.");
      const [job, applications] = await Promise.all([
        getJob(id),
        getMyApplications(id),
      ]);
      return { job, existing: applications[0] ?? null };
    },
  );

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading application...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not open this application
          </p>
          <p className="mt-2 text-sm text-rose-accent">{error}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void refresh()}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Retry
            </button>
            <Link
              to="/candidate"
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              Back to roles
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !user) {
    return null;
  }

  if (data.existing) {
    return (
      <AlreadyApplied
        job={data.job}
        application={data.existing}
        onBrowse={() => navigate("/candidate")}
      />
    );
  }

  if (data.job.status !== "open") {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            This role is no longer accepting applications
          </p>
          <p className="mt-2 text-sm text-base-300">
            {data.job.title} at {data.job.company}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/candidate"
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Browse open roles
            </Link>
            <Link
              to={`/jobs/${data.job.id}`}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              View role
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ApplicationWizard
      key={`${data.job.id}:${user.id}`}
      job={data.job}
      user={user}
      refreshUser={refreshUser}
      onSubmitted={() =>
        navigate("/applications", {
          replace: true,
          state: {
            notice: `Application submitted for ${data.job.title}.`,
          },
        })
      }
    />
  );
}

function ApplicationWizard({
  job,
  user,
  refreshUser,
  onSubmitted,
}: {
  job: Job;
  user: AuthUser;
  refreshUser: () => Promise<AuthUser>;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [details, setDetails] = useState<ApplicantDetails>({
    full_name: user.full_name ?? "",
    phone_number: user.phone_number ?? "",
    age: user.age != null ? String(user.age) : "",
    gender: user.gender ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateDetail(field: keyof ApplicantDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function continueToResume() {
    const nextErrors = validateApplicantDetails(details);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setServerError(null);
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const detailsErrors = validateApplicantDetails(details);
    if (Object.keys(detailsErrors).length > 0) {
      setErrors(detailsErrors);
      setStep(1);
      return;
    }

    const uploadProblem = validateResumeFile(file);
    if (uploadProblem) {
      setFileError(uploadProblem);
      return;
    }
    if (!file) return;

    setSubmitting(true);
    setServerError(null);
    try {
      await submitApplication({
        jobId: job.id,
        fullName: details.full_name.trim(),
        phoneNumber: normalizePhone(details.phone_number),
        age: Number(details.age),
        gender: details.gender.trim(),
        file,
      });
      // The endpoint updated the profile from step 1; refresh the navbar
      // identity before leaving the page. A failure here must not hide the
      // successful application.
      try {
        await refreshUser();
      } catch {
        // The next authenticated page load will refresh the profile.
      }
      onSubmitted();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const genderOptions = GENDER_OPTIONS.some(
    (option) => option.value === details.gender,
  )
    ? GENDER_OPTIONS
    : [
        ...GENDER_OPTIONS,
        { value: details.gender, label: details.gender },
      ].filter((option) => option.value !== "");

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <Link
        to={`/jobs/${job.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-base-300 hover:text-neon transition-colors duration-200"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to role
      </Link>

      <div className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
          Apply
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-base-50">
          {job.title}
        </h1>
        <p className="mt-1 text-base-200">{job.company}</p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        {[1, 2].map((number) => {
          const active = step === number;
          const done = step > number;
          return (
            <div key={number} className="flex flex-1 items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${
                  active
                    ? "border-neon bg-neon/10 text-neon"
                    : done
                      ? "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent"
                      : "border-base-600 bg-base-800 text-base-400"
                }`}
              >
                {done ? "✓" : number}
              </span>
              <span
                className={`text-sm ${
                  active ? "text-base-100" : "text-base-400"
                }`}
              >
                {number === 1 ? "Personal details" : "Resume"}
              </span>
              {number === 1 && (
                <span className="h-px flex-1 bg-base-600/60" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 glass-card p-6 sm:p-8">
        {serverError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
          >
            {serverError}
            {serverError.toLowerCase().includes("already applied") && (
              <Link
                to="/applications"
                className="mt-2 block font-semibold underline underline-offset-2"
              >
                View My Applications
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {step === 1 ? (
            <div key="step-1" className="space-y-5">
              <div>
                <label
                  htmlFor="applicant-full-name"
                  className="mb-2 block text-sm font-medium text-base-200"
                >
                  Full name
                </label>
                <input
                  id="applicant-full-name"
                  type="text"
                  value={details.full_name}
                  onChange={(e) => updateDetail("full_name", e.target.value)}
                  maxLength={255}
                  aria-invalid={Boolean(errors.full_name)}
                  aria-describedby={
                    errors.full_name ? "applicant-full-name-error" : undefined
                  }
                  className={inputClass(Boolean(errors.full_name))}
                />
                {errors.full_name && (
                  <p
                    id="applicant-full-name-error"
                    className="mt-2 text-sm text-rose-accent"
                  >
                    {errors.full_name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="applicant-email"
                  className="mb-2 block text-sm font-medium text-base-200"
                >
                  Email
                </label>
                <input
                  id="applicant-email"
                  type="email"
                  value={user.email ?? ""}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-base-600 bg-base-800/50 px-4 py-3 text-sm text-base-300"
                />
                <p className="mt-1 text-xs text-base-400">
                  Email comes from your account and is used for this
                  application.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="applicant-phone"
                    className="mb-2 block text-sm font-medium text-base-200"
                  >
                    Phone number
                  </label>
                  <input
                    id="applicant-phone"
                    type="text"
                    value={details.phone_number}
                    onChange={(e) =>
                      updateDetail("phone_number", e.target.value)
                    }
                    placeholder="e.g. +919876543210"
                    aria-invalid={Boolean(errors.phone_number)}
                    aria-describedby={
                      errors.phone_number
                        ? "applicant-phone-error"
                        : "applicant-phone-help"
                    }
                    className={inputClass(Boolean(errors.phone_number))}
                  />
                  {errors.phone_number ? (
                    <p
                      id="applicant-phone-error"
                      className="mt-2 text-sm text-rose-accent"
                    >
                      {errors.phone_number}
                    </p>
                  ) : (
                    <p
                      id="applicant-phone-help"
                      className="mt-1 text-xs text-base-400"
                    >
                      10–15 digits, optionally starting with +.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="applicant-age"
                    className="mb-2 block text-sm font-medium text-base-200"
                  >
                    Age
                  </label>
                  <input
                    id="applicant-age"
                    type="text"
                    inputMode="numeric"
                    value={details.age}
                    onChange={(e) => updateDetail("age", e.target.value)}
                    placeholder="e.g. 28"
                    aria-invalid={Boolean(errors.age)}
                    aria-describedby={
                      errors.age ? "applicant-age-error" : undefined
                    }
                    className={inputClass(Boolean(errors.age))}
                  />
                  {errors.age && (
                    <p
                      id="applicant-age-error"
                      className="mt-2 text-sm text-rose-accent"
                    >
                      {errors.age}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="applicant-gender"
                  className="mb-2 block text-sm font-medium text-base-200"
                >
                  Gender
                </label>
                <select
                  id="applicant-gender"
                  value={details.gender}
                  onChange={(e) => updateDetail("gender", e.target.value)}
                  aria-invalid={Boolean(errors.gender)}
                  aria-describedby={
                    errors.gender ? "applicant-gender-error" : undefined
                  }
                  className={inputClass(Boolean(errors.gender))}
                >
                  <option value="">Select…</option>
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.gender && (
                  <p
                    id="applicant-gender-error"
                    className="mt-2 text-sm text-rose-accent"
                  >
                    {errors.gender}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-base-600/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  to={`/jobs/${job.id}`}
                  className="text-sm text-base-300 hover:text-base-50 transition-colors duration-200"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={continueToResume}
                  className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                >
                  Continue to resume
                </button>
              </div>
            </div>
          ) : (
            <div key="step-2" className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-base-50">
                  Upload your resume
                </h2>
                <p className="mt-1 text-sm text-base-300">
                  PDF or DOCX, up to 5 MB. We extract the text to match you
                  against this role.
                </p>
              </div>

              <div>
                <label
                  htmlFor="applicant-resume"
                  className="mb-2 block text-sm font-medium text-base-200"
                >
                  Resume file
                </label>
                <input
                  key="applicant-resume-file"
                  id="applicant-resume"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const next = e.target.files?.[0] ?? null;
                    setFile(next);
                    setFileError(next ? validateResumeFile(next) : undefined);
                  }}
                  className="w-full rounded-xl border border-base-600 bg-base-800 px-4 py-3 text-sm text-base-200 file:mr-4 file:rounded-lg file:border-0 file:bg-neon/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neon hover:file:bg-neon/20 transition-all duration-200"
                />
                {file && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-base-600/60 bg-base-800/60 px-3 py-2">
                    <span className="truncate font-mono text-xs text-base-200">
                      {file.name} · {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setFileError(undefined);
                      }}
                      className="text-xs font-medium text-base-300 hover:text-rose-accent transition-colors duration-200"
                    >
                      Remove
                    </button>
                  </div>
                )}
                {fileError && (
                  <p className="mt-2 text-sm text-rose-accent">{fileError}</p>
                )}
              </div>

              <div className="rounded-xl border border-base-600/50 bg-base-800/40 p-4 text-xs leading-relaxed text-base-300">
                Your profile details and resume are submitted together. If the
                application is created successfully, matching runs immediately
                and your score appears in My Applications.
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-base-600/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setServerError(null);
                    setStep(1);
                  }}
                  className="text-left text-sm text-base-300 hover:text-base-50 transition-colors duration-200"
                >
                  Back to details
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-base-950/30 border-t-base-950 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit application"
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function AlreadyApplied({
  job,
  application,
  onBrowse,
}: {
  job: Job;
  application: JobApplication;
  onBrowse: () => void;
}) {
  const insight = application.match
    ? deriveMatchInsight(application.match, job)
    : null;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="glass-card p-8 text-center">
        <p className="font-display text-xl font-semibold text-base-50">
          You have already applied to this role
        </p>
        <p className="mt-2 text-sm text-base-300">
          {job.title} at {job.company}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <ApplicationStatusBadge status={application.status} />
          {insight && <ScoreBadge score={insight.finalScore} />}
        </div>
        <p className="mt-3 font-mono text-xs text-base-400">
          Applied {new Date(application.created_at).toLocaleDateString()}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/applications"
            className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
          >
            My Applications
          </Link>
          <button
            type="button"
            onClick={onBrowse}
            className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
          >
            Browse other roles
          </button>
        </div>
      </div>
    </div>
  );
}
