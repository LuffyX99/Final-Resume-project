import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Inbox from "../Inbox";
import type { Notification } from "../../types";

vi.mock("../../api/client", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/client";

const getNotificationsMock = vi.mocked(getNotifications);
const markNotificationReadMock = vi.mocked(markNotificationRead);
const markAllNotificationsReadMock = vi.mocked(markAllNotificationsRead);

const sampleNotification: Notification = {
  id: "notif-1",
  user_id: "user-1",
  sender_id: "recruiter-1",
  job_id: "job-1",
  application_id: "app-1",
  title: "Interview Invitation: Senior Backend Engineer at Acme Corp",
  content: "You have been invited for a interview.",
  notification_type: "shortlist_invitation",
  details: {
    venue: "https://meet.google.com/test-room",
    interview_date: "2026-11-25",
    interview_time: "10:00 AM UTC",
    mode: "online",
    contact_person: "Jane Recruiter (recruiter@acme.com)",
    notes: "Prepare for a live system design challenge.",
  },
  is_read: false,
  read_at: null,
  created_at: "2026-11-20T10:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Inbox Page", () => {
  it("renders notifications and interview details", async () => {
    getNotificationsMock.mockResolvedValue({
      items: [sampleNotification],
      unread_count: 1,
    });

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Interview Invitation: Senior Backend Engineer at Acme Corp",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(screen.getByText("2026-11-25 at 10:00 AM UTC")).toBeInTheDocument();
    expect(screen.getByText("https://meet.google.com/test-room")).toBeInTheDocument();
    expect(screen.getByText("Jane Recruiter (recruiter@acme.com)")).toBeInTheDocument();
    expect(
      screen.getByText("Prepare for a live system design challenge."),
    ).toBeInTheDocument();
  });

  it("marks individual notification as read", async () => {
    getNotificationsMock.mockResolvedValue({
      items: [sampleNotification],
      unread_count: 1,
    });
    markNotificationReadMock.mockResolvedValue({
      ...sampleNotification,
      is_read: true,
      read_at: "2026-11-20T10:05:00Z",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText(
      "Interview Invitation: Senior Backend Engineer at Acme Corp",
    );
    const markReadBtn = screen.getByRole("button", { name: "Mark as read" });
    await user.click(markReadBtn);

    expect(markNotificationReadMock).toHaveBeenCalledWith("notif-1");
  });

  it("marks all notifications as read", async () => {
    getNotificationsMock.mockResolvedValue({
      items: [sampleNotification],
      unread_count: 1,
    });
    markAllNotificationsReadMock.mockResolvedValue({ marked_read: 1 });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText(
      "Interview Invitation: Senior Backend Engineer at Acme Corp",
    );
    const markAllBtn = screen.getByRole("button", { name: "Mark all as read" });
    await user.click(markAllBtn);

    expect(markAllNotificationsReadMock).toHaveBeenCalled();
  });

  it("renders empty state when there are no messages", async () => {
    getNotificationsMock.mockResolvedValue({
      items: [],
      unread_count: 0,
    });

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Your inbox is empty")).toBeInTheDocument();
  });
});
