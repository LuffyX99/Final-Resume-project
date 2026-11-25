import type { Field } from "../components/TextForm";

export const SIGN_IN_FIELDS: Field[] = [
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    required: true,
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    required: true,
  },
];

export const PERSONAL_FIELDS: Field[] = [
  {
    name: "full_name",
    label: "Full Name",
    type: "text",
    placeholder: "e.g. Jane Doe",
    required: true,
  },
  {
    name: "age",
    label: "Age",
    type: "text",
    placeholder: "e.g. 28",
    required: true,
  },
  {
    name: "gender",
    label: "Gender",
    type: "text",
    placeholder: "e.g. female",
    required: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    required: true,
  },
  {
    name: "phone_number",
    label: "Phone Number",
    type: "text",
    placeholder: "e.g. +919876543210",
    required: true,
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "At least 10 characters",
    required: true,
  },
  {
    name: "confirm_password",
    label: "Confirm Password",
    type: "password",
    required: true,
  },
];

export const COMPANY_FIELDS: Field[] = [
  {
    name: "company_name",
    label: "Company Name",
    type: "text",
    placeholder: "e.g. Acme Corp",
    required: true,
  },
  {
    name: "company_location",
    label: "Company Location",
    type: "text",
    placeholder: "e.g. Bengaluru, India",
  },
];
