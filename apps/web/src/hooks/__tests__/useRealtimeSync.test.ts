import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRealtimeSync } from "../useRealtimeSync";
import * as clientModule from "../../api/client";
import * as authModule from "../../auth/AuthContext";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (event: MessageEvent) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (event: MessageEvent) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  triggerOpen() {
    if (this.onopen) this.onopen();
  }

  triggerError() {
    if (this.onerror) this.onerror();
  }

  triggerEvent(eventName: string, data: unknown) {
    const event = new MessageEvent(eventName, {
      data: JSON.stringify(data),
    });
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach((handler) => handler(event));
    }
  }
}

describe("useRealtimeSync hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource,
    });

    vi.spyOn(clientModule, "getStoredToken").mockReturnValue("test-jwt-token");
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      user: {
        id: "user-123",
        email: "alice@example.com",
        role: "candidate",
        full_name: "Alice",
        phone_number: null,
        age: null,
        gender: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      loading: false,
      signIn: vi.fn(),
      startSession: vi.fn(),
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("subscribes to EventSource with stored token and reports connected state", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeSync({
        events: ["job.created"],
        onEvent,
      }),
    );

    expect(MockEventSource.instances.length).toBe(1);
    const instance = MockEventSource.instances[0];
    expect(instance.url).toContain("/api/events/stream?token=test-jwt-token");
    expect(result.current.connected).toBe(false);

    // Simulate connection open
    act(() => {
      instance.triggerOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it("delivers matching events to onEvent callback", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useRealtimeSync({
        events: ["job.created", "application.submitted"],
        onEvent,
      }),
    );

    const instance = MockEventSource.instances[0];
    act(() => {
      instance.triggerOpen();
    });

    // Fire matching event
    act(() => {
      instance.triggerEvent("job.created", {
        job_id: "j-1",
        title: "Frontend Engineer",
      });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "job.created",
        data: { job_id: "j-1", title: "Frontend Engineer" },
      }),
    );

    // Fire non-matching event (filtered out)
    act(() => {
      instance.triggerEvent("support.thread_resolved", { thread_id: "t-1" });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("handles disconnection and triggers fallback short polling", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeSync({
        events: ["job.created"],
        onEvent,
        fallbackPollInterval: 5000,
      }),
    );

    const instance = MockEventSource.instances[0];
    act(() => {
      instance.triggerOpen();
    });
    expect(result.current.connected).toBe(true);

    // Trigger error/disconnect
    act(() => {
      instance.triggerError();
    });
    expect(result.current.connected).toBe(false);
    expect(instance.closed).toBe(true);

    // Advance 5 seconds to trigger polling tick
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "polling.tick",
      }),
    );
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useRealtimeSync({
        events: ["job.created"],
      }),
    );

    const instance = MockEventSource.instances[0];
    expect(instance.closed).toBe(false);

    unmount();
    expect(instance.closed).toBe(true);
  });
});
