import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_BYTES,
  validateApplicantDetails,
  validateResumeFile,
} from "../application";

describe("validateApplicantDetails", () => {
  const valid = {
    full_name: "Ada Candidate",
    phone_number: "+919876543210",
    age: "29",
    gender: "female",
  };

  it("accepts complete applicant details", () => {
    expect(validateApplicantDetails(valid)).toEqual({});
  });

  it("normalizes phone separators before validating", () => {
    expect(
      validateApplicantDetails({
        ...valid,
        phone_number: "+91 98765-43210",
      }),
    ).toEqual({});
  });

  it("requires a name, phone, age, and gender", () => {
    const errors = validateApplicantDetails({
      full_name: " ",
      phone_number: "",
      age: "",
      gender: "",
    });
    expect(errors.full_name).toBeDefined();
    expect(errors.phone_number).toBeDefined();
    expect(errors.age).toBeDefined();
    expect(errors.gender).toBeDefined();
  });

  it("rejects invalid age and phone values", () => {
    const errors = validateApplicantDetails({
      ...valid,
      phone_number: "123",
      age: "17",
    });
    expect(errors.phone_number).toContain("10 to 15 digits");
    expect(errors.age).toContain("between 18 and 100");
  });
});

describe("validateResumeFile", () => {
  it("requires a file", () => {
    expect(validateResumeFile(null)).toContain("Select");
  });

  it("accepts a PDF and a DOCX", () => {
    expect(
      validateResumeFile(
        new File(["%PDF-1.4"], "resume.pdf", { type: "application/pdf" }),
      ),
    ).toBeUndefined();
    expect(
      validateResumeFile(
        new File(["PK"], "resume.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects unsupported extensions", () => {
    expect(
      validateResumeFile(new File(["hello"], "resume.txt", { type: "text/plain" })),
    ).toContain("Only PDF and DOCX");
  });

  it("rejects empty and oversized files", () => {
    expect(
      validateResumeFile(new File([], "empty.pdf", { type: "application/pdf" })),
    ).toContain("empty");

    expect(
      validateResumeFile(
        new File([new Uint8Array(MAX_RESUME_BYTES + 1)], "large.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toContain("5 MB or smaller");
  });
});
