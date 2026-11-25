import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getSupportThreads,
  getSupportThread,
  createSupportThread,
  sendSupportMessage,
  updateSupportThreadStatus,
  errorMessage,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import type { SupportThread } from "../types";

export default function SupportCenter() {
  const { user } = useAuth();
  const { admin } = useAdminAuth();
  const isAdmin = user?.role === "admin" || Boolean(admin);

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Thread view
  const [activeThread, setActiveThread] = useState<SupportThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  // New Ticket Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newMessage, setNewMessage] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadThreads(filter = statusFilter) {
    try {
      setLoading(true);
      setError(null);
      const data = await getSupportThreads({
        status: filter || undefined,
        search: search.trim() || undefined,
      });
      setThreads(data.items);
      setTotal(data.total);
      setOpenCount(data.open_count);
      setResolvedCount(data.resolved_count);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThreads(statusFilter);
  }, [statusFilter]);

  useRealtimeSync({
    events: [
      "support.message_created",
      "support.thread_created",
      "support.thread_resolved",
      "support.thread_updated",
    ],
    onEvent: (event) => {
      void loadThreads(statusFilter);
      if (activeThread && event.data?.thread_id === activeThread.id) {
        void openThread(activeThread);
      }
    },
  });

  async function openThread(t: SupportThread) {
    try {
      setThreadLoading(true);
      const full = await getSupportThread(t.id);
      setActiveThread(full);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setThreadLoading(false);
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThread || !replyContent.trim()) return;

    try {
      setReplyBusy(true);
      const newMsg = await sendSupportMessage(activeThread.id, replyContent.trim());
      setActiveThread((prev) =>
        prev
          ? {
              ...prev,
              status: prev.status === "resolved" && !isAdmin ? "open" : prev.status,
              messages: [...prev.messages, newMsg],
              message_count: prev.message_count + 1,
            }
          : null,
      );
      setReplyContent("");
      // Refresh thread list metadata
      loadThreads(statusFilter);
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setReplyBusy(false);
    }
  }

  async function handleToggleStatus(targetStatus: "open" | "resolved") {
    if (!activeThread) return;
    try {
      const updated = await updateSupportThreadStatus(activeThread.id, targetStatus);
      setActiveThread(updated);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      loadThreads(statusFilter);
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;

    try {
      setCreateBusy(true);
      setCreateError(null);
      const created = await createSupportThread({
        subject: newSubject.trim(),
        category: newCategory,
        message: newMessage.trim(),
      });
      setShowNewModal(false);
      setNewSubject("");
      setNewCategory("general");
      setNewMessage("");
      await loadThreads(statusFilter);
      openThread(created);
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-700/60 pb-6">
        <div>
          {isAdmin && (
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs font-mono text-neon hover:underline">
                &larr; Admin Nerve Center
              </Link>
            </div>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight text-base-50">
            {isAdmin ? "Central Support Operations" : "Help & Support Desk"}
          </h1>
          <p className="text-xs text-base-400 mt-1">
            {isAdmin
              ? "Resolve inquiries, assist candidates and recruiters, and maintain platform trust."
              : "Direct support line to platform administrators for profile, job, or technical queries."}
          </p>
        </div>

        <div>
          {!isAdmin && (
            <button
              onClick={() => {
                setCreateError(null);
                setShowNewModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 shadow-[0_0_15px_rgba(0,240,255,0.25)] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Raise New Query
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-4 text-xs text-rose-accent">
          {error}
        </div>
      )}

      {/* Main Grid: Ticket List (Left) + Thread Chat (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List Pane */}
        <div className="lg:col-span-5 space-y-4">
          {/* Status Tabs and Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 bg-base-900/60 border border-base-800 p-2 rounded-xl">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setStatusFilter("")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    statusFilter === "" ? "bg-base-800 text-neon font-semibold" : "text-base-400 hover:text-base-200"
                  }`}
                >
                  All ({total})
                </button>
                <button
                  onClick={() => setStatusFilter("open")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    statusFilter === "open" ? "bg-amber-accent/20 text-amber-accent font-semibold" : "text-base-400 hover:text-base-200"
                  }`}
                >
                  Open ({openCount})
                </button>
                <button
                  onClick={() => setStatusFilter("resolved")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    statusFilter === "resolved" ? "bg-emerald-accent/20 text-emerald-accent font-semibold" : "text-base-400 hover:text-base-200"
                  }`}
                >
                  Resolved ({resolvedCount})
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadThreads(statusFilter);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket subject..."
                className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:text-base-50 shrink-0"
              >
                Search
              </button>
            </form>
          </div>

          {/* Threads List */}
          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl border border-base-800 bg-base-900/40 p-8 text-center text-xs text-base-400">
                Loading support tickets...
              </div>
            ) : threads.length === 0 ? (
              <div className="rounded-xl border border-base-800 bg-base-900/40 p-8 text-center text-xs text-base-400">
                No support threads found in this view.
              </div>
            ) : (
              threads.map((t) => {
                const isSelected = activeThread?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => openThread(t)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-neon bg-base-900/90 shadow-[0_0_15px_rgba(0,240,255,0.1)]"
                        : "border-base-800/80 bg-base-900/40 hover:border-base-700 hover:bg-base-900/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-semibold text-xs text-base-100 line-clamp-1">
                        {t.subject}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          t.status === "open"
                            ? "bg-amber-accent/15 text-amber-accent border border-amber-accent/30"
                            : "bg-base-800 text-base-400 border border-base-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-base-400">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-base-800 px-1.5 py-0.5 text-[10px] uppercase font-mono text-base-300">
                          {t.category}
                        </span>
                        {isAdmin && (
                          <span className="text-base-300">
                            {t.user_name} ({t.user_role})
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px]">
                        {t.message_count} msg{t.message_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation Chat Pane (Right) */}
        <div className="lg:col-span-7">
          {activeThread ? (
            <div className="rounded-2xl border border-base-800 bg-base-900/60 overflow-hidden flex flex-col h-[650px]">
              {/* Thread Header */}
              <div className="border-b border-base-800 p-4 bg-base-950/40 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        activeThread.status === "open" ? "bg-amber-accent" : "bg-emerald-accent"
                      }`}
                    />
                    <h2 className="font-semibold text-sm text-base-100">{activeThread.subject}</h2>
                  </div>
                  <div className="text-[11px] text-base-400 mt-0.5 flex items-center gap-3">
                    <span>
                      From: <strong className="text-base-200">{activeThread.user_name}</strong> (
                      {activeThread.user_role})
                    </span>
                    <span>&bull;</span>
                    <span className="font-mono">{activeThread.user_email}</span>
                  </div>
                </div>

                {/* Status Toggle Action for Admin */}
                {isAdmin && (
                  <button
                    onClick={() =>
                      handleToggleStatus(activeThread.status === "open" ? "resolved" : "open")
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeThread.status === "open"
                        ? "bg-emerald-accent text-base-950 hover:bg-emerald-accent/90"
                        : "bg-base-800 text-base-200 hover:bg-base-700"
                    }`}
                  >
                    {activeThread.status === "open" ? "Mark Resolved" : "Re-open Thread"}
                  </button>
                )}
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {threadLoading ? (
                  <div className="text-center py-10 text-xs text-base-400">Loading conversation...</div>
                ) : (
                  activeThread.messages.map((m) => {
                    const isFromAdmin = m.sender_role === "admin";
                    const isCurrentUser = m.sender_id === user?.id;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isCurrentUser ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 text-[11px] text-base-400">
                          <span className="font-semibold text-base-200">{m.sender_name}</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] uppercase font-mono font-bold ${
                              isFromAdmin
                                ? "bg-rose-accent/20 text-rose-accent border border-rose-accent/30"
                                : "bg-base-800 text-base-300"
                            }`}
                          >
                            {m.sender_role}
                          </span>
                          <span className="font-mono text-[10px]">
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div
                          className={`max-w-md rounded-2xl p-3.5 text-xs leading-relaxed ${
                            isCurrentUser
                              ? "bg-neon/15 border border-neon/30 text-base-50 rounded-tr-none shadow-[0_0_10px_rgba(0,240,255,0.08)]"
                              : isFromAdmin
                              ? "bg-rose-accent/10 border border-rose-accent/30 text-base-50 rounded-tl-none"
                              : "bg-base-800/80 border border-base-700/80 text-base-100 rounded-tl-none"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="border-t border-base-800 p-4 bg-base-950/40">
                <div className="flex items-end gap-2">
                  <textarea
                    required
                    rows={2}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Type your response to the thread..."
                    className="flex-1 rounded-xl border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors resize-none"
                  />
                  <button
                    type="submit"
                    disabled={replyBusy || !replyContent.trim()}
                    className="rounded-xl bg-neon px-4 py-2.5 text-xs font-semibold text-base-950 hover:bg-neon/90 transition-all shadow-[0_0_10px_rgba(0,240,255,0.2)] disabled:opacity-50 shrink-0"
                  >
                    {replyBusy ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-[600px] rounded-2xl border border-base-800 bg-base-900/30 flex flex-col items-center justify-center p-8 text-center text-base-400">
              <svg className="w-12 h-12 text-base-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="font-semibold text-base-200 text-sm mb-1">Select a Support Ticket</h3>
              <p className="text-xs max-w-sm">
                Choose a query from the list to view the conversation history and chat directly.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md animate-fade-in"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-neon">
                Help & Support
              </p>
              <h3 className="font-display text-lg font-bold text-base-50 mt-1">
                Raise Query to Platform Admin
              </h3>
              <p className="text-xs text-base-400 mt-1">
                Describe your question or issue. Administrators will respond directly to this thread.
              </p>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                  Category <span className="text-rose-accent">*</span>
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-100 focus:border-neon focus:outline-none"
                >
                  <option value="general">General Inquiry</option>
                  <option value="job_inquiry">Job Posting / Application Query</option>
                  <option value="account">Account & Profile Verification</option>
                  <option value="technical">Technical Issue or Bug</option>
                  <option value="report_fraud">Report Suspicious Job or Resume</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                  Subject / Summary <span className="text-rose-accent">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Question regarding interview invitation link"
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                  Detailed Message <span className="text-rose-accent">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Explain what happened or what you need assistance with..."
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors resize-none"
                />
              </div>

              {createError && (
                <div className="rounded-lg border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  disabled={createBusy}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy || !newSubject.trim() || !newMessage.trim()}
                  className="rounded-lg bg-neon px-5 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 transition-all shadow-[0_0_15px_rgba(0,240,255,0.25)] disabled:opacity-50"
                >
                  {createBusy ? "Submitting..." : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
