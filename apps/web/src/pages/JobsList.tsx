import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getJobs } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Job } from "../types";
import DataTable from "../components/DataTable";

const PAGE_SIZE = 20;

export default function JobsList() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const canCreate = user?.role !== "candidate";

  useEffect(() => {
    let active = true;
    getJobs(page * PAGE_SIZE, PAGE_SIZE)
      .then((data) => {
        if (active) setJobs(data);
      })
      .catch(() => {
        if (active) setJobs([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  if (user?.role === "candidate") {
    return <Navigate to="/candidate" replace />;
  }

  if (loading && page === 0) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading jobs...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-base-50 tracking-tight">
            {canCreate ? "Jobs" : "Open Jobs"}
          </h1>
          <p className="mt-1 text-base-300">
            {canCreate
              ? "Manage your job postings"
              : "Browse roles matched to your profile"}
          </p>
        </div>
        {canCreate && (
          <Link
            to="/jobs/new"
            className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
          >
            Add Job
          </Link>
        )}
      </div>

      <DataTable
        columns={[
          {
            key: "title",
            header: "Title",
            render: (job) => (
              <Link
                to={`/jobs/${job.id}`}
                className="text-neon hover:text-neon-dim transition-colors duration-200 font-medium"
              >
                {job.title}
              </Link>
            ),
          },
          {
            key: "company",
            header: "Company",
            render: (job) => (
              <span className="text-base-200">{job.company}</span>
            ),
          },
          {
            key: "created_at",
            header: "Created",
            render: (job) => (
              <span className="font-mono text-base-300 text-xs">
                {new Date(job.created_at).toLocaleDateString()}
              </span>
            ),
          },
        ]}
        data={jobs}
        keyExtractor={(job) => job.id}
        page={page}
        onPageChange={(next) => {
          setLoading(true);
          setPage(next);
        }}
        hasMore={jobs.length === PAGE_SIZE}
      />
    </div>
  );
}
