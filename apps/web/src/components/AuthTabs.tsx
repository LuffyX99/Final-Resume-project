import { Link } from "react-router-dom";

const TABS = [
  { key: "login", to: "/login", label: "Sign In" },
  { key: "candidate", to: "/register/candidate", label: "Candidate" },
  { key: "recruiter", to: "/register/recruiter", label: "Recruiter" },
] as const;

type AuthTab = (typeof TABS)[number]["key"];

export default function AuthTabs({ active }: { active: AuthTab }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            aria-current={active === tab.key ? "page" : undefined}
            className={
              active === tab.key
                ? "rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 shadow-[0_0_12px_rgba(0,240,255,0.15)]"
                : "rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
