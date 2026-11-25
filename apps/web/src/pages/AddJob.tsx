import { useNavigate } from "react-router-dom";
import { createJob } from "../api/client";
import JobForm, { type JobFormValues } from "../components/JobForm";

export default function AddJob() {
  const navigate = useNavigate();

  return (
    <JobForm
      mode="create"
      submitLabel="Post job"
      submittingLabel="Posting..."
      cancelTo="/recruiter"
      onSubmit={async (values: JobFormValues) => {
        await createJob(values);
        navigate("/recruiter");
      }}
    />
  );
}
