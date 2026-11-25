import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  validateCandidateRegistration,
  validateLogin,
  validateRecruiterRegistration,
} from "../auth";

function candidate(overrides: Record<string, string> = {}) {
  return {
    full_name: "Jane Doe",
    age: "28",
    gender: "female",
    email: "jane@example.com",
    phone_number: "+919876543210",
    password: "Str0ng!Passw0rd",
    confirm_password: "Str0ng!Passw0rd",
    ...overrides,
  };
}

describe("auth validation", () => {
  it("accepts a complete candidate registration", () => {
    expect(validateCandidateRegistration(candidate())).toEqual({});
  });

  it("rejects a short password", () => {
    const errors = validateCandidateRegistration(
      candidate({ password: "short", confirm_password: "short" }),
    );
    expect(errors.password).toContain("at least 10 characters");
  });

  it("rejects a password without enough character classes", () => {
    const errors = validateCandidateRegistration(
      candidate({
        password: "aaaaaaaaaaaa",
        confirm_password: "aaaaaaaaaaaa",
      }),
    );
    expect(errors.password).toContain("combine at least three");
  });

  it("rejects mismatched passwords", () => {
    const errors = validateCandidateRegistration(
      candidate({ confirm_password: "Different!1234" }),
    );
    expect(errors.confirm_password).toBe("Passwords do not match.");
  });

  it("rejects malformed phone numbers", () => {
    const errors = validateCandidateRegistration(
      candidate({ phone_number: "not-a-phone" }),
    );
    expect(errors.phone_number).toContain("10 to 15 digits");
  });

  it("rejects ages outside the allowed range", () => {
    expect(
      validateCandidateRegistration(candidate({ age: "17" })).age,
    ).toContain("between 18 and 100");
    expect(
      validateCandidateRegistration(candidate({ age: "101" })).age,
    ).toContain("between 18 and 100");
  });

  it("requires a company name for recruiters only", () => {
    const personal = candidate();
    expect(validateCandidateRegistration(personal)).toEqual({});

    const errors = validateRecruiterRegistration({
      ...personal,
      company_name: "",
    });
    expect(errors.company_name).toBe("This field cannot be empty.");

    expect(
      validateRecruiterRegistration({ ...personal, company_name: "Acme" }),
    ).toEqual({});
  });

  it("validates the login form", () => {
    const errors = validateLogin({ email: "not-an-email", password: "" });
    expect(errors.email).toBe("Enter a valid email address.");
    expect(errors.password).toBe("Password is required.");
  });

  it("strips formatting characters from phone numbers", () => {
    expect(normalizePhone(" +91 (98765) 43210 ")).toBe("+919876543210");
  });
});
