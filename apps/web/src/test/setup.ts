import "@testing-library/jest-dom/vitest";

class MockEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
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

  close() {}
}

if (typeof window !== "undefined" && !window.EventSource) {
  (window as any).EventSource = MockEventSource;
}
if (typeof globalThis !== "undefined" && !(globalThis as any).EventSource) {
  (globalThis as any).EventSource = MockEventSource;
}
