import type {
  AuthUser,
  Job,
  JobApplication,
  Match,
  Resume,
} from "../types";

export const testUser: AuthUser = {
  id: "candidate-1",
  role: "candidate",
  full_name: "Test Candidate",
  email: "candidate@example.com",
  age: 29,
  gender: "female",
  phone_number: "+919876543210",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

export const testJob: Job = {
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build APIs with Python and PostgreSQL.",
  skills: ["Python", "PostgreSQL"],
  required_skills: ["Python", "PostgreSQL"],
  extracted_skills: ["Python", "PostgreSQL"],
  location: "Remote",
  experience: "Senior",
  job_type: "full-time",
  status: "open",
  recruiter_id: "recruiter-1",
  applicant_count: 3,
  shortlisted_count: 1,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: null,
};

export function makeJob(overrides: Partial<Job> = {}): Job {
  return { ...testJob, ...overrides };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    job_id: testJob.id,
    resume_id: "resume-1",
    similarity_score: 0.8,
    bias_reduced: false,
    shortlisted: false,
    created_at: "2026-01-06T00:00:00Z",
    job_title: testJob.title,
    job_company: testJob.company,
    candidate_name: testUser.full_name,
    candidate_skills: ["Python", "PostgreSQL"],
    ...overrides,
  };
}

export const testResume: Resume = {
  id: "resume-1",
  candidate_name: testUser.full_name,
  content: "Python and PostgreSQL engineer.",
  skills: ["Python", "PostgreSQL"],
  file_name: "resume.docx",
  candidate_id: testUser.id,
  created_at: "2026-01-06T00:00:00Z",
};

export function makeApplication(
  job: Job = testJob,
  overrides: Partial<JobApplication> = {},
): JobApplication {
  return {
    id: "application-1",
    job_id: job.id,
    candidate_id: testUser.id,
    resume_id: testResume.id,
    status: "submitted",
    applicant_name: testUser.full_name,
    applicant_email: testUser.email,
    applicant_phone_number: testUser.phone_number,
    applicant_age: testUser.age,
    applicant_gender: testUser.gender,
    created_at: "2026-01-06T00:00:00Z",
    updated_at: "2026-01-06T00:00:00Z",
    job,
    resume: {
      id: testResume.id,
      candidate_name: testResume.candidate_name,
      file_name: testResume.file_name,
      skills: testResume.skills,
      created_at: testResume.created_at,
    },
    match: makeMatch({ job_id: job.id }),
    ...overrides,
  };
}
