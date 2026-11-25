import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";

export interface LiveResource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface LiveState<T> {
  key: string;
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
}

/**
 * Fetch a resource from the API and keep exactly one in-screen copy of it.
 *
 * - `key` changes trigger a fresh fetch (route params, filters, pagination).
 * - `refresh()` re-fetches from the server; callers use it after every action
 *   instead of patching the response into local state.
 * - A response is only adopted if it is still the newest request and belongs
 *   to the current key, so slow/stale responses cannot overwrite newer data.
 */
export function useLiveResource<T>(
  key: string,
  load: () => Promise<T>,
): LiveResource<T> {
  const [state, setState] = useState<LiveState<T>>({
    key,
    data: null,
    loading: true,
    error: null,
    refreshing: false,
  });
  const latestRequest = useRef(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(
    async (mode: "initial" | "refresh", requestKey: string) => {
      const requestId = ++latestRequest.current;

      if (mode === "refresh") {
        setState((prev) =>
          prev.key === requestKey ? { ...prev, refreshing: true } : prev,
        );
      }

      try {
        const next = await loadRef.current();
        if (latestRequest.current === requestId) {
          setState({
            key: requestKey,
            data: next,
            loading: false,
            error: null,
            refreshing: false,
          });
        }
      } catch (err) {
        if (latestRequest.current === requestId) {
          setState((prev) => ({
            key: requestKey,
            data: prev.key === requestKey ? prev.data : null,
            loading: false,
            error: errorMessage(err),
            refreshing: false,
          }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    void run("initial", key);

    return () => {
      // Responses from the previous key are stale from this point on.
      latestRequest.current += 1;
    };
  }, [key, run]);

  const refresh = useCallback(async () => {
    await run("refresh", key);
  }, [key, run]);

  const isCurrent = state.key === key;

  return {
    data: isCurrent ? state.data : null,
    loading: isCurrent ? state.loading : true,
    refreshing: isCurrent ? state.refreshing : false,
    error: isCurrent ? state.error : null,
    refresh,
  };
}
