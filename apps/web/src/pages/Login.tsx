import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { SIGN_IN_FIELDS } from "../auth/fields";
import { roleHome } from "../auth/roles";
import AuthTabs from "../components/AuthTabs";
import TextForm from "../components/TextForm";
import { validateLogin } from "../validation/auth";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSignIn(values: Record<string, string>) {
    try {
      const user = await signIn(values.email.trim(), values.password);
      navigate(roleHome(user.role), { replace: true });
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  }

  return (
    <div className="animate-fade-in">
      <AuthTabs active="login" />

      <TextForm
        title="Sign In"
        fields={SIGN_IN_FIELDS}
        submitLabel="Sign In"
        validate={validateLogin}
        initialValues={{ email: "", password: "" }}
        onSubmit={handleSignIn}
      />
      <div className="mx-auto mt-6 max-w-2xl text-center space-y-3">
        <p className="text-sm text-base-400">
          Sign in to access candidate, recruiter, or platform administrator dashboards.
        </p>
        <div>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neon hover:text-neon-dim transition-colors"
          >
            Platform Administrator? Sign in to Admin Portal &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
