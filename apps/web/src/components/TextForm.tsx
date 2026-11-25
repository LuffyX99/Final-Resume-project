import { useEffect, useState } from "react";
import type { FieldErrors } from "../types";

export interface Field {
  name: string;
  label: string;
  type: "text" | "textarea" | "email" | "password";
  placeholder?: string;
  required?: boolean;
}

interface TextFormProps {
  title: string;
  fields: Field[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  validate?: (values: Record<string, string>) => FieldErrors;
  initialValues?: Record<string, string>;
  renderFieldExtra?: (
    fieldName: string,
    values: Record<string, string>,
    setFieldValue: (name: string, value: string) => void,
  ) => React.ReactNode;
  submitDisabled?: boolean;
}

export default function TextForm({
  title,
  fields,
  submitLabel,
  onSubmit,
  validate,
  initialValues,
  renderFieldExtra,
  submitDisabled,
}: TextFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(fields.map((f) => [f.name, ""])),
    ...(initialValues || {}),
  }));

  useEffect(() => {
    if (initialValues) {
      setValues((prev) => ({ ...prev, ...initialValues }));
    }
  }, [initialValues]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate ? validate(values) : {};
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setError(null);
    setLoading(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function inputClass(hasError: boolean) {
    return `w-full rounded-xl border ${
      hasError ? "border-rose-accent/60" : "border-base-600"
    } bg-base-800 px-4 py-3 text-sm text-base-50 placeholder-base-400 focus:border-neon focus:ring-1 focus:ring-neon/30 focus:outline-none transition-all duration-200`;
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <h1 className="mb-8 font-display text-3xl font-bold text-base-50">
        {title}
      </h1>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        noValidate={Boolean(validate)}
      >
        {fields.map((field) => {
          const fieldError = errors[field.name];
          const errorId = `${field.name}-error`;

          return (
            <div key={field.name}>
              <label
                htmlFor={field.name}
                className="mb-2 block text-sm font-medium text-base-200"
              >
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={field.name}
                  value={values[field.name]}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={8}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? errorId : undefined}
                  className={`${inputClass(Boolean(fieldError))} resize-none`}
                />
              ) : (
                <input
                  id={field.name}
                  type={field.type}
                  value={values[field.name]}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? errorId : undefined}
                  className={inputClass(Boolean(fieldError))}
                />
              )}
              {fieldError && (
                <p id={errorId} className="mt-2 text-sm text-rose-accent">
                  {fieldError}
                </p>
              )}
              {renderFieldExtra &&
                renderFieldExtra(field.name, values, (name, val) =>
                  handleChange(name, val),
                )}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={loading || submitDisabled}
          className="w-full rounded-xl bg-neon px-5 py-3 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_0_20px_rgba(0,240,255,0.15)] hover:shadow-[0_0_30px_rgba(0,240,255,0.25)]"
        >
          {loading ? "Submitting..." : submitLabel}
        </button>
      </form>
    </div>
  );
}
