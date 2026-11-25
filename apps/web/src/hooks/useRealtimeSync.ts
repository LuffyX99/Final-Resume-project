import { useEffect, useRef, useState } from "react";
import * as clientModule from "../api/client";
import { useAuth } from "../auth/AuthContext";

function useSafeAuthUser() {
  try {
    const auth = useAuth();
    return auth?.user ?? null;
  } catch {
    return null;
  }
}

function getSafeToken(): string | null {
  try {
    if (typeof clientModule.getStoredToken === "function") {
      return clientModule.getStoredToken();
    }
  } catch {
    // fallback
  }
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("auth_token");
    }
  } catch {
    // ignore
  }
  return null;
}

export interface RealtimeEvent<T = any> {
  event: string;
  data: T;
  timestamp: string;
}

export interface UseRealtimeSyncOptions {
  /**
   * Array of event names to listen to (e.g. ['job.created', 'application.submitted'])
   * or omit to listen to all events.
   */
  events?: string[];
  /**
   * Callback invoked when a matching event arrives.
   * Typically: () => refresh() or (event) => refresh()
   */
  onEvent?: (event: RealtimeEvent) => void;
  /**
   * Whether subscription is active. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Fallback short polling interval in ms when SSE connection is down or disconnected.
   * Default: 10_000 (10s). Set to 0 to disable fallback polling.
   */
  fallbackPollInterval?: number;
}

export function useRealtimeSync(options: UseRealtimeSyncOptions = {}) {
  const user = useSafeAuthUser();
  const token = getSafeToken();
  const {
    events,
    onEvent,
    enabled = true,
    fallbackPollInterval = 10_000,
  } = options;

  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Keep a stable ref to events filter
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!enabled || !token || !user) {
      setConnected(false);
      return;
    }

    let isSubscribed = true;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const startFallbackPolling = () => {
      if (fallbackPollInterval > 0 && !fallbackPollTimer) {
        fallbackPollTimer = setInterval(() => {
          if (onEventRef.current) {
            onEventRef.current({
              event: "polling.tick",
              data: {},
              timestamp: new Date().toISOString(),
            });
          }
        }, fallbackPollInterval);
      }
    };

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const connect = () => {
      if (!isSubscribed) return;

      if (typeof window === "undefined" || typeof EventSource === "undefined") {
        return;
      }

      const url = `/api/events/stream?token=${encodeURIComponent(token)}`;
      try {
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          if (!isSubscribed) return;
          setConnected(true);
          stopFallbackPolling();
        };

        const handleIncoming = (eventName: string, ev: MessageEvent) => {
          if (!isSubscribed) return;
          let parsedData = {};
          try {
            parsedData = JSON.parse(ev.data);
          } catch {
            parsedData = ev.data;
          }

          const realtimeEvent: RealtimeEvent = {
            event: eventName,
            data: parsedData,
            timestamp: new Date().toISOString(),
          };

          const activeFilters = eventsRef.current;
          if (
            !activeFilters ||
            activeFilters.length === 0 ||
            activeFilters.includes(eventName)
          ) {
            onEventRef.current?.(realtimeEvent);
          }
        };

        const platformEvents = [
          "connected",
          "job.created",
          "job.updated",
          "job.closed",
          "job.taken_down",
          "application.submitted",
          "scores.ready",
          "application.shortlist_overridden",
          "notification.created",
          "support.thread_created",
          "support.message_created",
          "support.thread_resolved",
          "admin.user_status_changed",
        ];

        platformEvents.forEach((ename) => {
          eventSource?.addEventListener(ename, (e: MessageEvent) => {
            handleIncoming(ename, e);
          });
        });

        eventSource.onmessage = (e: MessageEvent) => {
          handleIncoming("message", e);
        };

        eventSource.onerror = () => {
          if (!isSubscribed) return;
          setConnected(false);
          eventSource?.close();
          eventSource = null;

          startFallbackPolling();

          // Auto-reconnect after 3s
          reconnectTimeout = setTimeout(() => {
            if (isSubscribed) {
              connect();
            }
          }, 3000);
        };
      } catch {
        setConnected(false);
        startFallbackPolling();
      }
    };

    connect();

    return () => {
      isSubscribed = false;
      setConnected(false);
      stopFallbackPolling();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [enabled, token, user, fallbackPollInterval]);

  return { connected };
}
