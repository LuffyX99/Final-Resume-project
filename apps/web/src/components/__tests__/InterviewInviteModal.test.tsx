import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InterviewInviteModal from "../InterviewInviteModal";

vi.mock("../../api/client", () => ({
  sendShortlistInvite: vi.fn(),
}));

import { sendShortlistInvite } from "../../api/client";

const sendShortlistInviteMock = vi.mocked(sendShortlistInvite);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("InterviewInviteModal", () => {
  it("renders form fields and submits invitation", async () => {
    sendShortlistInviteMock.mockResolvedValue({
      id: "notif-1",
      user_id: "user-1",
      sender_id: "recruiter-1",
      job_id: "job-1",
      application_id: "app-1",
      title: "Interview Invitation",
      content: "Details",
      notification_type: "shortlist_invitation",
      details: null,
      is_read: false,
      read_at: null,
      created_at: "2026-11-20T00:00:00Z",
    });

    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <InterviewInviteModal
        applicationId="app-1"
        matchId="match-1"
        candidateName="Alice Candidate"
        candidateEmail="alice@example.com"
        jobTitle="Backend Engineer"
        company="Acme Corp"
        recruiterName="Jane Recruiter"
        recruiterEmail="jane@acme.com"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    expect(screen.getByText("Invite Alice Candidate")).toBeInTheDocument();

    const venueInput = screen.getByPlaceholderText("https://meet.google.com/abc-def-xyz");
    await user.type(venueInput, "https://meet.google.com/test-room");

    const dateInput = screen.getByLabelText(/Date/);
    await user.type(dateInput, "2026-11-28");

    const submitBtn = screen.getByRole("button", { name: /Send Invitation/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(sendShortlistInviteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          application_id: "app-1",
          match_id: "match-1",
          venue: "https://meet.google.com/test-room",
          interview_date: "2026-11-28",
          mode: "online",
        }),
      );
    });

    expect(handleSuccess).toHaveBeenCalled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <InterviewInviteModal
        applicationId="app-1"
        candidateName="Alice Candidate"
        jobTitle="Backend Engineer"
        company="Acme Corp"
        onClose={handleClose}
        onSuccess={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
