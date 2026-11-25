import { Link, useNavigate } from "react-router-dom";
import { errorMessage, registerCandidate } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PERSONAL_FIELDS } from "../auth/fields";
import { roleHome } from "../auth/roles";
import AuthTabs from "../components/AuthTabs";
import TextForm from "../components/TextForm";
import { normalizePhone, validateCandidateRegistration } from "../validation/auth";

export default function RegisterCandidate() {
  const { startSession } = useAuth();
  const navigate = useNavigate();

  async function handleRegister(values: Record<string, string>) {
    try {
      const session = await registerCandidate({
        full_name: values.full_name.trim(),
        age: Number(values.age),
        gender: values.gender.trim(),
        email: values.email.trim(),
        phone_number: normalizePhone(values.phone_number),
        password: values.password,
        confirm_password: values.confirm_password,
      });
      startSession(session);
      navigate(roleHome(session.user.role), { replace: true });
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  }

  return (
    <div className="animate-fade-in">
      <AuthTabs active="candidate" />
      <TextForm
        title="Create Candidate Account"
        fields={PERSONAL_FIELDS}
        submitLabel="Create Account"
        validate={validateCandidateRegistration}
        onSubmit={handleRegister}
      />
      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-base-400">
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-neon hover:text-neon-dim transition-colors duration-200"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
