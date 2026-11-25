import { Link, useNavigate } from "react-router-dom";
import { errorMessage, registerRecruiter } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { COMPANY_FIELDS, PERSONAL_FIELDS } from "../auth/fields";
import { roleHome } from "../auth/roles";
import AuthTabs from "../components/AuthTabs";
import TextForm from "../components/TextForm";
import { normalizePhone, validateRecruiterRegistration } from "../validation/auth";

export default function RegisterRecruiter() {
  const { startSession } = useAuth();
  const navigate = useNavigate();

  async function handleRegister(values: Record<string, string>) {
    try {
      const session = await registerRecruiter({
        full_name: values.full_name.trim(),
        age: Number(values.age),
        gender: values.gender.trim(),
        email: values.email.trim(),
        phone_number: normalizePhone(values.phone_number),
        password: values.password,
        confirm_password: values.confirm_password,
        company_name: values.company_name.trim(),
        company_location: values.company_location?.trim() || undefined,
      });
      startSession(session);
      navigate(roleHome(session.user.role), { replace: true });
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  }

  return (
    <div className="animate-fade-in">
      <AuthTabs active="recruiter" />
      <TextForm
        title="Create Recruiter Account"
        fields={[...PERSONAL_FIELDS, ...COMPANY_FIELDS]}
        submitLabel="Create Account"
        validate={validateRecruiterRegistration}
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
