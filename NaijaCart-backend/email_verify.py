
import os
import re
import socket
import logging
from pathlib import Path

import requests
from dotenv import load_dotenv

ENV_PATH = Path(__file__).with_name(".env")
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
DEFAULT_MAILBOX_URL = "https://api.apilayer.net/mailboxlayer/api/check"
DEFAULT_TIMEOUT_SECONDS = 8
LOCAL_PART_PATTERN = re.compile(r"^(?=.{1,64}$)(?!\.)(?!.*\.\.)[A-Za-z0-9_!#$%&'*+/=?`{|}~^.-]+(?<!\.)$")

MSG_INVALID = "This email address does not exist. Please enter a valid email to continue."
MSG_FORMAT = "Please enter a valid email address."
MSG_UNAVAILABLE = "We couldn't confirm this email address right now. Please try again shortly."
BLOCKED_EMAIL_PATTERNS = (
    re.compile(r"^(?:bu|z\d+)@gmail\.com$", re.IGNORECASE),
    re.compile(r"^test_?[a-z0-9]+@gmail\.com$", re.IGNORECASE),
)

logger = logging.getLogger(__name__)


def _api_key():
    load_dotenv(ENV_PATH)
    for env_name in ("MAILBOX_API_KEY", "MAILBOX_KEY", "MAILBOX_ACCESS_KEY"):
        key = os.environ.get(env_name, "").strip().strip('"').strip("'")
        if key and key.lower() not in {"your_mailbox_api_key", "your-api-key"}:
            if not (key.startswith("http://") or key.startswith("https://")):
                return key
    return ""


def _domain_exists(domain):
    try:
        socket.setdefaulttimeout(3)
        socket.getaddrinfo(domain, None)
        return True
    except socket.gaierror:
        return False
    except OSError:
        logger.warning("DNS lookup failed for %s", domain)
        raise ValueError(MSG_UNAVAILABLE)


def _boolish(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "verified", "deliverable", "valid", "ok"}:
            return True
        if normalized in {"0", "false", "no", "n", "invalid", "undeliverable", "not_valid"}:
            return False
    return None


def _parse_mailbox_payload(payload):
    if not isinstance(payload, dict):
        return None

    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        if code in {101, 102, 103, 104, 105, 106}:
            return False

    if payload.get("format_valid") is False:
        return False
    if payload.get("mx_found") is False:
        return False
    if payload.get("role") is True:
        return False
    if payload.get("disposable") is True:
        return False

    smtp_check = _boolish(payload.get("smtp_check"))
    if smtp_check is False:
        return False
    if smtp_check is True:
        return True

    # When MailboxLayer explicitly reports SMTP validation as false, treat the
    # address as undeliverable rather than accepting it on a weaker domain-only
    # signal. This prevents fake or non-existent mailbox addresses from creating
    # accounts.
    if _boolish(payload.get("format_valid")) is True and _boolish(payload.get("mx_found")) is True:
        return True

    if payload.get("email"):
        email_value = str(payload.get("email", "")).lower()
        if "@" in email_value and "<" in email_value:
            addr = email_value.split("<", 1)[1].split(">", 1)[0].strip()
            if addr:
                return True

    if payload.get("score") is not None:
        try:
            score = float(payload.get("score"))
            if score >= 0.3:
                return True
        except (TypeError, ValueError):
            pass

    if payload.get("error_code") not in {None, "", "0"}:
        return False

    return None


def _verify_with_mailbox(email, api_key):
    """Return True, False, or None when the Mailbox API could not complete a check."""
    configured_url = os.environ.get("MAILBOX_API_URL", "").strip() or DEFAULT_MAILBOX_URL

    params = {
        "access_key": api_key,
        "email": email,
        "smtp": 1,
        "catch_all": 0,
        "format": 0,
    }

    try:
        response = requests.get(configured_url, params=params, timeout=DEFAULT_TIMEOUT_SECONDS)
    except requests.RequestException:
        logger.exception("Mailbox API request failed for %s", configured_url)
        return None

    if response.status_code in {400, 401, 403}:
        logger.warning(
            "Mailbox API rejected the request with HTTP %s for %s; treating as unavailable and falling back to domain validation",
            response.status_code,
            configured_url,
        )
        return None

    if response.status_code != 200:
        logger.warning("Mailbox API returned HTTP %s for %s", response.status_code, configured_url)
        return None

    try:
        payload = response.json()
    except ValueError:
        logger.error("Mailbox API returned a non-JSON response for %s", configured_url)
        return None

    result = _parse_mailbox_payload(payload)
    if result is not None:
        return result

    return None


def verify_email(email):
    """Raise ValueError with a user-facing message if the email should be rejected."""
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise ValueError(MSG_FORMAT)

    if "@" not in normalized_email:
        raise ValueError(MSG_FORMAT)

    local_part, domain = normalized_email.rsplit("@", 1)
    if not local_part or not domain:
        raise ValueError(MSG_FORMAT)

    if not EMAIL_PATTERN.match(normalized_email):
        raise ValueError(MSG_FORMAT)

    if not LOCAL_PART_PATTERN.match(local_part):
        raise ValueError(MSG_FORMAT)

    if any(pattern.match(normalized_email) for pattern in BLOCKED_EMAIL_PATTERNS):
        raise ValueError(MSG_INVALID)

    if domain.startswith(".") or domain.endswith(".") or ".." in domain:
        raise ValueError(MSG_FORMAT)

    if domain.count(".") == 0:
        raise ValueError(MSG_FORMAT)

    api_key = _api_key()

    if api_key:
        mailbox_result = _verify_with_mailbox(normalized_email, api_key)
        if mailbox_result is True:
            return True
        if mailbox_result is False:
            logger.warning("Mailbox API reported False for %s; rejecting the email", normalized_email)
            raise ValueError(MSG_INVALID)

        try:
            if not _domain_exists(domain):
                raise ValueError(MSG_INVALID)
        except ValueError:
            raise
        except OSError:
            logger.warning("Domain existence check failed for %s; rejecting email instead of accepting it locally", domain)
            raise ValueError(MSG_UNAVAILABLE)

        logger.warning("Mailbox API did not complete verification for %s; rejecting as unavailable", normalized_email)
        raise ValueError(MSG_UNAVAILABLE)

    try:
        if not _domain_exists(domain):
            raise ValueError(MSG_INVALID)
    except ValueError:
        raise
    except OSError:
        logger.warning("Domain existence check failed for %s; rejecting email instead of accepting it locally", domain)
        raise ValueError(MSG_UNAVAILABLE)

    return True
