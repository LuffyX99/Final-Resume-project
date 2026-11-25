import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportCenter from "../SupportCenter";
import type { SupportThread } from "../../types";

const { authUser } = vi.hoisted(() => ({
  authUser: {
    id: "admin-1",
    role: "admin",
    full_name: "Admin User",
    email: "admin@example.com",
    is_active: true,
  },
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: authUser,
    loading: false,
    refreshUser: vi.fn(),
  }),
}));

vi.mock("../../api/client", () => ({
  getSupportThreads: vi.fn(),
  getSupportThread: vi.fn(),
  createSupportThread: vi.fn(),
  sendSupportMessage: vi.fn(),
  updateSupportThreadStatus: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

import {
  getSupportThreads,
  getSupportThread,
  sendSupportMessage,
  updateSupportThreadStatus,
} from "../../api/client";

const getSupportThreadsMock = vi.mocked(getSupportThreads);
const getSupportThreadMock = vi.mocked(getSupportThread);
const sendSupportMessageMock = vi.mocked(sendSupportMessage);
const updateSupportThreadStatusMock = vi.mocked(updateSupportThreadStatus);

const mockThread: SupportThread = {
  id: "thread-1",
  user_id: "user-1",
  user_role: "candidate",
  user_name: "Alice Candidate",
  user_email: "alice@example.com",
  subject: "Cannot submit application",
  category: "technical",
  status: "open",
  created_at: "2026-01-08T10:00:00Z",
  updated_at: "2026-01-08T10:00:00Z",
  messages: [
    {
      id: "msg-1",
      thread_id: "thread-1",
      sender_id: "user-1",
      sender_role: "candidate",
      sender_name: "Alice Candidate",
      content: "I am getting a timeout error during resume upload.",
      created_at: "2026-01-08T10:00:00Z",
    },
  ],
  message_count: 1,
};

describe("SupportCenter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders thread list, opens thread and renders chat messages", async () => {
    const user = userEvent.setup();
    getSupportThreadsMock.mockResolvedValue({
      items: [mockThread],
      total: 1,
      open_count: 1,
      resolved_count: 0,
    });
    getSupportThreadMock.mockResolvedValue(mockThread);

    render(
      <MemoryRouter>
        <SupportCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Cannot submit application")).toBeInTheDocument();
    expect(screen.getByText("Alice Candidate (candidate)")).toBeInTheDocument();

    const threadItem = screen.getByText("Cannot submit application");
    await user.click(threadItem);

    expect(
      await screen.findByText("I am getting a timeout error during resume upload."),
    ).toBeInTheDocument();
  });

  it("allows admin to send reply and resolve the thread", async () => {
    const user = userEvent.setup();
    getSupportThreadsMock.mockResolvedValue({
      items: [mockThread],
      total: 1,
      open_count: 1,
      resolved_count: 0,
    });
    getSupportThreadMock.mockResolvedValue(mockThread);
    sendSupportMessageMock.mockResolvedValue({
      id: "msg-2",
      thread_id: "thread-1",
      sender_id: "admin-1",
      sender_role: "admin",
      sender_name: "Admin User",
      content: "We checked the server logs and increased the upload limit.",
      created_at: "2026-01-08T10:15:00Z",
    });
    updateSupportThreadStatusMock.mockResolvedValue({
      ...mockThread,
      status: "resolved",
    });

    render(
      <MemoryRouter>
        <SupportCenter />
      </MemoryRouter>,
    );

    const threadItem = await screen.findByText("Cannot submit application");
    await user.click(threadItem);

    // Send reply
    const replyInput = await screen.findByPlaceholderText("Type your response to the thread...");
    await user.type(replyInput, "We checked the server logs and increased the upload limit.");

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await user.click(sendBtn);

    await waitFor(() => {
      expect(sendSupportMessageMock).toHaveBeenCalledWith(
        "thread-1",
        "We checked the server logs and increased the upload limit.",
      );
    });

    // Mark Resolved
    const resolveBtn = screen.getByRole("button", { name: "Mark Resolved" });
    await user.click(resolveBtn);

    await waitFor(() => {
      expect(updateSupportThreadStatusMock).toHaveBeenCalledWith("thread-1", "resolved");
    });
  });
});
