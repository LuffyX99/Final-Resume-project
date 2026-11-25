import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AdminAuthProvider, useAdminAuth } from "./auth/AdminAuthContext";
import { navigationFor, roleHome } from "./auth/roles";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import SessionLoader from "./components/SessionLoader";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import SupportCenter from "./pages/SupportCenter";
import CandidateHome from "./pages/CandidateHome";
import JobsList from "./pages/JobsList";
import JobDetail from "./pages/JobDetail";
import JobApplicants from "./pages/JobApplicants";
import ApplicationDetail from "./pages/ApplicationDetail";
import AddJob from "./pages/AddJob";
import EditJob from "./pages/EditJob";
import RecruiterHome from "./pages/RecruiterHome";
import MyApplications from "./pages/MyApplications";
import Inbox from "./pages/Inbox";
import ApplyPage from "./pages/ApplyPage";
import RegisterCandidate from "./pages/RegisterCandidate";
import RegisterRecruiter from "./pages/RegisterRecruiter";
import ResumesList from "./pages/ResumesList";
import ResumeDetail from "./pages/ResumeDetail";
import AddResume from "./pages/AddResume";
import Login from "./pages/Login";

function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { admin, signOutAdmin } = useAdminAuth();

  function navClass(path: string) {
    const active = pathname === path || pathname.startsWith(path + "/");
    return active
      ? "neon-text font-semibold"
      : "text-base-200 hover:text-base-50 transition-colors duration-200";
  }

  const isCurrentAdmin = Boolean(admin);

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-base-600/50 bg-base-900/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-8">
          <Link
            to={
              isCurrentAdmin
                ? "/admin/dashboard"
                : user
                ? roleHome(user.role)
                : "/login"
            }
            className="flex items-center gap-3 group"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-neon/10 border border-neon/20 group-hover:border-neon/40 transition-all duration-300">
              <svg
                className="h-4 w-4 text-neon"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-base-50">
              ResumeMatch
              <span className="text-neon">AI</span>
            </span>
          </Link>

          {isCurrentAdmin && (
            <div className="flex items-center gap-6 ml-auto font-body text-sm tracking-wide">
              <Link to="/admin/dashboard" className={navClass("/admin/dashboard")}>
                Admin Dashboard
              </Link>
            </div>
          )}

          {!isCurrentAdmin && user && (
            <div className="flex items-center gap-6 ml-auto font-body text-sm tracking-wide">
              {navigationFor(user.role).map((link) => (
                <Link key={link.to} to={link.to} className={navClass(link.to)}>
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          {isCurrentAdmin && admin && (
            <div className="flex items-center gap-3 border-l border-base-600/50 pl-6">
              <span className="hidden text-sm text-base-300 sm:inline">
                {admin.full_name || "Platform Admin"}
              </span>
              <span className="rounded-full bg-neon/10 border border-neon/30 px-2.5 py-0.5 text-xs font-mono font-medium text-neon">
                {admin.id}
              </span>
              <button
                onClick={signOutAdmin}
                className="text-sm text-rose-accent hover:text-rose-300 transition-colors duration-200"
              >
                Sign out
              </button>
            </div>
          )}

          {!isCurrentAdmin && user && (
            <div className="flex items-center gap-3 border-l border-base-600/50 pl-6">
              <span className="hidden text-sm text-base-300 sm:inline">
                {user.full_name}
              </span>
              <span className="rounded-full bg-neon/10 border border-neon/20 px-3 py-1 text-xs font-medium text-neon">
                {user.role}
              </span>
              <button
                onClick={signOut}
                className="text-sm text-base-300 hover:text-base-50 transition-colors duration-200"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  const { admin } = useAdminAuth();

  if (loading) {
    return <SessionLoader />;
  }

  if (admin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to={user ? roleHome(user.role) : "/login"} replace />;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Layout>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/admin/login"
            element={<AdminLogin />}
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/register/candidate"
            element={
              <GuestRoute>
                <RegisterCandidate />
              </GuestRoute>
            }
          />
          <Route
            path="/register/recruiter"
            element={
              <GuestRoute>
                <RegisterRecruiter />
              </GuestRoute>
            }
          />

          <Route path="/" element={<HomeRedirect />} />

          <Route
            path="/candidate"
            element={
              <ProtectedRoute roles={["candidate"]}>
                <CandidateHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications"
            element={
              <ProtectedRoute roles={["candidate"]}>
                <MyApplications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute roles={["candidate"]}>
                <Inbox />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id/apply"
            element={
              <ProtectedRoute roles={["candidate"]}>
                <ApplyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiter"
            element={
              <ProtectedRoute roles={["recruiter"]}>
                <RecruiterHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/support"
            element={
              <AdminProtectedRoute>
                <SupportCenter />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute roles={["candidate", "recruiter", "admin"]}>
                <SupportCenter />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jobs"
            element={
              <ProtectedRoute>
                <JobsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/new"
            element={
              <ProtectedRoute roles={["recruiter", "admin"]}>
                <AddJob />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id/edit"
            element={
              <ProtectedRoute roles={["recruiter", "admin"]}>
                <EditJob />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id/applicants"
            element={
              <ProtectedRoute roles={["recruiter", "admin"]}>
                <JobApplicants />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:jobId/applicants/:matchId"
            element={
              <ProtectedRoute roles={["recruiter", "admin"]}>
                <ApplicationDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <ProtectedRoute>
                <JobDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resumes"
            element={
              <ProtectedRoute>
                <ResumesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resumes/new"
            element={
              <ProtectedRoute>
                <AddResume />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resumes/:id"
            element={
              <ProtectedRoute>
                <ResumeDetail />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Layout>
    </AdminAuthProvider>
  );
}
