import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import type { FieldErrors } from "../types";
import SkillTagInput from "./SkillTagInput";

export interface JobFormValues {
  title: string;
  company: string;
  description: string;
  required_skills: string[];
}

interface JobFormProps {
  mode: "create" | "edit";
  initialValues?: JobFormValues;
  submitLabel: string;
  submittingLabel: string;
  cancelTo: string;
  onSubmit: (values: JobFormValues) => Promise<void>;
}

const EMPTY_VALUES: JobFormValues = {
  title: "",
  company: "",
  description: "",
  required_skills: [],
};

function validate(values: JobFormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.title.trim()) {
    errors.title = "Job title is required.";
  } else if (values.title.trim().length > 255) {
    errors.title = "Job title must be 255 characters or fewer.";
  }

  if (!values.company.trim()) {
    errors.company = "Company is required.";
  } else if (values.company.trim().length > 255) {
    errors.company = "Company must be 255 characters or fewer.";
  }

  if (!values.description.trim()) {
    errors.description = "Job description is required.";
  }

  return errors;
}

export default function JobForm({
  mode,
  initialValues = EMPTY_VALUES,
  submitLabel,
  submittingLabel,
  cancelTo,
  onSubmit,
}: JobFormProps) {
  const [values, setValues] = useState<JobFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField<K extends keyof JobFormValues>(
    field: K,
    value: JobFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleaned: JobFormValues = {
      title: values.title.trim(),
      company: values.company.trim(),
      description: values.description.trim(),
      required_skills: values.required_skills,
    };

    const nextErrors = validate(cleaned);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setServerError(null);
    setLoading(true);
    try {
      await onSubmit(cleaned);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function inputClass(hasError: boolean) {
    return `w-full rounded-xl border ${
      hasError ? "border-rose-accent/60" : "border-base-600"
    } bg-base-800 px-4 py-3 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200`;
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <Link
        to={cancelTo}
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="mt-6 glass-card p-6 sm:p-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-base-50">
          {mode === "create" ? "Post a job" : "Edit job"}
        </h1>
        <p className="mt-2 text-base-300">
          {mode === "create"
            ? "Describe the role and the skills you need. We use the description and skills to rank applicants."
            : "Update the posting. Changes are saved to the live listing immediately."}
        </p>

        {serverError && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
          >
            {serverError}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="job-title"
                className="mb-2 block text-sm font-medium text-base-200"
              >
                Job title
              </label>
              <input
                id="job-title"
                type="text"
                value={values.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                maxLength={255}
                autoComplete="off"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "job-title-error" : undefined}
                className={inputClass(Boolean(errors.title))}
              />
              {errors.title && (
                <p id="job-title-error" className="mt-2 text-sm text-rose-accent">
                  {errors.title}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="job-company"
                className="mb-2 block text-sm font-medium text-base-200"
              >
                Company
              </label>
              <input
                id="job-company"
                type="text"
                value={values.company}
                onChange={(e) => updateField("company", e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={255}
                autoComplete="organization"
                aria-invalid={Boolean(errors.company)}
                aria-describedby={errors.company ? "job-company-error" : undefined}
                className={inputClass(Boolean(errors.company))}
              />
              {errors.company && (
                <p id="job-company-error" className="mt-2 text-sm text-rose-accent">
                  {errors.company}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="job-description"
              className="mb-2 block text-sm font-medium text-base-200"
            >
              Job description
            </label>
            <textarea
              id="job-description"
              value={values.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Describe the role, responsibilities, and what success looks like..."
              rows={8}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? "job-description-error" : undefined
              }
              className={`${inputClass(Boolean(errors.description))} resize-y`}
            />
            {errors.description && (
              <p
                id="job-description-error"
                className="mt-2 text-sm text-rose-accent"
              >
                {errors.description}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="job-skills"
              className="mb-2 block text-sm font-medium text-base-200"
            >
              Required skills
            </label>
            <SkillTagInput
              id="job-skills"
              value={values.required_skills}
              onChange={(skills) => updateField("required_skills", skills)}
              placeholder="e.g. Python, PostgreSQL, FastAPI"
              describedBy="job-skills-help"
            />
            <p id="job-skills-help" className="mt-1 text-xs text-base-400">
              These are shown to candidates and used to rank applicant skill
              match. They are combined with skills extracted from the
              description.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-base-600/50 pt-6 sm:flex-row sm:items-center sm:justify-end">
            <Link
              to={cancelTo}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2.5 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-base-950/30 border-t-base-950 animate-spin" />
                  {submittingLabel}
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
