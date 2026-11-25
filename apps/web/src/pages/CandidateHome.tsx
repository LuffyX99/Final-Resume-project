import { useState } from "react";
import { Link } from "react-router-dom";
import { getMyApplications, getPublicJobs } from "../api/client";
import JobCard from "../components/JobCard";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useLiveResource } from "../hooks/useLiveResource";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import type { JobApplication } from "../types";

const PAGE_SIZE = 12;

const JOB_TYPES = [
  { value: "", label: "All job types" },
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const EXPERIENCE_LEVELS = [
  { value: "", label: "All experience levels" },
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
];

export default function CandidateHome() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [skill, setSkill] = useState("");
  const [jobType, setJobType] = useState("");
  const [experience, setExperience] = useState("");
  const [page, setPage] = useState(0);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const debouncedLocation = useDebouncedValue(location.trim(), 350);
  const debouncedSkill = useDebouncedValue(skill.trim(), 350);

  const { data, loading, refreshing, error, refresh } = useLiveResource(
    `candidate-jobs:${debouncedSearch}:${debouncedLocation}:${debouncedSkill}:${jobType}:${experience}:${page}`,
    async () => {
      const [jobs, applications] = await Promise.all([
        getPublicJobs({
          search: debouncedSearch || undefined,
          location: debouncedLocation || undefined,
          skill: debouncedSkill || undefined,
          job_type: jobType || undefined,
          experience: experience || undefined,
          skip: page * PAGE_SIZE,
          limit: PAGE_SIZE,
        }),
        getMyApplications(),
      ]);
      return { jobs, applications };
    },
  );

  useRealtimeSync({
    events: ["job.created", "job.updated", "job.closed", "job.taken_down", "application.submitted"],
    onEvent: () => {
      void refresh();
    },
  });

  const jobs = data?.jobs ?? [];
  const applications = data?.applications ?? [];
  const applicationsByJob = new Map<string, JobApplication>(
    applications.map((application) => [application.job_id, application]),
  );
  const hasFilters =
    search.trim() !== "" ||
    location.trim() !== "" ||
    skill.trim() !== "" ||
    jobType !== "" ||
    experience !== "";

  function resetPage() {
    setPage(0);
  }

  function clearFilters() {
    setSearch("");
    setLocation("");
    setSkill("");
    setJobType("");
    setExperience("");
    setPage(0);
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading open roles...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not load open roles
          </p>
          <p className="mt-2 text-sm text-rose-accent">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-5 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
            Candidate workspace
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-base-50">
            Find your next role
          </h1>
          <p className="mt-2 max-w-2xl text-base-300">
            Every open role from every recruiter on ResumeMatchAI, searchable
            and filterable in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-2.5 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.182a8.25 8.25 0 10-2.332 8.163"
              />
            </svg>
            Refresh
          </button>
          <Link
            to="/applications"
            className="inline-flex items-center gap-2 rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
          >
            My Applications
            {applications.length > 0 && (
              <span className="rounded-full bg-base-950/15 px-2 py-0.5 text-[11px] font-bold">
                {applications.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="glass-card mb-6 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <label
              htmlFor="job-search"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-base-400"
            >
              Search
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
                />
              </svg>
              <input
                id="job-search"
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Title, company, or description"
                className="w-full rounded-xl border border-base-600 bg-base-800 py-2.5 pl-9 pr-3 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="job-location"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-base-400"
            >
              Location
            </label>
            <input
              id="job-location"
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                resetPage();
              }}
              placeholder="Any location"
              className="w-full rounded-xl border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="job-skill"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-base-400"
            >
              Skill
            </label>
            <input
              id="job-skill"
              type="text"
              value={skill}
              onChange={(e) => {
                setSkill(e.target.value);
                resetPage();
              }}
              placeholder="e.g. Python"
              className="w-full rounded-xl border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="job-type"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-base-400"
            >
              Job type
            </label>
            <select
              id="job-type"
              value={jobType}
              onChange={(e) => {
                setJobType(e.target.value);
                resetPage();
              }}
              className="w-full rounded-xl border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-base-50 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200"
            >
              {JOB_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="job-experience"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-base-400"
            >
              Experience
            </label>
            <select
              id="job-experience"
              value={experience}
              onChange={(e) => {
                setExperience(e.target.value);
                resetPage();
              }}
              className="w-full rounded-xl border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-base-50 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200"
            >
              {EXPERIENCE_LEVELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400">
            {loading
              ? "Searching..."
              : `${jobs.length} open role${jobs.length !== 1 ? "s" : ""}`}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-base-300 hover:text-neon transition-colors duration-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && data && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-accent/30 bg-amber-accent/10 p-4 text-sm text-amber-200"
        >
          <span>Could not refresh the latest roles: {error}</span>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-amber-accent/30 px-3 py-1.5 text-xs font-semibold text-amber-accent hover:bg-amber-accent/10 transition-colors duration-200"
          >
            Try again
          </button>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-base-700">
            <svg
              className="h-6 w-6 text-base-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
              />
            </svg>
          </div>
          <p className="text-base-300">
            {hasFilters ? "No roles match those filters." : "No open roles yet."}
          </p>
          <p className="mt-1 text-sm text-base-400">
            {hasFilters
              ? "Try a broader search or clear the filters."
              : "New roles will appear here as recruiters post them."}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger-children">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              application={applicationsByJob.get(job.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400">
          Page {page + 1}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
            className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={jobs.length < PAGE_SIZE}
            className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
