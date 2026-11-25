import type { FieldErrors } from "../types";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{10,15}$/;

export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s\-().]/g, "");
}

function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "This field cannot be empty.";
  if (name.length < 2) return "Full name must be at least 2 characters.";
  if (name.length > 255) return "Full name must be 255 characters or fewer.";
}

function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Email is required.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
}

function validateAge(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return "Age is required.";

  const age = Number(raw);
  if (!Number.isInteger(age)) return "Age must be a whole number.";
  if (age < 18 || age > 100) return "Age must be between 18 and 100.";
}

function validatePhone(value: string): string | undefined {
  const digits = normalizePhone(value);
  if (!digits) return "Phone number is required.";
  if (!PHONE_PATTERN.test(digits)) {
    return "Phone number must contain 10 to 15 digits, optionally prefixed with +.";
  }
}

function validatePassword(value: string): string | undefined {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;

  if (classes < 3) {
    return "Password must combine at least three of: lowercase letters, uppercase letters, digits, symbols.";
  }
}

function validateAccount(values: FieldErrors): FieldErrors {
  const errors: FieldErrors = {};

  const name = validateName(values.full_name ?? "");
  if (name) errors.full_name = name;

  const age = validateAge(values.age ?? "");
  if (age) errors.age = age;

  if (!(values.gender ?? "").trim()) {
    errors.gender = "This field cannot be empty.";
  }

  const email = validateEmail(values.email ?? "");
  if (email) errors.email = email;

  const phone = validatePhone(values.phone_number ?? "");
  if (phone) errors.phone_number = phone;

  const password = validatePassword(values.password ?? "");
  if (password) errors.password = password;

  if (!values.confirm_password) {
    errors.confirm_password = "Please confirm your password.";
  } else if (values.password !== values.confirm_password) {
    errors.confirm_password = "Passwords do not match.";
  }

  return errors;
}

export function validateLogin(values: FieldErrors): FieldErrors {
  const errors: FieldErrors = {};

  const email = validateEmail(values.email ?? "");
  if (email) errors.email = email;

  if (!values.password) errors.password = "Password is required.";

  return errors;
}

export function validateCandidateRegistration(values: FieldErrors): FieldErrors {
  return validateAccount(values);
}

export function validateRecruiterRegistration(values: FieldErrors): FieldErrors {
  const errors = validateAccount(values);

  const company = (values.company_name ?? "").trim();
  if (!company) {
    errors.company_name = "This field cannot be empty.";
  } else if (company.length < 2) {
    errors.company_name = "Company name must be at least 2 characters.";
  }

  return errors;
}
