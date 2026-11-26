import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminMetrics,
  getAdminCandidates,
  updateAdminCandidate,
  toggleAdminCandidateStatus,
  deleteAdminCandidate,
  getAdminRecruiters,
  createAdminRecruiter,
  updateAdminRecruiter,
  resetAdminRecruiterPassword,
  toggleAdminRecruiterStatus,
  deleteAdminRecruiter,
  getAdminJobs,
  updateAdminJob,
  updateAdminJobStatus,
  deleteAdminJob,
  takedownJob,
  getAdminShortlisted,
  errorMessage,
} from "../api/client";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import DataTable from "../components/DataTable";
import ScoreBadge from "../components/ScoreBadge";
import type {
  AdminMetrics,
  AdminUserItem,
  AdminJobItem,
  AdminShortlistedItem,
  AdminCandidateUpdate,
  AdminRecruiterCreate,
  AdminRecruiterUpdate,
  AdminJobUpdatePayload,
} from "../types";

type AdminTab = "overview" | "candidates" | "recruiters" | "jobs" | "shortlisted";

export default function AdminDashboard() {
  const { admin, signOutAdmin } = useAdminAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [globalError, setGlobalError] = useState<string | null>(null);

  // --- Overview State ---
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // --- Candidates State ---
  const [candidates, setCandidates] = useState<AdminUserItem[]>([]);
  const [candTotal, setCandTotal] = useState(0);
  const [candPage, setCandPage] = useState(1);
  const [candHasMore, setCandHasMore] = useState(false);
  const [candSearch, setCandSearch] = useState("");
  const [candActiveFilter, setCandActiveFilter] = useState<string>("");
  const [candLoading, setCandLoading] = useState(false);

  // Candidate Modals
  const [viewCandidate, setViewCandidate] = useState<AdminUserItem | null>(null);
  const [editCandidate, setEditCandidate] = useState<AdminUserItem | null>(null);
  const [editCandForm, setEditCandForm] = useState<AdminCandidateUpdate>({
    full_name: "",
    email: "",
    phone_number: "",
    age: undefined,
    gender: "",
  });
  const [toggleCandTarget, setToggleCandTarget] = useState<AdminUserItem | null>(null);
  const [deleteCandTarget, setDeleteCandTarget] = useState<AdminUserItem | null>(null);

  // --- Recruiters State ---
  const [recruiters, setRecruiters] = useState<AdminUserItem[]>([]);
  const [recTotal, setRecTotal] = useState(0);
  const [recPage, setRecPage] = useState(1);
  const [recHasMore, setRecHasMore] = useState(false);
  const [recSearch, setRecSearch] = useState("");
  const [recActiveFilter, setRecActiveFilter] = useState<string>("");
  const [recLoading, setRecLoading] = useState(false);

  // Recruiter Modals
  const [showAddRecruiterModal, setShowAddRecruiterModal] = useState(false);
  const [newRecruiterForm, setNewRecruiterForm] = useState<AdminRecruiterCreate>({
    full_name: "",
    email: "",
    password: "",
    phone_number: "",
    company_name: "",
    industry: "",
    company_size: "",
    company_website: "",
  });
  const [editRecruiter, setEditRecruiter] = useState<AdminUserItem | null>(null);
  const [editRecForm, setEditRecForm] = useState<AdminRecruiterUpdate>({
    full_name: "",
    email: "",
    phone_number: "",
    company_name: "",
    industry: "",
    company_size: "",
    company_website: "",
  });
  const [resetPwTarget, setResetPwTarget] = useState<AdminUserItem | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [toggleRecTarget, setToggleRecTarget] = useState<AdminUserItem | null>(null);
  const [deleteRecTarget, setDeleteRecTarget] = useState<AdminUserItem | null>(null);

  // --- Jobs State ---
  const [jobs, setJobs] = useState<AdminJobItem[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsHasMore, setJobsHasMore] = useState(false);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsStatusFilter, setJobsStatusFilter] = useState<string>("");
  const [jobsLoading, setJobsLoading] = useState(false);

  // Job Modals
  const [editJob, setEditJob] = useState<AdminJobItem | null>(null);
  const [editJobForm, setEditJobForm] = useState<AdminJobUpdatePayload>({
    title: "",
    company: "",
    description: "",
    location: "",
    experience: "",
    job_type: "",
    status: "open",
  });
  const [takedownTarget, setTakedownTarget] = useState<AdminJobItem | null>(null);
  const [takedownReason, setTakedownReason] = useState("");
  const [deleteJobTarget, setDeleteJobTarget] = useState<AdminJobItem | null>(null);

  // --- Shortlisted State ---
  const [shortlisted, setShortlisted] = useState<AdminShortlistedItem[]>([]);
  const [shortTotal, setShortTotal] = useState(0);
  const [shortPage, setShortPage] = useState(1);
  const [shortHasMore, setShortHasMore] = useState(false);
  const [shortSearch, setShortSearch] = useState("");
  const [shortJobFilter, setShortJobFilter] = useState<string>("");
  const [shortRecruiterFilter, setShortRecruiterFilter] = useState<string>("");
  const [shortLoading, setShortLoading] = useState(false);

  // Modal in-flight state
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // --- Data Loading Callbacks ---

  const loadMetrics = useCallback(async () => {
    try {
      setLoadingMetrics(true);
      const data = await getAdminMetrics();
      setMetrics(data);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const loadCandidates = useCallback(
    async (targetPage = 1) => {
      try {
        setCandLoading(true);
        const isAct =
          candActiveFilter === "active"
            ? true
            : candActiveFilter === "inactive"
            ? false
            : undefined;
        const data = await getAdminCandidates({
          search: candSearch.trim() || undefined,
          is_active: isAct,
          page: targetPage,
          limit: 10,
        });
        setCandidates(data.items);
        setCandTotal(data.total);
        setCandHasMore(data.has_more);
        setCandPage(targetPage);
      } catch (err) {
        setGlobalError(errorMessage(err));
      } finally {
        setCandLoading(false);
      }
    },
    [candSearch, candActiveFilter],
  );

  const loadRecruiters = useCallback(
    async (targetPage = 1) => {
      try {
        setRecLoading(true);
        const isAct =
          recActiveFilter === "active"
            ? true
            : recActiveFilter === "inactive"
            ? false
            : undefined;
        const data = await getAdminRecruiters({
          search: recSearch.trim() || undefined,
          is_active: isAct,
          page: targetPage,
          limit: 10,
        });
        setRecruiters(data.items);
        setRecTotal(data.total);
        setRecHasMore(data.has_more);
        setRecPage(targetPage);
      } catch (err) {
        setGlobalError(errorMessage(err));
      } finally {
        setRecLoading(false);
      }
    },
    [recSearch, recActiveFilter],
  );

  const loadJobs = useCallback(
    async (targetPage = 1) => {
      const safePage = Math.max(1, targetPage);
      try {
        setJobsLoading(true);
        const data = await getAdminJobs({
          search: jobsSearch.trim() || undefined,
          status: jobsStatusFilter || undefined,
          page: safePage,
          limit: 10,
        });
        setJobs(data?.items || []);
        setJobsTotal(data?.total || 0);
        setJobsHasMore(data?.has_more || false);
        setJobsPage(safePage);
      } catch (err) {
        setGlobalError(errorMessage(err));
      } finally {
        setJobsLoading(false);
      }
    },
    [jobsSearch, jobsStatusFilter],
  );

  const loadShortlisted = useCallback(
    async (targetPage = 1) => {
      const safePage = Math.max(1, targetPage);
      try {
        setShortLoading(true);
        const data = await getAdminShortlisted({
          search: shortSearch.trim() || undefined,
          job_id: shortJobFilter || undefined,
          recruiter_id: shortRecruiterFilter || undefined,
          page: safePage,
          limit: 10,
        });
        setShortlisted(data?.items || []);
        setShortTotal(data?.total || 0);
        setShortHasMore(data?.has_more || false);
        setShortPage(safePage);
      } catch (err) {
        setGlobalError(errorMessage(err));
      } finally {
        setShortLoading(false);
      }
    },
    [shortSearch, shortJobFilter, shortRecruiterFilter],
  );

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (activeTab === "overview") {
      void loadMetrics();
    } else if (activeTab === "candidates") {
      void loadCandidates(1);
    } else if (activeTab === "recruiters") {
      void loadRecruiters(1);
    } else if (activeTab === "jobs") {
      void loadJobs(1);
    } else if (activeTab === "shortlisted") {
      void loadShortlisted(1);
      if (jobs.length === 0) void loadJobs(1);
      if (recruiters.length === 0) void loadRecruiters(1);
    }
  }, [
    activeTab,
    loadMetrics,
    loadCandidates,
    loadRecruiters,
    loadJobs,
    loadShortlisted,
    jobs.length,
    recruiters.length,
  ]);

  useRealtimeSync({
    events: [
      "job.created",
      "job.closed",
      "job.taken_down",
      "application.submitted",
      "application.shortlisted",
      "admin.user_status_changed",
    ],
    onEvent: () => {
      void loadMetrics();
      if (activeTab === "candidates") void loadCandidates(candPage);
      if (activeTab === "recruiters") void loadRecruiters(recPage);
      if (activeTab === "jobs") void loadJobs(jobsPage);
      if (activeTab === "shortlisted") void loadShortlisted(shortPage);
    },
  });

  function handleSignOut() {
    signOutAdmin();
    navigate("/admin/login", { replace: true });
  }

  // --- Candidate Actions ---
  function openEditCandidate(u: AdminUserItem) {
    setModalError(null);
    setEditCandidate(u);
    setEditCandForm({
      full_name: u.full_name,
      email: u.email,
      phone_number: u.phone_number || "",
      age: u.age ?? undefined,
      gender: u.gender || "",
    });
  }

  async function handleSaveCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!editCandidate) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await updateAdminCandidate(editCandidate.id, editCandForm);
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setEditCandidate(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleToggleCandidateStatus() {
    if (!toggleCandTarget) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await toggleAdminCandidateStatus(
        toggleCandTarget.id,
        !toggleCandTarget.is_active,
      );
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setToggleCandTarget(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDeleteCandidate() {
    if (!deleteCandTarget) return;
    try {
      setModalBusy(true);
      setModalError(null);
      await deleteAdminCandidate(deleteCandTarget.id);
      setCandidates((prev) => prev.filter((c) => c.id !== deleteCandTarget.id));
      setDeleteCandTarget(null);
      void loadMetrics();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  // --- Recruiter Actions ---
  async function handleCreateRecruiter(e: React.FormEvent) {
    e.preventDefault();
    try {
      setModalBusy(true);
      setModalError(null);
      const created = await createAdminRecruiter(newRecruiterForm);
      setRecruiters((prev) => [created, ...prev]);
      setShowAddRecruiterModal(false);
      setNewRecruiterForm({
        full_name: "",
        email: "",
        password: "",
        phone_number: "",
        company_name: "",
        industry: "",
        company_size: "",
        company_website: "",
      });
      void loadMetrics();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  function openEditRecruiter(r: AdminUserItem) {
    setModalError(null);
    setEditRecruiter(r);
    setEditRecForm({
      full_name: r.full_name,
      email: r.email,
      phone_number: r.phone_number || "",
      company_name: r.company_name || "",
      industry: r.industry || "",
      company_size: "",
      company_website: "",
    });
  }

  async function handleSaveRecruiter(e: React.FormEvent) {
    e.preventDefault();
    if (!editRecruiter) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await updateAdminRecruiter(editRecruiter.id, editRecForm);
      setRecruiters((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      setEditRecruiter(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwTarget || !newPasswordVal) return;
    try {
      setModalBusy(true);
      setModalError(null);
      await resetAdminRecruiterPassword(resetPwTarget.id, newPasswordVal);
      setResetPwTarget(null);
      setNewPasswordVal("");
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleToggleRecruiterStatus() {
    if (!toggleRecTarget) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await toggleAdminRecruiterStatus(
        toggleRecTarget.id,
        !toggleRecTarget.is_active,
      );
      setRecruiters((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      setToggleRecTarget(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDeleteRecruiter() {
    if (!deleteRecTarget) return;
    try {
      setModalBusy(true);
      setModalError(null);
      await deleteAdminRecruiter(deleteRecTarget.id);
      setRecruiters((prev) => prev.filter((r) => r.id !== deleteRecTarget.id));
      setDeleteRecTarget(null);
      void loadMetrics();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  // --- Job Actions ---
  function openEditJob(j: AdminJobItem) {
    setModalError(null);
    setEditJob(j);
    setEditJobForm({
      title: j.title,
      company: j.company,
      description: "",
      location: "",
      experience: "",
      job_type: "",
      status: j.status,
    });
  }

  async function handleSaveJob(e: React.FormEvent) {
    e.preventDefault();
    if (!editJob) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await updateAdminJob(editJob.id, editJobForm);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setEditJob(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleToggleJobStatus(j: AdminJobItem) {
    const nextStatus = j.status === "open" ? "closed" : "open";
    try {
      const updated = await updateAdminJobStatus(j.id, nextStatus);
      setJobs((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      void loadMetrics();
    } catch (err) {
      setGlobalError(errorMessage(err));
    }
  }

  async function handleTakedownConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!takedownTarget || !takedownReason.trim()) return;
    try {
      setModalBusy(true);
      setModalError(null);
      const updated = await takedownJob(takedownTarget.id, takedownReason.trim());
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setTakedownTarget(null);
      setTakedownReason("");
      void loadMetrics();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDeleteJob() {
    if (!deleteJobTarget) return;
    try {
      setModalBusy(true);
      setModalError(null);
      await deleteAdminJob(deleteJobTarget.id);
      setJobs((prev) => prev.filter((j) => j.id !== deleteJobTarget.id));
      setDeleteJobTarget(null);
      void loadMetrics();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalBusy(false);
    }
  }

  // --- Column Definitions ---

  const candidateColumns = [
    {
      key: "candidate",
      header: "Candidate",
      render: (item: AdminUserItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.full_name}</div>
          <div className="font-mono text-xs text-base-400">{item.email}</div>
          <div className="font-mono text-[11px] text-base-500">ID: {item.id}</div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact / Profile",
      render: (item: AdminUserItem) => (
        <div className="text-xs text-base-300">
          <div>{item.phone_number || "No phone"}</div>
          <div className="text-base-400">
            {item.age ? `${item.age} yrs` : "Age N/A"} • {item.gender || "N/A"}
          </div>
        </div>
      ),
    },
    {
      key: "activity",
      header: "Activity",
      render: (item: AdminUserItem) => (
        <div className="text-xs text-base-300">
          <span>{item.resumes_count} resume{item.resumes_count === 1 ? "" : "s"}</span>
          <span className="text-base-500 block">
            {item.applications_count} application{item.applications_count === 1 ? "" : "s"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminUserItem) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.is_active
              ? "bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/30"
              : "bg-rose-accent/10 text-rose-accent border border-rose-accent/30"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.is_active ? "bg-emerald-accent" : "bg-rose-accent"
            }`}
          />
          {item.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: AdminUserItem) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewCandidate(item)}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs font-medium text-base-200 hover:text-base-50 transition-colors"
          >
            Details
          </button>
          <button
            onClick={() => openEditCandidate(item)}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs font-medium text-neon hover:border-neon/40 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => {
              setModalError(null);
              setToggleCandTarget(item);
            }}
            className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              item.is_active
                ? "border-amber-accent/30 bg-amber-accent/10 text-amber-accent hover:bg-amber-accent/20"
                : "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20"
            }`}
          >
            {item.is_active ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => {
              setModalError(null);
              setDeleteCandTarget(item);
            }}
            className="rounded-lg border border-rose-accent/30 bg-rose-accent/10 px-2 py-1 text-xs font-medium text-rose-accent hover:bg-rose-accent/20 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const recruiterColumns = [
    {
      key: "recruiter",
      header: "Recruiter & ID",
      render: (item: AdminUserItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.full_name}</div>
          <div className="font-mono text-xs text-base-400">{item.email}</div>
          <div className="font-mono text-[11px] text-base-500">ID: {item.id}</div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company Affiliation",
      render: (item: AdminUserItem) => (
        <div className="text-xs text-base-300">
          <div className="font-medium text-base-100">
            {item.company_name || "Independent"}
          </div>
          <div className="text-base-400">{item.industry || "General Industry"}</div>
        </div>
      ),
    },
    {
      key: "jobs_count",
      header: "Jobs Posted",
      render: (item: AdminUserItem) => (
        <span className="font-mono text-xs text-amber-accent">
          {item.jobs_count} posted
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminUserItem) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.is_active
              ? "bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/30"
              : "bg-rose-accent/10 text-rose-accent border border-rose-accent/30"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.is_active ? "bg-emerald-accent" : "bg-rose-accent"
            }`}
          />
          {item.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: AdminUserItem) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEditRecruiter(item)}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs font-medium text-neon hover:border-neon/40 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => {
              setModalError(null);
              setNewPasswordVal("");
              setResetPwTarget(item);
            }}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs font-medium text-amber-accent hover:border-amber-accent/40 transition-colors"
          >
            Reset Pwd
          </button>
          <button
            onClick={() => {
              setModalError(null);
              setToggleRecTarget(item);
            }}
            className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              item.is_active
                ? "border-amber-accent/30 bg-amber-accent/10 text-amber-accent hover:bg-amber-accent/20"
                : "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20"
            }`}
          >
            {item.is_active ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => {
              setModalError(null);
              setDeleteRecTarget(item);
            }}
            className="rounded-lg border border-rose-accent/30 bg-rose-accent/10 px-2 py-1 text-xs font-medium text-rose-accent hover:bg-rose-accent/20 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const jobColumns = [
    {
      key: "title",
      header: "Job Listing",
      render: (item: AdminJobItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.title}</div>
          <div className="text-xs text-base-400">{item.company}</div>
          <div className="font-mono text-[11px] text-base-500">ID: {item.id}</div>
        </div>
      ),
    },
    {
      key: "recruiter",
      header: "Posted By",
      render: (item: AdminJobItem) => (
        <div className="text-xs text-base-300">
          <div className="font-medium text-base-100">
            {item.recruiter_name || "Unknown"}
          </div>
          <div className="font-mono text-base-400">{item.recruiter_email || "N/A"}</div>
        </div>
      ),
    },
    {
      key: "counts",
      header: "Applicants / Shortlisted",
      render: (item: AdminJobItem) => (
        <div className="font-mono text-xs">
          <span className="text-base-200">{item.applicant_count ?? 0} applicants</span>
          <span className="text-emerald-accent block">
            {item.shortlisted_count ?? 0} shortlisted
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminJobItem) => (
        <div>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              item.is_taken_down
                ? "bg-rose-accent/10 text-rose-accent border border-rose-accent/30"
                : (item.status || "open") === "open"
                ? "bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/30"
                : "bg-base-800 text-base-400 border border-base-700"
            }`}
          >
            {item.is_taken_down ? "Moderated / Taken Down" : (item.status || "open").toUpperCase()}
          </span>
          {item.is_taken_down && item.takedown_reason && (
            <div className="text-[11px] text-rose-300 mt-1 max-w-xs truncate">
              Reason: {item.takedown_reason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: AdminJobItem) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEditJob(item)}
            className="rounded-lg border border-base-700 bg-base-800 px-2 py-1 text-xs font-medium text-neon hover:border-neon/40 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => handleToggleJobStatus(item)}
            className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              (item.status || "open") === "open"
                ? "border-amber-accent/30 bg-amber-accent/10 text-amber-accent hover:bg-amber-accent/20"
                : "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20"
            }`}
          >
            {(item.status || "open") === "open" ? "Close" : "Re-open"}
          </button>
          {!item.is_taken_down && (
            <button
              onClick={() => {
                setModalError(null);
                setTakedownReason("");
                setTakedownTarget(item);
              }}
              className="rounded-lg border border-amber-accent/30 bg-amber-accent/10 px-2 py-1 text-xs font-medium text-amber-accent hover:bg-amber-accent/20 transition-colors"
            >
              Takedown
            </button>
          )}
          <button
            onClick={() => {
              setModalError(null);
              setDeleteJobTarget(item);
            }}
            className="rounded-lg border border-rose-accent/30 bg-rose-accent/10 px-2 py-1 text-xs font-medium text-rose-accent hover:bg-rose-accent/20 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const shortlistedColumns = [
    {
      key: "candidate",
      header: "Shortlisted Candidate",
      render: (item: AdminShortlistedItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.candidate_name}</div>
          <div className="font-mono text-xs text-base-400">{item.candidate_email}</div>
          {item.candidate_phone && (
            <div className="text-xs text-base-500">{item.candidate_phone}</div>
          )}
        </div>
      ),
    },
    {
      key: "job",
      header: "Job & Recruiter",
      render: (item: AdminShortlistedItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.job_title}</div>
          <div className="text-xs text-base-300">{item.job_company}</div>
          <div className="text-[11px] text-amber-accent mt-0.5">
            Recruiter: {item.recruiter_name || "N/A"} ({item.recruiter_email || "N/A"})
          </div>
        </div>
      ),
    },
    {
      key: "scores",
      header: "AI Suitability Scores",
      render: (item: AdminShortlistedItem) => (
        <div className="flex items-center gap-2">
          {item.final_score !== null &&
            item.final_score !== undefined &&
            !isNaN(Number(item.final_score)) && (
              <ScoreBadge
                score={
                  Number(item.final_score) > 1
                    ? Number(item.final_score) / 100
                    : Number(item.final_score)
                }
              />
            )}
          <div className="text-[11px] text-base-400 space-y-0.5">
            <div>
              Match:{" "}
              {item.similarity_score !== null &&
              item.similarity_score !== undefined &&
              !isNaN(Number(item.similarity_score))
                ? `${Math.round(
                    Number(item.similarity_score) *
                      (Number(item.similarity_score) > 1 ? 1 : 100),
                  )}%`
                : "N/A"}
            </div>
            <div>
              Trust:{" "}
              {item.trust_score !== null &&
              item.trust_score !== undefined &&
              !isNaN(Number(item.trust_score))
                ? `${Math.round(
                    Number(item.trust_score) *
                      (Number(item.trust_score) > 1 ? 1 : 100),
                  )}%`
                : "N/A"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Application Status",
      render: (item: AdminShortlistedItem) => (
        <span className="inline-block rounded-full bg-emerald-accent/10 border border-emerald-accent/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-accent uppercase">
          {item.status || "SHORTLISTED"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Date Shortlisted",
      render: (item: AdminShortlistedItem) => {
        let dateStr = "N/A";
        if (item.created_at) {
          try {
            const d = new Date(item.created_at);
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
            }
          } catch {
            dateStr = String(item.created_at);
          }
        }
        return (
          <span className="font-mono text-xs text-base-400">{dateStr}</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header & Admin Session Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-neon animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-neon">
              Central Administration Console
            </span>
            <span className="rounded-full bg-neon/10 border border-neon/30 px-2.5 py-0.5 text-[11px] font-mono font-medium text-neon">
              ADMIN ID: {admin?.id || "admin"}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-base-50">
            Platform Admin Center
          </h1>
          <p className="text-xs sm:text-sm text-base-400 mt-1">
            Comprehensive oversight and full management of candidates, recruiters, jobs, and shortlists.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-accent/40 bg-rose-accent/10 px-4 py-2 text-xs font-semibold text-rose-accent hover:bg-rose-accent/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {globalError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-4 text-xs sm:text-sm text-rose-accent flex items-center justify-between"
        >
          <span>{globalError}</span>
          <button
            onClick={() => setGlobalError(null)}
            className="text-base-400 hover:text-base-100 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-base-800 pb-3">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
              : "text-base-400 hover:text-base-100 bg-base-900/60 border border-base-800"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "candidates"
              ? "bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
              : "text-base-400 hover:text-base-100 bg-base-900/60 border border-base-800"
          }`}
        >
          Manage Candidates ({metrics?.total_candidates ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("recruiters")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "recruiters"
              ? "bg-amber-accent/15 text-amber-accent border border-amber-accent/30 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
              : "text-base-400 hover:text-base-100 bg-base-900/60 border border-base-800"
          }`}
        >
          Manage Recruiters ({metrics?.total_recruiters ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("jobs")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "jobs"
              ? "bg-amber-accent/15 text-amber-accent border border-amber-accent/30 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
              : "text-base-400 hover:text-base-100 bg-base-900/60 border border-base-800"
          }`}
        >
          Manage Job Posts ({metrics?.total_jobs ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("shortlisted")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "shortlisted"
              ? "bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/30 shadow-[0_0_15px_rgba(52,211,153,0.15)]"
              : "text-base-400 hover:text-base-100 bg-base-900/60 border border-base-800"
          }`}
        >
          Shortlisted Candidates ({metrics?.total_shortlisted ?? 0})
        </button>
      </div>

      {/* --- TAB 1: OVERVIEW --- */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total Candidates */}
            <div className="rounded-2xl border border-base-700/60 bg-base-900/70 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-base-400">
                  Total Candidates
                </span>
                <span className="p-2 rounded-lg bg-base-800 text-neon">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
              </div>
              <div className="font-display text-3xl font-bold text-base-50">
                {loadingMetrics ? "..." : (metrics?.total_candidates ?? 0)}
              </div>
              <p className="mt-2 text-xs text-base-400">
                Active job seeker accounts with parsed resumes.
              </p>
            </div>

            {/* Total Recruiters */}
            <div className="rounded-2xl border border-base-700/60 bg-base-900/70 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-base-400">
                  Total Recruiters
                </span>
                <span className="p-2 rounded-lg bg-base-800 text-amber-accent">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </span>
              </div>
              <div className="font-display text-3xl font-bold text-base-50">
                {loadingMetrics ? "..." : (metrics?.total_recruiters ?? 0)}
              </div>
              <p className="mt-2 text-xs text-base-400">
                Verified recruiter and corporate hiring accounts.
              </p>
            </div>

            {/* Total Jobs */}
            <div className="rounded-2xl border border-base-700/60 bg-base-900/70 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-base-400">
                  Total Job Posts
                </span>
                <span className="p-2 rounded-lg bg-base-800 text-neon">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-base-50">
                  {loadingMetrics ? "..." : (metrics?.total_jobs ?? 0)}
                </span>
                {metrics && (
                  <span className="text-xs text-emerald-accent font-medium">
                    ({metrics.open_jobs} Open / {metrics.closed_jobs} Closed)
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-base-400">
                Platform-wide listings with SBERT vector embeddings.
              </p>
            </div>

            {/* Shortlisted Candidates */}
            <div className="rounded-2xl border border-base-700/60 bg-base-900/70 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-base-400">
                  Shortlisted Candidates
                </span>
                <span className="p-2 rounded-lg bg-base-800 text-emerald-accent">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <div className="font-display text-3xl font-bold text-emerald-accent">
                {loadingMetrics ? "..." : (metrics?.total_shortlisted ?? 0)}
              </div>
              <p className="mt-2 text-xs text-base-400">
                Candidates advancing through high-confidence AI matching.
              </p>
            </div>
          </div>

          {/* Quick Action Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <button
              onClick={() => setActiveTab("candidates")}
              className="text-left rounded-2xl border border-base-800 bg-base-900/40 p-5 hover:border-neon/40 hover:bg-base-900/70 transition-all"
            >
              <div className="font-semibold text-base-100 text-sm mb-1">
                Manage Candidates &rarr;
              </div>
              <p className="text-xs text-base-400">
                Search, inspect activity, edit details, and activate or deactivate candidates.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("recruiters")}
              className="text-left rounded-2xl border border-base-800 bg-base-900/40 p-5 hover:border-amber-accent/40 hover:bg-base-900/70 transition-all"
            >
              <div className="font-semibold text-base-100 text-sm mb-1">
                Manage Recruiters &rarr;
              </div>
              <p className="text-xs text-base-400">
                Add recruiters with fixed ID/password, reset passwords, and audit corporate accounts.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("jobs")}
              className="text-left rounded-2xl border border-base-800 bg-base-900/40 p-5 hover:border-amber-accent/40 hover:bg-base-900/70 transition-all"
            >
              <div className="font-semibold text-base-100 text-sm mb-1">
                Manage Job Posts &rarr;
              </div>
              <p className="text-xs text-base-400">
                Edit job listings, toggle open/closed status, and execute policy takedowns.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("shortlisted")}
              className="text-left rounded-2xl border border-base-800 bg-base-900/40 p-5 hover:border-emerald-accent/40 hover:bg-base-900/70 transition-all"
            >
              <div className="font-semibold text-base-100 text-sm mb-1">
                Shortlisted Candidates &rarr;
              </div>
              <p className="text-xs text-base-400">
                Filter and review all shortlisted applicants across jobs and hiring teams.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* --- TAB 2: MANAGE CANDIDATES --- */}
      {activeTab === "candidates" && (
        <div className="rounded-2xl border border-base-700/60 bg-base-900/40 p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-800 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-base-50">
                Candidate Management
              </h2>
              <p className="text-xs text-base-400 mt-0.5">
                Inspect candidate resumes, edit profile attributes, toggle activation, or delete accounts.
              </p>
            </div>
            <div className="font-mono text-xs text-neon">
              {candTotal} Candidates Registered
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={candActiveFilter}
                onChange={(e) => {
                  setCandActiveFilter(e.target.value);
                  setCandPage(1);
                }}
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-200 focus:border-neon focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="active">Active Accounts Only</option>
                <option value="inactive">Deactivated Accounts Only</option>
              </select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadCandidates(1);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={candSearch}
                onChange={(e) => setCandSearch(e.target.value)}
                placeholder="Search candidate name or email..."
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50"
              >
                Search
              </button>
            </form>
          </div>

          <DataTable
            columns={candidateColumns}
            data={candidates}
            keyExtractor={(item) => item.id}
            page={candPage}
            minPage={1}
            onPageChange={(p) => void loadCandidates(p)}
            hasMore={candHasMore}
            emptyMessage={candLoading ? "Loading candidates..." : "No candidates found matching criteria."}
          />
        </div>
      )}

      {/* --- TAB 3: MANAGE RECRUITERS --- */}
      {activeTab === "recruiters" && (
        <div className="rounded-2xl border border-base-700/60 bg-base-900/40 p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-800 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-base-50">
                Recruiter Directory & Account Provisioning
              </h2>
              <p className="text-xs text-base-400 mt-0.5">
                List all recruiters with their IDs, add new recruiters with set credentials, edit details, or reset passwords.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-amber-accent">
                {recTotal} Recruiters Provisioned
              </span>
              <button
                onClick={() => {
                  setModalError(null);
                  setShowAddRecruiterModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-neon px-4 py-2 text-xs font-semibold text-base-950 shadow-[0_0_15px_rgba(0,240,255,0.25)] hover:bg-neon/90 transition-all"
              >
                + Add New Recruiter
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={recActiveFilter}
                onChange={(e) => {
                  setRecActiveFilter(e.target.value);
                  setRecPage(1);
                }}
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-200 focus:border-neon focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Deactivated Only</option>
              </select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadRecruiters(1);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={recSearch}
                onChange={(e) => setRecSearch(e.target.value)}
                placeholder="Search recruiter name, email, company..."
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50"
              >
                Search
              </button>
            </form>
          </div>

          <DataTable
            columns={recruiterColumns}
            data={recruiters}
            keyExtractor={(item) => item.id}
            page={recPage}
            minPage={1}
            onPageChange={(p) => void loadRecruiters(p)}
            hasMore={recHasMore}
            emptyMessage={recLoading ? "Loading recruiters..." : "No recruiters found."}
          />
        </div>
      )}

      {/* --- TAB 4: MANAGE JOB POSTS --- */}
      {activeTab === "jobs" && (
        <div className="rounded-2xl border border-base-700/60 bg-base-900/40 p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-800 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-base-50">
                Job Posts Oversight
              </h2>
              <p className="text-xs text-base-400 mt-0.5">
                View all postings with owning recruiters, edit details, activate or close, and moderate policy takedowns.
              </p>
            </div>
            <div className="font-mono text-xs text-amber-accent">
              {jobsTotal} Total Listings
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={jobsStatusFilter}
                onChange={(e) => {
                  setJobsStatusFilter(e.target.value);
                  setJobsPage(1);
                }}
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-200 focus:border-neon focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="open">Open Listings Only</option>
                <option value="closed">Closed Listings Only</option>
              </select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadJobs(1);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={jobsSearch}
                onChange={(e) => setJobsSearch(e.target.value)}
                placeholder="Search job title or company..."
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50"
              >
                Search
              </button>
            </form>
          </div>

          <DataTable
            columns={jobColumns}
            data={jobs}
            keyExtractor={(item) => item.id}
            page={jobsPage}
            minPage={1}
            onPageChange={(p) => void loadJobs(p)}
            hasMore={jobsHasMore}
            emptyMessage={jobsLoading ? "Loading jobs..." : "No jobs found."}
          />
        </div>
      )}

      {/* --- TAB 5: SHORTLISTED CANDIDATES --- */}
      {activeTab === "shortlisted" && (
        <div className="rounded-2xl border border-base-700/60 bg-base-900/40 p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-800 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold text-base-50">
                Shortlisted Candidates Directory
              </h2>
              <p className="text-xs text-base-400 mt-0.5">
                View all candidates shortlisted across the platform with matching scores, job title, and recruiter affiliation.
              </p>
            </div>
            <div className="font-mono text-xs text-emerald-accent">
              {shortTotal} Total Shortlisted
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={shortJobFilter}
                onChange={(e) => {
                  setShortJobFilter(e.target.value);
                  setShortPage(1);
                }}
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-200 focus:border-neon focus:outline-none max-w-xs"
              >
                <option value="">All Jobs</option>
                {(jobs || []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.company})
                  </option>
                ))}
              </select>

              <select
                value={shortRecruiterFilter}
                onChange={(e) => {
                  setShortRecruiterFilter(e.target.value);
                  setShortPage(1);
                }}
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-200 focus:border-neon focus:outline-none max-w-xs"
              >
                <option value="">All Recruiters</option>
                {(recruiters || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} ({r.company_name || r.email})
                  </option>
                ))}
              </select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadShortlisted(1);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={shortSearch}
                onChange={(e) => setShortSearch(e.target.value)}
                placeholder="Search candidate, job, recruiter..."
                className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50"
              >
                Search
              </button>
            </form>
          </div>

          <DataTable
            columns={shortlistedColumns}
            data={shortlisted}
            keyExtractor={(item) => item.id || item.application_id}
            page={shortPage}
            minPage={1}
            onPageChange={(p) => void loadShortlisted(p)}
            hasMore={shortHasMore}
            emptyMessage={shortLoading ? "Loading shortlisted candidates..." : "No shortlisted candidates found."}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* Candidate Details Modal */}
      {viewCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setViewCandidate(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-neon">
                  Candidate Profile Details
                </span>
                <h3 className="font-display text-xl font-bold text-base-50">
                  {viewCandidate.full_name}
                </h3>
                <p className="font-mono text-xs text-base-400">{viewCandidate.email}</p>
              </div>
              <button
                onClick={() => setViewCandidate(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Candidate ID</span>
                <span className="font-mono text-base-200 text-[11px] break-all">{viewCandidate.id}</span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Status</span>
                <span className={viewCandidate.is_active ? "text-emerald-accent font-semibold" : "text-rose-accent font-semibold"}>
                  {viewCandidate.is_active ? "Active" : "Deactivated"}
                </span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Phone Number</span>
                <span className="text-base-200">{viewCandidate.phone_number || "None listed"}</span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Age / Gender</span>
                <span className="text-base-200">
                  {viewCandidate.age ? `${viewCandidate.age} yrs` : "N/A"} / {viewCandidate.gender || "N/A"}
                </span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Resumes Uploaded</span>
                <span className="text-neon font-mono text-sm">{viewCandidate.resumes_count}</span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-500 block mb-1">Applications Submitted</span>
                <span className="text-amber-accent font-mono text-sm">{viewCandidate.applications_count}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewCandidate(null)}
                className="rounded-lg bg-base-800 border border-base-700 px-4 py-2 text-xs font-semibold text-base-200 hover:text-base-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Modal */}
      {editCandidate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setEditCandidate(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-neon">
                  Edit Candidate
                </span>
                <h3 className="font-display text-lg font-bold text-base-50">
                  {editCandidate.full_name}
                </h3>
              </div>
              <button
                onClick={() => setEditCandidate(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveCandidate} className="space-y-3 text-xs">
              <div>
                <label className="block text-base-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editCandForm.full_name}
                  onChange={(e) =>
                    setEditCandForm({ ...editCandForm, full_name: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editCandForm.email}
                  onChange={(e) =>
                    setEditCandForm({ ...editCandForm, email: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editCandForm.phone_number || ""}
                  onChange={(e) =>
                    setEditCandForm({ ...editCandForm, phone_number: e.target.value })
                  }
                  placeholder="+1234567890"
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base-300 mb-1">Age</label>
                  <input
                    type="number"
                    min="18"
                    max="100"
                    value={editCandForm.age ?? ""}
                    onChange={(e) =>
                      setEditCandForm({
                        ...editCandForm,
                        age: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base-300 mb-1">Gender</label>
                  <input
                    type="text"
                    value={editCandForm.gender || ""}
                    onChange={(e) =>
                      setEditCandForm({ ...editCandForm, gender: e.target.value })
                    }
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditCandidate(null)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 disabled:opacity-50"
                >
                  {modalBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Toggle Status Confirmation Modal */}
      {toggleCandTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setToggleCandTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-base-50">
              {toggleCandTarget.is_active ? "Deactivate Candidate?" : "Activate Candidate?"}
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              {toggleCandTarget.is_active
                ? `Deactivating ${toggleCandTarget.full_name} (${toggleCandTarget.email}) will block candidate login and applications.`
                : `Reactivating ${toggleCandTarget.full_name} will restore candidate access.`}
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setToggleCandTarget(null)}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleCandidateStatus}
                disabled={modalBusy}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-base-950 ${
                  toggleCandTarget.is_active
                    ? "bg-amber-accent hover:bg-amber-accent/90"
                    : "bg-emerald-accent hover:bg-emerald-accent/90"
                }`}
              >
                {modalBusy ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Delete Confirmation Modal */}
      {deleteCandTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setDeleteCandTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-accent/40 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-rose-accent">
              Permanently Delete Candidate?
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-base-100">{deleteCandTarget.full_name}</span> ({deleteCandTarget.email})?
              All candidate resumes, job applications, matches, and profile data will be permanently removed.
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteCandTarget(null)}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCandidate}
                disabled={modalBusy}
                className="rounded-lg bg-rose-accent px-4 py-2 text-xs font-semibold text-base-950 hover:bg-rose-accent/90 disabled:opacity-50"
              >
                {modalBusy ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- RECRUITER MODALS --- */}

      {/* Add New Recruiter Modal */}
      {showAddRecruiterModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setShowAddRecruiterModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-neon">
                  Provision Recruiter Account
                </span>
                <h3 className="font-display text-xl font-bold text-base-50">
                  Add New Recruiter
                </h3>
              </div>
              <button
                onClick={() => setShowAddRecruiterModal(false)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateRecruiter} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base-300 mb-1">Recruiter Name *</label>
                  <input
                    type="text"
                    required
                    value={newRecruiterForm.full_name}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, full_name: e.target.value })
                    }
                    placeholder="Jane Doe"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base-300 mb-1">Recruiter ID / Email *</label>
                  <input
                    type="email"
                    required
                    value={newRecruiterForm.email}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, email: e.target.value })
                    }
                    placeholder="recruiter@company.com"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-base-300 mb-1">
                  Initial Password * (Stored securely hashed)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newRecruiterForm.password}
                  onChange={(e) =>
                    setNewRecruiterForm({ ...newRecruiterForm, password: e.target.value })
                  }
                  placeholder="Set recruiter password"
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base-300 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={newRecruiterForm.company_name}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, company_name: e.target.value })
                    }
                    placeholder="Acme Technologies"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base-300 mb-1">Industry</label>
                  <input
                    type="text"
                    value={newRecruiterForm.industry || ""}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, industry: e.target.value })
                    }
                    placeholder="e.g. Fintech, SaaS"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newRecruiterForm.phone_number || ""}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, phone_number: e.target.value })
                    }
                    placeholder="+1234567890"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base-300 mb-1">Company Website</label>
                  <input
                    type="url"
                    value={newRecruiterForm.company_website || ""}
                    onChange={(e) =>
                      setNewRecruiterForm({ ...newRecruiterForm, company_website: e.target.value })
                    }
                    placeholder="https://company.com"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddRecruiterModal(false)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 disabled:opacity-50"
                >
                  {modalBusy ? "Creating..." : "Create Recruiter Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Recruiter Modal */}
      {editRecruiter && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setEditRecruiter(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-neon">
                  Edit Recruiter
                </span>
                <h3 className="font-display text-lg font-bold text-base-50">
                  {editRecruiter.full_name}
                </h3>
              </div>
              <button
                onClick={() => setEditRecruiter(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveRecruiter} className="space-y-3 text-xs">
              <div>
                <label className="block text-base-300 mb-1">Recruiter Name *</label>
                <input
                  type="text"
                  required
                  value={editRecForm.full_name}
                  onChange={(e) =>
                    setEditRecForm({ ...editRecForm, full_name: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Email / Recruiter ID *</label>
                <input
                  type="email"
                  required
                  value={editRecForm.email}
                  onChange={(e) =>
                    setEditRecForm({ ...editRecForm, email: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Company Name</label>
                <input
                  type="text"
                  value={editRecForm.company_name || ""}
                  onChange={(e) =>
                    setEditRecForm({ ...editRecForm, company_name: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Industry</label>
                <input
                  type="text"
                  value={editRecForm.industry || ""}
                  onChange={(e) =>
                    setEditRecForm({ ...editRecForm, industry: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditRecruiter(null)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 disabled:opacity-50"
                >
                  {modalBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recruiter Reset Password Modal */}
      {resetPwTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setResetPwTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-accent">
                  Reset Password
                </span>
                <h3 className="font-display text-lg font-bold text-base-50">
                  {resetPwTarget.full_name}
                </h3>
                <p className="font-mono text-xs text-base-400">{resetPwTarget.email}</p>
              </div>
              <button
                onClick={() => setResetPwTarget(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-base-300 mb-1">
                  New Recruiter Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
                <p className="text-[11px] text-base-400 mt-1">
                  Password will be hashed immediately with Argon2id. Plain text is never stored or visible.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setResetPwTarget(null)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-amber-accent px-4 py-2 text-xs font-semibold text-base-950 hover:bg-amber-accent/90 disabled:opacity-50"
                >
                  {modalBusy ? "Resetting..." : "Confirm Password Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recruiter Toggle Status Confirmation Modal */}
      {toggleRecTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setToggleRecTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-base-50">
              {toggleRecTarget.is_active ? "Deactivate Recruiter?" : "Activate Recruiter?"}
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              {toggleRecTarget.is_active
                ? `Deactivating ${toggleRecTarget.full_name} (${toggleRecTarget.email}) will block recruiter login and prevent job management.`
                : `Reactivating ${toggleRecTarget.full_name} will restore recruiter login and dashboard access.`}
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setToggleRecTarget(null)}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleRecruiterStatus}
                disabled={modalBusy}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-base-950 ${
                  toggleRecTarget.is_active
                    ? "bg-amber-accent hover:bg-amber-accent/90"
                    : "bg-emerald-accent hover:bg-emerald-accent/90"
                }`}
              >
                {modalBusy ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Delete Confirmation Modal */}
      {deleteRecTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setDeleteRecTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-accent/40 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-rose-accent">
              Permanently Delete Recruiter?
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              Are you sure you want to delete recruiter <span className="font-bold text-base-100">{deleteRecTarget.full_name}</span> ({deleteRecTarget.email})?
              All jobs posted by this recruiter and associated applications will be permanently removed.
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteRecTarget(null)}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRecruiter}
                disabled={modalBusy}
                className="rounded-lg bg-rose-accent px-4 py-2 text-xs font-semibold text-base-950 hover:bg-rose-accent/90 disabled:opacity-50"
              >
                {modalBusy ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- JOB MODALS --- */}

      {/* Edit Job Modal */}
      {editJob && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setEditJob(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-neon">
                  Edit Job Posting
                </span>
                <h3 className="font-display text-lg font-bold text-base-50">
                  {editJob.title}
                </h3>
              </div>
              <button
                onClick={() => setEditJob(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveJob} className="space-y-3 text-xs">
              <div>
                <label className="block text-base-300 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  value={editJobForm.title || ""}
                  onChange={(e) =>
                    setEditJobForm({ ...editJobForm, title: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-base-300 mb-1">Company Entity *</label>
                <input
                  type="text"
                  required
                  value={editJobForm.company || ""}
                  onChange={(e) =>
                    setEditJobForm({ ...editJobForm, company: e.target.value })
                  }
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base-300 mb-1">Location</label>
                  <input
                    type="text"
                    value={editJobForm.location || ""}
                    onChange={(e) =>
                      setEditJobForm({ ...editJobForm, location: e.target.value })
                    }
                    placeholder="e.g. Remote, NY"
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base-300 mb-1">Status</label>
                  <select
                    value={editJobForm.status || "open"}
                    onChange={(e) =>
                      setEditJobForm({ ...editJobForm, status: e.target.value })
                    }
                    className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditJob(null)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 disabled:opacity-50"
                >
                  {modalBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Moderation Takedown Modal */}
      {takedownTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setTakedownTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-accent/40 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-800 pb-3">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-accent">
                  Policy Moderation
                </span>
                <h3 className="font-display text-lg font-bold text-base-50">
                  Take Down Job Listing
                </h3>
              </div>
              <button
                onClick={() => setTakedownTarget(null)}
                className="text-base-400 hover:text-base-100 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-base-300">
              Taking down <span className="font-bold text-base-100">{takedownTarget.title}</span> will immediately close the role and flag it as a policy violation.
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <form onSubmit={handleTakedownConfirm} className="space-y-3 text-xs">
              <div>
                <label className="block text-base-300 mb-1">
                  Reason for Takedown * (Visible in audits)
                </label>
                <textarea
                  required
                  rows={3}
                  value={takedownReason}
                  onChange={(e) => setTakedownReason(e.target.value)}
                  placeholder="Provide detailed violation explanation..."
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-base-100 focus:border-neon focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTakedownTarget(null)}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="rounded-lg bg-amber-accent px-4 py-2 text-xs font-semibold text-base-950 hover:bg-amber-accent/90 disabled:opacity-50"
                >
                  {modalBusy ? "Processing..." : "Confirm Takedown"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Job Modal */}
      {deleteJobTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md"
          onClick={() => setDeleteJobTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-accent/40 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-rose-accent">
              Permanently Delete Job?
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-base-100">{deleteJobTarget.title}</span> ({deleteJobTarget.company})?
              All candidate applications and match records associated with this job will be permanently removed.
            </p>

            {modalError && (
              <div className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteJobTarget(null)}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJob}
                disabled={modalBusy}
                className="rounded-lg bg-rose-accent px-4 py-2 text-xs font-semibold text-base-950 hover:bg-rose-accent/90 disabled:opacity-50"
              >
                {modalBusy ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
