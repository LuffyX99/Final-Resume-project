import type { UserRole } from "../types";

interface NavLink {
  to: string;
  label: string;
}

const HOME_BY_ROLE: Record<UserRole, string> = {
  candidate: "/candidate",
  recruiter: "/recruiter",
  admin: "/admin",
};

const NAV_BY_ROLE: Record<UserRole, NavLink[]> = {
  candidate: [
    { to: "/candidate", label: "Dashboard" },
    { to: "/applications", label: "My Applications" },
    { to: "/resumes", label: "My Resumes" },
    { to: "/inbox", label: "Inbox" },
    { to: "/support", label: "Support" },
  ],
  recruiter: [
    { to: "/recruiter", label: "Dashboard" },
    { to: "/resumes", label: "Candidates" },
    { to: "/support", label: "Support" },
  ],
  admin: [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/jobs", label: "Jobs Oversight" },
    { to: "/admin/support", label: "Support" },
  ],
};

export function roleHome(role: UserRole): string {
  return HOME_BY_ROLE[role];
}

export function navigationFor(role: UserRole): NavLink[] {
  return NAV_BY_ROLE[role];
}
