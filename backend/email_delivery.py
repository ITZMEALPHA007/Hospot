"""Provider-independent transactional email interface and delivery adapters."""

import asyncio
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Protocol

import resend


class EmailDeliveryError(RuntimeError):
    """Generic delivery failure that never includes provider response details."""


def _verification_message(verification_url: str):
    safe_url = escape(verification_url, quote=True)
    text = (
        "A request was made to change the email address on your Hospot account.\n\n"
        f"Verify the new address using this link:\n{verification_url}\n\n"
        "This link expires in 15 minutes and can only be used once. If you did not request "
        "this change, you can ignore this message. Your current email address will remain "
        "unchanged unless you verify the new one.\n"
    )
    html = f"""<!doctype html><html><body style="margin:0;background:#f3f7f6;font-family:Arial,sans-serif;color:#20363b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #dce8e5;border-radius:10px">
    <tr><td style="padding:28px 30px 10px"><div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#087f78">HOSPOT</div>
    <h1 style="font-size:22px;margin:18px 0 8px">Verify your new email</h1><p style="font-size:15px;line-height:1.6;color:#52676b">A request was made to change the email address on your Hospot account. Confirm that you can access this address.</p>
    <p style="margin:25px 0"><a href="{safe_url}" style="display:inline-block;padding:13px 20px;border-radius:6px;background:#087f78;color:#fff;text-decoration:none;font-weight:bold">Verify email address</a></p>
    <p style="font-size:13px;color:#65777b;line-height:1.6">This link expires in 15 minutes and can only be used once. Your current email remains unchanged until verification succeeds.</p>
    <p style="font-size:13px;color:#65777b;line-height:1.6">If you did not request this change, ignore this message. No account change will be made.</p>
    <p style="font-size:11px;color:#89979a;word-break:break-all">If the button does not work, open: {safe_url}</p>
    </td></tr></table></td></tr></table></body></html>"""
    return text, html


def valid_sender(sender):
    return bool(sender and re.fullmatch(
        r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}",
        sender,
    ))


class EmailDelivery(Protocol):
    @property
    def is_configured(self) -> bool: ...

    async def send_email_change(self, recipient: str, verification_url: str) -> None: ...


class SMTPEmailDelivery:
    """SMTP delivery using stdlib TLS; no preview or console-send fallback."""

    def __init__(self, host=None, port=465, username=None, password=None, sender=None):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.sender = sender

    @classmethod
    def from_environment(cls):
        try:
            port = int(os.environ.get("HOSPOT_SMTP_PORT", "465"))
        except ValueError:
            port = None
        return cls(
            host=os.environ.get("HOSPOT_SMTP_HOST"),
            port=port,
            username=os.environ.get("HOSPOT_SMTP_USERNAME"),
            password=os.environ.get("HOSPOT_SMTP_PASSWORD"),
            sender=os.environ.get("HOSPOT_EMAIL_FROM"),
        )

    @property
    def is_configured(self):
        return bool(
            self.host and self.port and 1 <= self.port <= 65535
            and self.username and self.password and self.sender
            and valid_sender(self.sender)
        )

    async def send_email_change(self, recipient: str, verification_url: str) -> None:
        if not self.is_configured:
            raise RuntimeError("SMTP delivery is not configured")
        message = EmailMessage()
        message["Subject"] = "Verify your Hospot email change"
        message["From"] = formataddr(("Hospot", self.sender))
        message["To"] = recipient
        text, html = _verification_message(verification_url)
        message.set_content(text)
        message.add_alternative(html, subtype="html")
        await asyncio.to_thread(self._send_message, message)

    def _send_message(self, message: EmailMessage):
        context = ssl.create_default_context()
        if self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port, timeout=10, context=context) as server:
                server.login(self.username, self.password)
                refused = server.send_message(message)
        else:
            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(self.username, self.password)
                refused = server.send_message(message)
        if refused:
            raise RuntimeError("SMTP server refused the verification recipient")


class ResendEmailDelivery:
    """Email delivery through the official Resend SDK; never falls back to SMTP."""

    def __init__(self, api_key=None, sender=None):
        self.api_key = api_key
        self.sender = sender

    @classmethod
    def from_environment(cls):
        return cls(
            api_key=os.environ.get("RESEND_API_KEY"),
            sender=os.environ.get("HOSPOT_EMAIL_FROM"),
        )

    @property
    def is_configured(self):
        return bool(self.api_key and valid_sender(self.sender))

    async def send_email_change(self, recipient: str, verification_url: str) -> None:
        if not self.is_configured:
            raise EmailDeliveryError("Email delivery is not configured")
        text, html = _verification_message(verification_url)
        params = {
            "from": f"Hospot <{self.sender}>",
            "to": [recipient],
            "subject": "Verify your Hospot email change",
            "text": text,
            "html": html,
        }
        try:
            # The SDK exposes process-global configuration. The app has one provider
            # configuration; set its secret immediately before the request and keep
            # all provider exceptions out of API responses and logs.
            resend.api_key = self.api_key
            resend.default_async_http_client = resend.HTTPXClient(timeout=10)
            response = await resend.Emails.send_async(params)
            if not getattr(response, "id", None):
                raise EmailDeliveryError("Email provider did not accept the request")
        except Exception as exc:
            # Do not chain exception detail: SDK errors can include provider payloads.
            raise EmailDeliveryError("Email provider request failed") from None


class UnconfiguredEmailDelivery:
    """Fail-closed adapter used for an invalid provider selector."""

    is_configured = False

    async def send_email_change(self, recipient: str, verification_url: str) -> None:
        raise EmailDeliveryError("Email delivery is not configured")


def email_delivery_from_environment():
    provider = os.environ.get("EMAIL_DELIVERY_PROVIDER", "resend").strip().lower()
    if provider == "resend":
        return ResendEmailDelivery.from_environment()
    if provider == "smtp":
        return SMTPEmailDelivery.from_environment()
    return UnconfiguredEmailDelivery()
