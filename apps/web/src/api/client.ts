import axios from "axios";
import type {
  ApplicationDetail,
  AdminApplicationsListResponse,
  AdminCandidateUpdate,
  AdminJobItem,
  AdminJobsListResponse,
  AdminJobUpdatePayload,
  AdminLoginResponse,
  AdminMetrics,
  AdminRecruiterCreate,
  AdminRecruiterUpdate,
  AdminShortlistedListResponse,
  AdminUser,
  AdminUserItem,
  AdminUsersListResponse,
  AuthUser,
  CandidateRegister,
  InterviewInviteRequest,
  Job,
  JobApplication,
  JobCreate,
  JobUpdate,
  LoginRequest,
  LoginResponse,
  Match,
  MatchComputeRequest,
  MatchUpdate,
  Notification,
  NotificationListResponse,
  RecruiterRegister,
  Resume,
  ResumeCreate,
  SendOTPRequest,
  SendOTPResponse,
  SkillAnalysis,
  SupportMessage,
  SupportThread,
  SupportThreadListResponse,
  VerifyOTPRequest,
  VerifyOTPResponse,
} from "../types";

const TOKEN_STORAGE_KEY = "resumeai.token";
const ADMIN_TOKEN_STORAGE_KEY = "resumeai.admin_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getStoredAdminToken(): string | null {
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function storeAdminToken(token: string): void {
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAdminToken(): void {
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  const url = String(config.url ?? "");
  const isAdminCall = url.startsWith("/admin") || url.includes("/admin/");
  const userToken = getStoredToken();
  const adminToken = getStoredAdminToken();
  // Admin sessions have no user token, so fall back to the admin token for
  // shared endpoints such as /support that both roles can call.
  const token = isAdminCall
    ? adminToken || userToken
    : userToken || adminToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url ?? "");
    const isAuthCall = url.includes("/auth/") || url === "/admin/login";
    const isAdminCall = url.startsWith("/admin") || url.includes("/admin/");
    if (error.response?.status === 401 && !isAuthCall) {
      if (isAdminCall) {
        clearStoredAdminToken();
        window.dispatchEvent(new Event("admin:expired"));
      } else {
        clearStoredToken();
        window.dispatchEvent(new Event("auth:expired"));
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)
      ?.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

// Auth
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", payload);
  return data;
}

export async function registerCandidate(
  payload: CandidateRegister,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(
    "/auth/register/candidate",
    payload,
  );
  return data;
}

export async function registerRecruiter(
  payload: RecruiterRegister,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(
    "/auth/register/recruiter",
    payload,
  );
  return data;
}

export async function sendOTP(
  payload: SendOTPRequest,
): Promise<SendOTPResponse> {
  const { data } = await api.post<SendOTPResponse>("/auth/otp/send", payload);
  return data;
}

export async function verifyOTP(
  payload: VerifyOTPRequest,
): Promise<VerifyOTPResponse> {
  const { data } = await api.post<VerifyOTPResponse>("/auth/otp/verify", payload);
  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/auth/me");
  return data;
}

// Jobs
export async function getJobs(skip = 0, limit = 20): Promise<Job[]> {
  const { data } = await api.get<Job[]>("/jobs", { params: { skip, limit } });
  return data;
}

export interface PublicJobFilters {
  search?: string;
  location?: string;
  job_type?: string;
  experience?: string;
  company?: string;
  skill?: string;
  skip?: number;
  limit?: number;
}

export async function getPublicJobs(
  filters: PublicJobFilters = {},
): Promise<Job[]> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params[key] = value;
    }
  }
  const { data } = await api.get<Job[]>("/jobs/public", { params });
  return data;
}

export async function getJob(id: string): Promise<Job> {
  const { data } = await api.get<Job>(`/jobs/${id}`);
  return data;
}

export async function createJob(payload: JobCreate): Promise<Job> {
  const { data } = await api.post<Job>("/jobs", payload);
  return data;
}

export async function updateJob(
  id: string,
  payload: JobUpdate,
): Promise<Job> {
  const { data } = await api.patch<Job>(`/jobs/${id}`, payload);
  return data;
}

export async function closeJob(id: string): Promise<Job> {
  const { data } = await api.post<Job>(`/jobs/${id}/close`);
  return data;
}

export async function deleteJob(id: string): Promise<void> {
  await api.delete(`/jobs/${id}`);
}

export async function getMyJobs(
  skip = 0,
  limit = 20,
  status?: string,
): Promise<Job[]> {
  const params: Record<string, string | number> = { skip, limit };
  if (status) params.status = status;
  const { data } = await api.get<Job[]>("/jobs/mine", { params });
  return data;
}

export async function getJobMatches(
  id: string,
  limit = 50,
): Promise<Match[]> {
  const { data } = await api.get<Match[]>(`/jobs/${id}/matches`, {
    params: { limit },
  });
  return data;
}

export async function getJobApplication(
  jobId: string,
  matchId: string,
): Promise<ApplicationDetail> {
  const { data } = await api.get<ApplicationDetail>(
    `/jobs/${jobId}/applicants/${matchId}`,
  );
  return data;
}

