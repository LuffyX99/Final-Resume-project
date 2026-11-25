export type UserRole = "candidate" | "recruiter" | "admin";

export type FieldErrors = Record<string, string>;

export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  skills: string[] | null;
  required_skills: string[];
  extracted_skills: string[];
  location: string | null;
  experience: string | null;
  job_type: string | null;
  status: string;
  recruiter_id: string | null;
  applicant_count: number;
  shortlisted_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface Resume {
  id: string;
  candidate_name: string;
  content: string;
  skills: string[] | null;
  file_name: string | null;
  candidate_id: string | null;
  created_at: string;
}

export interface Match {
  id: string;
  job_id: string;
  resume_id: string;
  similarity_score: number;
  bias_reduced: boolean;
  shortlisted: boolean;
  created_at: string;
  job_title?: string | null;
  job_company: string | null;
  candidate_name?: string | null;
  candidate_skills?: string[] | null;
  // Computed by the API when available; the client derives them otherwise.
  final_score?: number | null;
  trust_score?: number | null;
  readiness_score?: number | null;
  matched_skills?: string[] | null;
  missing_skills?: string[] | null;
  stale_skills?: string[] | null;
  skill_gap_analysis?: SkillAnalysis | null;
}

export interface LearningStep {
  skill: string;
  status: "missing" | "stale";
  priority?: number;
  title: string;
  action: string;
  resource_hint?: string;
  estimated_time?: string;
}

export interface SkillAnalysis {
  matched_skills: string[];
  missing_skills: string[];
  stale_skills: string[];
  critical_missing_skills?: string[];
  readiness_score: number;
  learning_steps: LearningStep[];
}

export interface ApplicationDetail {
  job: Job;
  match: Match;
  resume: Resume;
  application_id?: string | null;
}

export type ApplicationStatus =
  | "submitted"
  | "shortlisted"
  | "rejected"
  | "hired"
  | "withdrawn";

export interface ApplicationResumeSummary {
  id: string;
  candidate_name: string;
  file_name: string | null;
  skills: string[] | null;
  created_at: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  candidate_id: string;
  resume_id: string;
  status: ApplicationStatus;
  applicant_name: string;
  applicant_email: string;
  applicant_phone_number: string | null;
  applicant_age: number | null;
  applicant_gender: string | null;
  similarity_score?: number | null;
  trust_score?: number | null;
  final_score?: number | null;
  readiness_score?: number | null;
  skill_gap_analysis?: SkillAnalysis | null;
  created_at: string;
  updated_at: string;
  job: Job;
  resume: ApplicationResumeSummary;
  match: Match | null;
}

export interface JobCreate {
  title: string;
  company: string;
  description: string;
  required_skills?: string[];
  location?: string;
  experience?: string;
  job_type?: string;
}

export interface JobUpdate {
  title?: string;
  company?: string;
  description?: string;
  required_skills?: string[];
  location?: string;
  experience?: string;
  job_type?: string;
  status?: string;
}

export interface ResumeCreate {
  candidate_name: string;
  content: string;
}

export interface MatchComputeRequest {
  job_id?: string;
  resume_id?: string;
  bias_reduced?: boolean;
}

export interface MatchUpdate {
  shortlisted: boolean;
}

