# services/email_service.py
"""
Email service for sending offer letters to candidates.

Uses Python's built-in smtplib. Configure SMTP credentials via environment
variables in a .env file at the project root:

    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=hr@mirafra.com
    SMTP_PASSWORD=your-app-password
    SMTP_FROM_NAME=Mirafra HR Team

For Gmail, use an App Password (not your regular password):
    https://myaccount.google.com/apppasswords

For other providers (Outlook, SendGrid, AWS SES, etc.) adjust SMTP_HOST/PORT.
"""

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST      = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT      = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER      = os.getenv("SMTP_USER", "")
SMTP_PASSWORD  = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Mirafra HR Team")


def _body_to_html(body: str) -> str:
    """Convert plain-text offer letter to a clean HTML version for email."""
    import html
    escaped = html.escape(body).replace("\n", "<br>")
    return f"""
    <html>
      <body style="font-family: 'Times New Roman', serif; color: #1e293b; max-width: 720px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 24px;">
          <div style="font-size: 22px; font-weight: bold; color: #1e3a8a;">Mirafra Technology</div>
          <div style="font-size: 12px; color: #64748b;">Bangalore, Karnataka, India</div>
        </div>
        <div style="white-space: pre-wrap; line-height: 1.7; font-size: 14px;">{escaped}</div>
      </body>
    </html>
    """


def send_offer_letter_email(
    candidate_name: str,
    candidate_email: str,
    designation: str,
    company_name: str,
    letter_body: str,
    pdf_bytes: bytes = None,
) -> dict:
    """
    Send an offer letter email to the candidate.

    Returns a dict: { "success": bool, "message": str }
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        return {
            "success": False,
            "message": "SMTP credentials are not configured. Please set SMTP_USER and SMTP_PASSWORD in the .env file."
        }

    if not candidate_email:
        return {"success": False, "message": "Candidate email is missing."}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Offer of Employment — {designation} at {company_name}"
        msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
        msg["To"]      = candidate_email
        msg["Reply-To"] = SMTP_USER

        # Plain text version (fallback for non-HTML clients)
        msg.attach(MIMEText(letter_body, "plain", "utf-8"))
        # HTML version (what most clients will show)
        msg.attach(MIMEText(_body_to_html(letter_body), "html", "utf-8"))

        # Optional PDF attachment
        if pdf_bytes:
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            safe_name = (candidate_name or "Candidate").replace(" ", "_")
            part.add_header(
                "Content-Disposition",
                "attachment",
                filename=f"Offer_Letter_{safe_name}.pdf"
            )
            msg.attach(part)

        # Send via SMTP
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.starttls(context=context)
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        return {
            "success": True,
            "message": f"Offer letter sent successfully to {candidate_email}"
        }

    except smtplib.SMTPAuthenticationError:
        return {
            "success": False,
            "message": "SMTP authentication failed. For Gmail, you need an App Password — not your regular password. See https://myaccount.google.com/apppasswords"
        }
    except smtplib.SMTPException as e:
        return {
            "success": False,
            "message": f"SMTP error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Unexpected error while sending email: {str(e)}"
        }