import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/client";
import { useLiveResource } from "../hooks/useLiveResource";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import type { Notification } from "../types";

export default function Inbox() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const { data, loading, refreshing, error, refresh } = useLiveResource(
    `notifications:${filter}`,
    () => getNotifications(filter === "unread"),
  );

  useRealtimeSync({
    events: ["notification.created"],
    onEvent: () => {
      void refresh();
    },
  });

  const notifications = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;

  async function handleMarkOneRead(id: string) {
    try {
      await markNotificationRead(id);
      await refresh();
    } catch {
      // Refresh gracefully
      await refresh();
    }
  }

  async function handleMarkAllRead() {
    try {
      setMarkingAll(true);
      await markAllNotificationsRead();
      await refresh();
    } finally {
      setMarkingAll(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading your messages...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
            Candidate Workspace
          </p>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-display text-4xl font-bold tracking-tight text-base-50">
              Inbox
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-neon/15 border border-neon/30 px-3 py-0.5 font-mono text-xs font-semibold text-neon shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-base-300 text-sm">
            Interview invitations, schedules, and communication from recruiters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll || refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-800/80 px-3.5 py-2 text-xs font-semibold text-base-200 hover:bg-base-700 hover:text-base-50 transition-all disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5 text-base-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {markingAll ? "Marking..." : "Mark all as read"}
            </button>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-base-700 bg-base-800 px-4 py-2 text-xs font-medium text-base-200 hover:bg-base-700 hover:border-base-600 transition-all duration-200 disabled:opacity-40"
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.182a8.25 8.25 0 10-2.332 8.163"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
        >
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b border-base-700/60 pb-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            filter === "all"
              ? "bg-neon/10 text-neon border border-neon/30"
              : "text-base-400 hover:text-base-200"
          }`}
        >
          All Messages
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            filter === "unread"
              ? "bg-neon/10 text-neon border border-neon/30"
              : "text-base-400 hover:text-base-200"
          }`}
        >
          Unread Only
          {unreadCount > 0 && (
            <span className="rounded-full bg-neon/20 px-1.5 py-0.2 font-mono text-[10px] text-neon">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Messages List */}
      {notifications.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-base-800 border border-base-700 text-base-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold text-base-100">
            {filter === "unread" ? "No unread messages" : "Your inbox is empty"}
          </h3>
          <p className="mt-2 text-sm text-base-400 max-w-md mx-auto">
            {filter === "unread"
              ? "You've read all your notifications."
              : "When recruiters review your applications and send interview invitations, they will appear here."}
          </p>
          <div className="mt-6">
            <Link
              to="/applications"
              className="inline-flex items-center gap-1.5 rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-200 hover:bg-base-700 transition-colors"
            >
              View My Applications
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => (
            <NotificationCard
              key={item.id}
              notification={item}
              onMarkRead={() => void handleMarkOneRead(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const details = notification.details;
  const isInvitation = notification.notification_type === "shortlist_invitation";
  const isVenueLink = details?.venue?.startsWith("http://") || details?.venue?.startsWith("https://");

  return (
    <article
      aria-label={notification.title}
      className={`rounded-xl border transition-all ${
        !notification.is_read
          ? "border-neon/40 bg-base-900/90 shadow-[0_0_15px_rgba(0,240,255,0.06)]"
          : "border-base-700/60 bg-base-900/40 opacity-90"
      } p-5 sm:p-6`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Unread indicator dot */}
          {!notification.is_read ? (
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-neon shadow-[0_0_8px_rgba(0,240,255,0.8)]"
              title="Unread message"
            />
          ) : (
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-base-600" />
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-accent/30 bg-emerald-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-accent">
                {isInvitation ? "Interview Invitation" : "Notification"}
              </span>
              {details?.mode && (
                <span className="rounded-full border border-base-700 bg-base-800 px-2 py-0.5 text-[10px] font-medium text-base-300 capitalize">
                  {details.mode}
                </span>
              )}
            </div>

            <h3 className="mt-2 font-display text-lg font-bold text-base-50">
              {notification.title}
            </h3>

            <p className="mt-1 text-xs text-base-400 font-mono">
              Received {new Date(notification.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Read State Toggle */}
        {!notification.is_read && (
          <button
            type="button"
            onClick={onMarkRead}
            className="self-start rounded-lg border border-base-700 bg-base-800 px-3 py-1 text-xs font-semibold text-base-300 hover:border-base-600 hover:text-base-100 transition-colors"
          >
            Mark as read
          </button>
        )}
      </div>

      {/* Structured Details Card */}
      {details && (
        <div className="mt-5 rounded-xl border border-base-800 bg-base-950/60 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-base-400 font-semibold uppercase tracking-wider text-[10px]">
                Date &amp; Time
              </p>
              <p className="mt-1 text-sm font-semibold text-base-100 font-mono">
                {details.interview_date}
                {details.interview_time && ` at ${details.interview_time}`}
              </p>
            </div>

            <div>
              <p className="text-base-400 font-semibold uppercase tracking-wider text-[10px]">
                Format
              </p>
              <p className="mt-1 text-sm font-semibold text-base-100 capitalize">
                {details.mode}
              </p>
            </div>
          </div>

          <div className="border-t border-base-800/80 pt-3">
            <p className="text-base-400 font-semibold uppercase tracking-wider text-[10px]">
              Venue / Meeting Link
            </p>
            <div className="mt-1 text-sm text-base-100">
              {isVenueLink ? (
                <a
                  href={details.venue}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-mono text-neon hover:underline break-all"
                >
                  {details.venue}
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <p className="font-mono text-base-200">{details.venue}</p>
              )}
            </div>
          </div>

          <div className="border-t border-base-800/80 pt-3">
            <p className="text-base-400 font-semibold uppercase tracking-wider text-[10px]">
              Contact Person
            </p>
            <p className="mt-1 text-xs text-base-200">{details.contact_person}</p>
          </div>

          {details.notes && (
            <div className="border-t border-base-800/80 pt-3">
              <p className="text-base-400 font-semibold uppercase tracking-wider text-[10px]">
                Preparation &amp; Notes
              </p>
              <p className="mt-1.5 text-xs text-base-300 leading-relaxed bg-base-900/60 p-3 rounded-lg border border-base-800">
                {details.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