export interface AuthUser {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  age: number | null;
  gender: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface CandidateRegister {
  full_name: string;
  age: number;
  gender: string;
  email: string;
  phone_number: string;
  password: string;
  confirm_password: string;
  verification_token?: string;
  otp?: string;
}

export interface SendOTPRequest {
  email: string;
  full_name?: string;
}

export interface SendOTPResponse {
  message: string;
  cooldown_seconds: number;
  expires_in: number;
}

export interface VerifyOTPRequest {
  email: string;
  otp: string;
}

export interface VerifyOTPResponse {
  message: string;
  verification_token: string;
}

export interface RecruiterRegister extends CandidateRegister {
  company_name: string;
  company_website?: string;
  company_size?: string;
  industry?: string;
  company_location?: string;
  company_description?: string;
}

export interface NotificationDetails {
  venue: string;
  interview_date: string;
  interview_time?: string;
  mode: string;
  contact_person: string;
  notes?: string;
  job_title?: string;
  job_company?: string;
  candidate_name?: string;
  candidate_email?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  sender_id: string | null;
  job_id: string;
  application_id: string | null;
  title: string;
  content: string;
  notification_type: string;
  details: NotificationDetails | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unread_count: number;
}

export interface InterviewInviteRequest {
  application_id?: string | null;
  match_id?: string | null;
  venue: string;
  interview_date: string;
  interview_time?: string;
  mode?: string;
  contact_person: string;
  notes?: string;
}

export interface AdminMetrics {
  total_candidates: number;
  total_recruiters: number;
  total_jobs: number;
  open_jobs: number;
  closed_jobs: number;
  total_applications: number;
  total_shortlisted: number;
  open_support_tickets: number;
  resolved_support_tickets: number;
}

export interface AdminUserItem {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone_number: string | null;
  age: number | null;
  gender: string | null;
  is_active: boolean;
  created_at: string;
  company_name?: string | null;
  industry?: string | null;
  resumes_count: number;
  jobs_count: number;
  applications_count: number;
}

export interface AdminUsersListResponse {
  items: AdminUserItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface AdminJobItem {
  id: string;
  title: string;
  company: string;
  status: string;
  is_taken_down: boolean;
  takedown_reason: string | null;
  recruiter_id: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  applicant_count: number;
  shortlisted_count: number;
  created_at: string;
}

export interface AdminJobsListResponse {
  items: AdminJobItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface AdminApplicationItem {
  id: string;
  job_id: string;
  candidate_id: string;
  job_title: string;
  job_company: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  final_score: number | null;
  similarity_score: number | null;
  trust_score: number | null;
  readiness_score: number | null;
  created_at: string;
}

export interface AdminApplicationsListResponse {
  items: AdminApplicationItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: string;
  sender_name: string;
  content: string;
  created_at: string;
}

export interface SupportThread {
  id: string;
  user_id: string;
  user_role: string;
  user_name: string;
  user_email: string;
  subject: string;
  category: string;
  status: "open" | "resolved";
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
  message_count: number;
}

export interface SupportThreadListResponse {
  items: SupportThread[];
  total: number;
  open_count: number;
  resolved_count: number;
}

export interface AdminUser {
  id: string;
  role: "admin";
  full_name: string;
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  admin: AdminUser;
}

export interface AdminCandidateUpdate {
  full_name: string;
  email: string;
  phone_number?: string | null;
  age?: number | null;
  gender?: string | null;
}

export interface AdminRecruiterCreate {
  full_name: string;
  email: string;
  password: string;
  phone_number?: string | null;
  company_name: string;
  industry?: string | null;
  company_size?: string | null;
  company_website?: string | null;
}

export interface AdminRecruiterUpdate {
  full_name: string;
  email: string;
  phone_number?: string | null;
  company_name?: string | null;
  industry?: string | null;
  company_size?: string | null;
  company_website?: string | null;
}

export interface AdminJobUpdatePayload {
  title?: string;
  company?: string;
  description?: string;
  location?: string | null;
  experience?: string | null;
  job_type?: string | null;
  required_skills?: string[];
  status?: string;
}

export interface AdminShortlistedItem {
  id: string;
  application_id: string;
  job_id: string;
  job_title: string;
  job_company: string;
  recruiter_id?: string | null;
  recruiter_name?: string | null;
  recruiter_email?: string | null;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string | null;
  status: string;
  similarity_score?: number | null;
  trust_score?: number | null;
  readiness_score?: number | null;
  final_score?: number | null;
  created_at: string;
}

export interface AdminShortlistedListResponse {
  items: AdminShortlistedItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}



