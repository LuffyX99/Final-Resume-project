import type { FieldErrors } from "../types";
import { normalizePhone } from "./auth";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_EXTENSIONS = ["pdf", "docx"] as const;
const PHONE_PATTERN = /^\+?\d{10,15}$/;

export interface ApplicantDetails {
  full_name: string;
  phone_number: string;
  age: string;
  gender: string;
}

export function validateApplicantDetails(
  values: ApplicantDetails,
): FieldErrors {
  const errors: FieldErrors = {};

  const name = values.full_name.trim();
  if (!name) {
    errors.full_name = "Full name is required.";
  } else if (name.length < 2) {
    errors.full_name = "Full name must be at least 2 characters.";
  } else if (name.length > 255) {
    errors.full_name = "Full name must be 255 characters or fewer.";
  }

  const rawPhone = values.phone_number.trim();
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    errors.phone_number = "Phone number is required.";
  } else if (!PHONE_PATTERN.test(phone)) {
    errors.phone_number =
      "Phone number must contain 10 to 15 digits, optionally prefixed with +.";
  }

  const rawAge = values.age.trim();
  if (!rawAge) {
    errors.age = "Age is required.";
  } else {
    const age = Number(rawAge);
    if (!Number.isInteger(age)) {
      errors.age = "Age must be a whole number.";
    } else if (age < 18 || age > 100) {
      errors.age = "Age must be between 18 and 100.";
    }
  }

  if (!values.gender.trim()) {
    errors.gender = "Gender is required.";
  }

  return errors;
}

export function validateResumeFile(file: File | null): string | undefined {
  if (!file) return "Select a PDF or DOCX resume to continue.";

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : "";
  if (!extension || !RESUME_EXTENSIONS.includes(extension as "pdf" | "docx")) {
    return "Only PDF and DOCX resumes are supported.";
  }

  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_RESUME_BYTES) {
    return `Resume must be ${MAX_RESUME_BYTES / (1024 * 1024)} MB or smaller.`;
  }

  return undefined;
}