// Applications
export interface SubmitApplicationInput {
  jobId: string;
  fullName: string;
  phoneNumber: string;
  age: number;
  gender: string;
  file: File;
}

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<JobApplication> {
  const formData = new FormData();
  formData.append("job_id", input.jobId);
  formData.append("full_name", input.fullName);
  formData.append("phone_number", input.phoneNumber);
  formData.append("age", String(input.age));
  formData.append("gender", input.gender);
  formData.append("file", input.file);

  const { data } = await api.post<JobApplication>("/applications", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getMyApplications(
  jobId?: string,
): Promise<JobApplication[]> {
  const { data } = await api.get<JobApplication[]>("/applications/mine", {
    params: jobId ? { job_id: jobId } : undefined,
  });
  return data;
}

export async function getApplicationReadiness(
  applicationId: string,
): Promise<SkillAnalysis> {
  const { data } = await api.get<SkillAnalysis>(
    `/applications/${applicationId}/readiness`,
  );
  return data;
}

// Resumes
export async function getResumes(skip = 0, limit = 20): Promise<Resume[]> {
  const { data } = await api.get<Resume[]>("/resumes", {
    params: { skip, limit },
  });
  return data;
}

export async function getResume(id: string): Promise<Resume> {
  const { data } = await api.get<Resume>(`/resumes/${id}`);
  return data;
}

export async function createResume(payload: ResumeCreate): Promise<Resume> {
  const { data } = await api.post<Resume>("/resumes", payload);
  return data;
}

export async function getResumeMatches(
  id: string,
  limit = 10,
): Promise<Match[]> {
  const { data } = await api.get<Match[]>(`/resumes/${id}/matches`, {
    params: { limit },
  });
  return data;
}

export async function uploadResume(
  candidateName: string,
  file: File,
): Promise<Resume> {
  const formData = new FormData();
  formData.append("candidate_name", candidateName);
  formData.append("file", file);
  const { data } = await api.post<Resume>("/resumes/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// Matches
export async function computeMatches(
  payload: MatchComputeRequest,
): Promise<Match[]> {
  const { data } = await api.post<Match[]>("/matches/compute", payload);
  return data;
}

export async function getMatches(
  skip = 0,
  limit = 20,
  filters?: { job_id?: string; resume_id?: string },
): Promise<Match[]> {
  const { data } = await api.get<Match[]>("/matches", {
    params: { skip, limit, ...filters },
  });
  return data;
}

export async function updateMatch(
  matchId: string,
  payload: MatchUpdate,
): Promise<Match> {
  const { data } = await api.patch<Match>(`/matches/${matchId}`, payload);
  return data;
}

// Notifications & Shortlist Communication
export async function sendShortlistInvite(
  payload: InterviewInviteRequest,
): Promise<Notification> {
  const { data } = await api.post<Notification>(
    "/notifications/invite",
    payload,
  );
  return data;
}

export async function getNotifications(
  unreadOnly = false,
  limit = 50,
  skip = 0,
): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>("/notifications", {
    params: { unread_only: unreadOnly, limit, skip },
  });
  return data;
}

export async function markNotificationRead(
  id: string,
): Promise<Notification> {
  const { data } = await api.patch<Notification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{
  marked_read: number;
}> {
  const { data } = await api.post<{ marked_read: number }>(
    "/notifications/read-all",
  );
  return data;
}

// Admin API
export async function adminLogin(payload: {
  id: string;
  password: string;
}): Promise<AdminLoginResponse> {
  const { data } = await api.post<AdminLoginResponse>("/admin/login", payload);
  return data;
}

export async function getAdminMe(): Promise<AdminUser> {
  const { data } = await api.get<AdminUser>("/admin/me");
  return data;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const { data } = await api.get<AdminMetrics>("/admin/metrics");
  return data;
}

export async function getAdminCandidates(params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}): Promise<AdminUsersListResponse> {
  const { data } = await api.get<AdminUsersListResponse>("/admin/candidates", {
    params,
  });
  return data;
}

export async function getAdminCandidateDetail(
  candidateId: string,
): Promise<AdminUserItem> {
  const { data } = await api.get<AdminUserItem>(
    `/admin/candidates/${candidateId}`,
  );
  return data;
}

export async function updateAdminCandidate(
  candidateId: string,
  payload: AdminCandidateUpdate,
): Promise<AdminUserItem> {
  const { data } = await api.put<AdminUserItem>(
    `/admin/candidates/${candidateId}`,
    payload,
  );
  return data;
}

export async function toggleAdminCandidateStatus(
  candidateId: string,
  isActive: boolean,
): Promise<AdminUserItem> {
  const { data } = await api.patch<AdminUserItem>(
    `/admin/candidates/${candidateId}/status`,
    { is_active: isActive },
  );
  return data;
}

export async function deleteAdminCandidate(
  candidateId: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(
    `/admin/candidates/${candidateId}`,
  );
  return data;
}

export async function getAdminRecruiters(params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}): Promise<AdminUsersListResponse> {
  const { data } = await api.get<AdminUsersListResponse>("/admin/recruiters", {
    params,
  });
  return data;
}

export async function createAdminRecruiter(
  payload: AdminRecruiterCreate,
): Promise<AdminUserItem> {
  const { data } = await api.post<AdminUserItem>("/admin/recruiters", payload);
  return data;
}

export async function getAdminRecruiterDetail(
  recruiterId: string,
): Promise<AdminUserItem> {
  const { data } = await api.get<AdminUserItem>(
    `/admin/recruiters/${recruiterId}`,
  );
  return data;
}

export async function updateAdminRecruiter(
  recruiterId: string,
  payload: AdminRecruiterUpdate,
): Promise<AdminUserItem> {
  const { data } = await api.put<AdminUserItem>(
    `/admin/recruiters/${recruiterId}`,
    payload,
  );
  return data;
}

export async function resetAdminRecruiterPassword(
  recruiterId: string,
  newPassword: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.post<{ status: string; message: string }>(
    `/admin/recruiters/${recruiterId}/reset-password`,
    { new_password: newPassword },
  );
  return data;
}

export async function toggleAdminRecruiterStatus(
  recruiterId: string,
  isActive: boolean,
): Promise<AdminUserItem> {
  const { data } = await api.patch<AdminUserItem>(
    `/admin/recruiters/${recruiterId}/status`,
    { is_active: isActive },
  );
  return data;
}

export async function deleteAdminRecruiter(
  recruiterId: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(
    `/admin/recruiters/${recruiterId}`,
  );
  return data;
}

export async function getAdminUsers(params?: {
  search?: string;
  role?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}): Promise<AdminUsersListResponse> {
  const { data } = await api.get<AdminUsersListResponse>("/admin/users", {
    params,
  });
  return data;
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserItem> {
  const { data } = await api.get<AdminUserItem>(`/admin/users/${userId}`);
  return data;
}

export async function updateAdminUserStatus(
  userId: string,
  isActive: boolean,
): Promise<AdminUserItem> {
  const { data } = await api.patch<AdminUserItem>(`/admin/users/${userId}/status`, {
    is_active: isActive,
  });
  return data;
}

export async function deleteAdminUser(
  userId: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(
    `/admin/users/${userId}`,
  );
  return data;
}

export async function getAdminJobs(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AdminJobsListResponse> {
  const { data } = await api.get<AdminJobsListResponse>("/admin/jobs", {
    params,
  });
  return data;
}

export async function updateAdminJob(
  jobId: string,
  payload: AdminJobUpdatePayload,
): Promise<AdminJobItem> {
  const { data } = await api.put<AdminJobItem>(`/admin/jobs/${jobId}`, payload);
  return data;
}

export async function updateAdminJobStatus(
  jobId: string,
  status: "open" | "closed",
): Promise<AdminJobItem> {
  const { data } = await api.patch<AdminJobItem>(`/admin/jobs/${jobId}/status`, {
    status,
  });
  return data;
}

export async function deleteAdminJob(
  jobId: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(
    `/admin/jobs/${jobId}`,
  );
  return data;
}

export async function takedownJob(
  jobId: string,
  reason: string,
): Promise<AdminJobItem> {
  const { data } = await api.post<AdminJobItem>(`/admin/jobs/${jobId}/takedown`, {
    reason,
  });
  return data;
}

export async function getAdminShortlisted(params?: {
  search?: string;
  job_id?: string;
  recruiter_id?: string;
  page?: number;
  limit?: number;
}): Promise<AdminShortlistedListResponse> {
  const { data } = await api.get<AdminShortlistedListResponse>(
    "/admin/shortlisted",
    { params },
  );
  return data;
}

export async function getAdminApplications(params?: {
  search?: string;
  job_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AdminApplicationsListResponse> {
  const { data } = await api.get<AdminApplicationsListResponse>(
    "/admin/applications",
    { params },
  );
  return data;
}

// Support System API
export async function createSupportThread(payload: {
  subject: string;
  category: string;
  message: string;
}): Promise<SupportThread> {
  const { data } = await api.post<SupportThread>("/support/threads", payload);
  return data;
}

export async function getSupportThreads(params?: {
  status?: string;
  search?: string;
}): Promise<SupportThreadListResponse> {
  const { data } = await api.get<SupportThreadListResponse>("/support/threads", {
    params,
  });
  return data;
}

export async function getSupportThread(
  threadId: string,
): Promise<SupportThread> {
  const { data } = await api.get<SupportThread>(`/support/threads/${threadId}`);
  return data;
}

export async function sendSupportMessage(
  threadId: string,
  content: string,
): Promise<SupportMessage> {
  const { data } = await api.post<SupportMessage>(
    `/support/threads/${threadId}/messages`,
    { content },
  );
  return data;
}

export async function updateSupportThreadStatus(
  threadId: string,
  status: "open" | "resolved",
): Promise<SupportThread> {
  const { data } = await api.patch<SupportThread>(
    `/support/threads/${threadId}/status`,
    { status },
  );
  return data;
}

