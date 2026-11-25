import asyncio
import email.utils
import logging
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class EmailMessage:
    to_email: str
    subject: str
    text_body: str
    html_body: str
    recipient_name: str = ""


class EmailService:
    """Asynchronous SMTP email delivery with graceful offline logging fallback."""

    _instance: "EmailService | None" = None

    def __init__(self) -> None:
        self.sent_emails: list[dict[str, Any]] = []

    @classmethod
    def get_instance(cls) -> "EmailService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _format_interview_invitation_templates(
        self,
        *,
        candidate_name: str,
        job_title: str,
        company: str,
        venue: str,
        interview_date: str,
        interview_time: str,
        mode: str,
        contact_person: str,
        notes: str = "",
    ) -> tuple[str, str]:
        """Generate formatted plain-text and responsive HTML email bodies."""
        mode_label = mode.capitalize()
        schedule = f"{interview_date} at {interview_time}" if interview_time else interview_date

        text_body = f"""Hello {candidate_name},

Congratulations! You have been shortlisted for the {job_title} role at {company}.

We would like to invite you for the next interview round.

Interview Details:
- Role: {job_title}
- Company: {company}
- Mode: {mode_label}
- Date & Time: {schedule}
- Venue / Meeting Link: {venue}
- Contact Person: {contact_person}
"""
        if notes.strip():
            text_body += f"\nPreparation & Notes:\n{notes.strip()}\n"

        text_body += f"""
Please reply directly or reach out to {contact_person} if you need to reschedule.

Best regards,
The {company} Recruiting Team
via ResumeMatch AI
"""

        notes_html = ""
        if notes.strip():
            notes_html = f"""
            <div style="margin-top: 20px; padding: 16px; background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: 8px;">
                <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #00f0ff;">Preparation &amp; Notes</p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #e2e8f0;">{notes.strip()}</p>
            </div>
            """

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Interview Invitation: {job_title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f17; color: #f8fafc; margin: 0; padding: 30px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div style="padding: 24px 30px; background: linear-gradient(135deg, rgba(0, 240, 255, 0.1), transparent); border-bottom: 1px solid #1f2937;">
      <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #00f0ff; font-weight: 600;">Shortlist Notification</p>
      <h1 style="margin: 8px 0 0 0; font-size: 22px; color: #ffffff; font-weight: 700;">Interview Invitation</h1>
      <p style="margin: 4px 0 0 0; font-size: 15px; color: #94a3b8;">{job_title} at {company}</p>
    </div>
    
    <div style="padding: 30px;">
      <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #e2e8f0;">
        Hello <strong>{candidate_name}</strong>,<br><br>
        Great news! The hiring team at <strong>{company}</strong> has reviewed your application and shortlisted you for the <strong>{job_title}</strong> role.
      </p>

      <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #94a3b8; width: 35%;">Schedule:</td>
            <td style="padding: 8px 0; color: #ffffff; font-weight: 600;">{schedule}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Format:</td>
            <td style="padding: 8px 0; color: #ffffff; font-weight: 600;">{mode_label}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Venue / Link:</td>
            <td style="padding: 8px 0; color: #00f0ff; font-weight: 600; word-break: break-all;">{venue}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Contact:</td>
            <td style="padding: 8px 0; color: #ffffff;">{contact_person}</td>
          </tr>
        </table>
      </div>

      {notes_html}

      <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
        Best of luck,<br>
        <strong style="color: #f8fafc;">The {company} Recruiting Team</strong><br>
        <span style="font-size: 12px; color: #64748b;">Powered by ResumeMatch AI</span>
      </p>
    </div>
  </div>
</body>
</html>"""
        return text_body, html_body

    def _send_smtp_sync(self, msg: EmailMessage) -> bool:
        """Synchronous SMTP delivery executed in thread pool."""
        if not settings.smtp_host.strip():
            logger.info(
                "[SMTP OFFLINE/NOOP] Mocking email delivery to %s | Subject: '%s'",
                msg.to_email,
                msg.subject,
            )
            self.sent_emails.append(
                {
                    "to": msg.to_email,
                    "subject": msg.subject,
                    "text": msg.text_body,
                    "html": msg.html_body,
                    "delivered_via": "offline_logger",
                }
            )
            return True

        mime_msg = MIMEMultipart("alternative")
        mime_msg["Subject"] = msg.subject
        mime_msg["From"] = email.utils.formataddr(
            (settings.smtp_from_name, settings.smtp_from_email)
        )
        mime_msg["To"] = email.utils.formataddr(
            (msg.recipient_name, msg.to_email)
        )

        part_text = MIMEText(msg.text_body, "plain", "utf-8")
        part_html = MIMEText(msg.html_body, "html", "utf-8")
        mime_msg.attach(part_text)
        mime_msg.attach(part_html)

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                auth_user = settings.smtp_user or settings.smtp_email
                if auth_user and settings.smtp_password:
                    server.login(auth_user, settings.smtp_password)
                from_addr = settings.smtp_from_email or auth_user or "noreply@resumematch.ai"
                server.sendmail(from_addr, [msg.to_email], mime_msg.as_string())
            logger.info("Sent email successfully to %s", msg.to_email)
            self.sent_emails.append(
                {
                    "to": msg.to_email,
                    "subject": msg.subject,
                    "text": msg.text_body,
                    "html": msg.html_body,
                    "delivered_via": "smtp",
                }
            )
            return True
        except Exception as exc:
            logger.warning(
                "SMTP email delivery to %s failed (%s). Continuing safely.",
                msg.to_email,
                exc,
            )
            return False

    async def send_interview_invitation(
        self,
        *,
        to_email: str,
        candidate_name: str,
        job_title: str,
        company: str,
        venue: str,
        interview_date: str,
        interview_time: str,
        mode: str,
        contact_person: str,
        notes: str = "",
    ) -> bool:
        """Format and dispatch an interview invitation email off the event loop."""
        subject = f"Interview Invitation: {job_title} at {company}"
        text_body, html_body = self._format_interview_invitation_templates(
            candidate_name=candidate_name,
            job_title=job_title,
            company=company,
            venue=venue,
            interview_date=interview_date,
            interview_time=interview_time,
            mode=mode,
            contact_person=contact_person,
            notes=notes,
        )

        msg = EmailMessage(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            recipient_name=candidate_name,
        )

        # If SMTP is unconfigured/offline, run directly without thread context-switching
        if not settings.smtp_host.strip():
            return self._send_smtp_sync(msg)

        # Offload sync SMTP socket connection to worker thread
        return await asyncio.to_thread(self._send_smtp_sync, msg)

    def _format_otp_templates(
        self,
        *,
        otp_code: str,
        recipient_name: str = "",
        expires_minutes: int = 5,
    ) -> tuple[str, str]:
        """Generate formatted plain-text and responsive HTML email bodies for registration OTP."""
        greeting = f"Hello {recipient_name}," if recipient_name.strip() else "Hello,"
        text_body = f"""{greeting}

Your ResumeMatch AI verification code is:

    {otp_code}

This code will expire in {expires_minutes} minutes.

For your security, never share this code with anyone. If you did not request this verification code, please ignore this email.

Best regards,
The ResumeMatch AI Team
"""

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ResumeMatch AI - Email Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f17; color: #f8fafc; margin: 0; padding: 30px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div style="padding: 24px 30px; background: linear-gradient(135deg, rgba(0, 240, 255, 0.12), transparent); border-bottom: 1px solid #1f2937;">
      <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #00f0ff; font-weight: 600;">Secure Email Verification</p>
      <h1 style="margin: 8px 0 0 0; font-size: 22px; color: #ffffff; font-weight: 700;">ResumeMatch<span style="color: #00f0ff;">AI</span></h1>
    </div>
    <div style="padding: 30px;">
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #f1f5f9;">{greeting}</p>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
        Please use the following 6-digit One-Time Password (OTP) to verify your email address and complete your registration:
      </p>

      <div style="margin: 24px 0; padding: 18px 20px; background: rgba(0, 240, 255, 0.06); border: 1px dashed rgba(0, 240, 255, 0.4); border-radius: 10px; text-align: center;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 0.35em; color: #00f0ff;">{otp_code}</span>
      </div>

      <p style="margin: 0 0 20px 0; font-size: 13px; color: #94a3b8; text-align: center;">
        This code is valid for <strong>{expires_minutes} minutes</strong> and can only be used once.
      </p>

      <div style="margin-top: 24px; padding: 14px 18px; background: rgba(244, 63, 94, 0.08); border-left: 3px solid #f43f5e; border-radius: 4px;">
        <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #fda4af;">
          <strong>Security Warning:</strong> Never share this verification code with anyone. ResumeMatch AI support will never ask for your OTP.
        </p>
      </div>

      <p style="margin: 28px 0 0 0; font-size: 13px; line-height: 1.6; color: #64748b;">
        If you did not request this verification, you can safely disregard this email.
      </p>
    </div>
  </div>
</body>
</html>"""
        return text_body, html_body

    async def send_otp_email(
        self,
        *,
        to_email: str,
        otp_code: str,
        recipient_name: str = "",
        expires_minutes: int = 5,
    ) -> bool:
        """Format and dispatch an OTP verification email off the event loop."""
        subject = f"{otp_code} is your ResumeMatch AI verification code"
        text_body, html_body = self._format_otp_templates(
            otp_code=otp_code,
            recipient_name=recipient_name,
            expires_minutes=expires_minutes,
        )

        msg = EmailMessage(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            recipient_name=recipient_name,
        )

        if not settings.smtp_host.strip():
            return self._send_smtp_sync(msg)

        return await asyncio.to_thread(self._send_smtp_sync, msg)

    def clear(self) -> None:
        self.sent_emails.clear()


email_service = EmailService.get_instance()
