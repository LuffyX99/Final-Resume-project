import { useState } from "react";
import { sendShortlistInvite } from "../api/client";

interface InterviewInviteModalProps {
  applicationId?: string | null;
  matchId?: string | null;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  company: string;
  recruiterName?: string;
  recruiterEmail?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InterviewInviteModal({
  applicationId,
  matchId,
  candidateName,
  candidateEmail,
  jobTitle,
  company,
  recruiterName = "",
  recruiterEmail = "",
  onClose,
  onSuccess,
}: InterviewInviteModalProps) {
  const defaultContact = [recruiterName, recruiterEmail]
    .filter(Boolean)
    .join(" - ");

  const [venue, setVenue] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [mode, setMode] = useState<"online" | "in-person" | "phone">("online");
  const [contactPerson, setContactPerson] = useState(defaultContact || "Hiring Team");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!venue.trim() || !interviewDate.trim() || !contactPerson.trim()) {
      setError("Venue/Link, Date, and Contact Person are required.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await sendShortlistInvite({
        application_id: applicationId ?? undefined,
        match_id: matchId ?? undefined,
        venue: venue.trim(),
        interview_date: interviewDate.trim(),
        interview_time: interviewTime.trim(),
        mode,
        contact_person: contactPerson.trim(),
        notes: notes.trim(),
      });
      onSuccess();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to send invitation.");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-base-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-base-700 bg-base-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-base-700/60 p-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-accent">
              Shortlist Communication
            </p>
            <h2
              id="interview-invite-modal-title"
              className="mt-1 font-display text-xl font-bold text-base-50"
            >
              Invite {candidateName}
            </h2>
            <p className="text-xs text-base-400">
              {jobTitle} at {company}
              {candidateEmail && <span className="text-base-300"> · {candidateEmail}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-base-400 hover:bg-base-800 hover:text-base-100 transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-3.5 text-xs text-rose-accent"
            >
              {error}
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-2">
              Interview Format / Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["online", "in-person", "phone"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all ${
                    mode === m
                      ? "border-neon bg-neon/10 text-neon shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                      : "border-base-700 bg-base-800 text-base-300 hover:border-base-600 hover:text-base-100"
                  }`}
                >
                  {m === "online" ? "🌐 Online" : m === "in-person" ? "🏢 In-Person" : "📞 Phone"}
                </button>
              ))}
            </div>
          </div>

          {/* Venue / Meeting Link */}
          <div>
            <label htmlFor="interview-venue" className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
              Venue / Meeting URL <span className="text-rose-accent">*</span>
            </label>
            <input
              id="interview-venue"
              type="text"
              required
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder={
                mode === "online"
                  ? "https://meet.google.com/abc-def-xyz"
                  : mode === "phone"
                  ? "We will call your phone number"
                  : "Acme HQ, 4th Floor, Tech Hub, Downtown"
              }
              className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
            />
          </div>

          {/* Date and Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="interview-date" className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                Date <span className="text-rose-accent">*</span>
              </label>
              <input
                id="interview-date"
                type="date"
                required
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="interview-time" className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                Time (e.g. 10:30 AM EST)
              </label>
              <input
                id="interview-time"
                type="text"
                value={interviewTime}
                onChange={(e) => setInterviewTime(e.target.value)}
                placeholder="10:00 AM UTC"
                className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Contact Person */}
          <div>
            <label htmlFor="interview-contact" className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
              Contact Person / Lead <span className="text-rose-accent">*</span>
            </label>
            <input
              id="interview-contact"
              type="text"
              required
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Recruiter Name, Title, and Email / Phone"
              className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
            />
          </div>

          {/* Preparation Notes */}
          <div>
            <label htmlFor="interview-notes" className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
              Preparation Notes (Optional)
            </label>
            <textarea
              id="interview-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What to prepare, expected duration, agenda, or materials to bring..."
              className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-base-700/60">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:bg-base-700 hover:text-base-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-accent px-5 py-2 text-xs font-semibold text-base-950 hover:bg-emerald-accent/90 transition-all shadow-[0_0_15px_rgba(52,211,153,0.25)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-3 w-3 rounded-full border-2 border-base-950/30 border-t-base-950 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Invitation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
