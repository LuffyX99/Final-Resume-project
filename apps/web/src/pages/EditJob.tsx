import { Link, useNavigate, useParams } from "react-router-dom";
import { getJob, updateJob } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { roleHome } from "../auth/roles";
import JobForm from "../components/JobForm";
import { useLiveResource } from "../hooks/useLiveResource";

export default function EditJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const home = user ? roleHome(user.role) : "/login";

  const { data: job, loading, error, refresh } = useLiveResource(
    `job:${id ?? "missing"}`,
    async () => {
      if (!id) throw new Error("Job id is missing.");
      return getJob(id);
    },
  );

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading job...
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="text-rose-accent">{error ?? "Job not found."}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => void refresh()}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Retry
            </button>
            <Link
              to={home}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canEdit =
    user?.role === "admin" || (user != null && job.recruiter_id === user.id);

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="text-rose-accent">
            You do not have permission to edit this job.
          </p>
          <Link
            to={home}
            className="mt-5 inline-flex rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <JobForm
      key={job.id}
      mode="edit"
      initialValues={{
        title: job.title,
        company: job.company,
        description: job.description,
        required_skills: job.required_skills ?? [],
      }}
      submitLabel="Save changes"
      submittingLabel="Saving..."
      cancelTo={home}
      onSubmit={async (values) => {
        await updateJob(job.id, values);
        // Re-open a fresh page against the live API rather than trusting the
        // mutation response or keeping an edited copy in state.
        navigate(user?.role === "admin" ? `/jobs/${job.id}` : home, {
          replace: true,
        });
      }}
    />
  );
}
