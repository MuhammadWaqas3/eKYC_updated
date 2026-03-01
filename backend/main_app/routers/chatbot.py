"""
chatbot.py — Secure eKYC Onboarding Chatbot Router (v2)
========================================================
- Backend FSM: CONSENT → COLLECT_NAME → COLLECT_EMAIL → COLLECT_PHONE
               → COLLECT_ACCOUNT_TYPE → READY_FOR_OCR
- Guardrails: off-topic → helpful workflow reply (never blindly blocked)
- No retry limits (removed)
- Account type selection → congrats + immediately READY_FOR_OCR
"""

import re
import uuid
import html
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ═══════════════════════════════════════════════════════════════
#  ROUTER
# ═══════════════════════════════════════════════════════════════
router = APIRouter(prefix="/kyc", tags=["KYC Chatbot"])

# ═══════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════
SESSION_TTL_MINUTES = 30

ACCOUNT_TYPES = [
    "Personal Savings",
    "Current Account",
    "Business Account",
    "Investment Account",
]

# Full workflow the chatbot knows about
WORKFLOW_DESCRIPTION = (
    "Here is the complete Avanza eKYC verification journey:\n\n"
    "1️⃣  **Personal Details** ← You are here\n"
    "    Provide your full name, email, mobile number, and account type.\n\n"
    "2️⃣  **CNIC Upload**\n"
    "    Upload the front and back of your Pakistani National ID (CNIC).\n"
    "    Our OCR engine will extract your information automatically.\n\n"
    "3️⃣  **Face Verification**\n"
    "    Take a live selfie using your device camera.\n"
    "    Your face will be matched against your CNIC photo.\n\n"
    "4️⃣  **Fingerprint Verification**\n"
    "    Biometric fingerprint captured via your device sensor.\n\n"
    "5️⃣  **Confirmation**\n"
    "    Review all collected data and submit your account opening request.\n\n"
    "I can only assist with the eKYC process. For all other queries, "
    "please contact support@avanza.pk or call 0800-AVANZA."
)


# ═══════════════════════════════════════════════════════════════
#  FSM STATES
# ═══════════════════════════════════════════════════════════════
class State:
    CONSENT              = "CONSENT"
    COLLECT_NAME         = "COLLECT_NAME"
    COLLECT_EMAIL        = "COLLECT_EMAIL"
    COLLECT_PHONE        = "COLLECT_PHONE"
    COLLECT_ACCOUNT_TYPE = "COLLECT_ACCOUNT_TYPE"
    READY_FOR_OCR        = "READY_FOR_OCR"


# ═══════════════════════════════════════════════════════════════
#  SESSION STORE  (swap with Redis in production)
# ═══════════════════════════════════════════════════════════════
_sessions: Dict[str, "KYCSession"] = {}


def _evict_expired_sessions() -> None:
    cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
    expired = [sid for sid, s in _sessions.items() if s.created_at < cutoff]
    for sid in expired:
        del _sessions[sid]


# ═══════════════════════════════════════════════════════════════
#  KYCSession MODEL
# ═══════════════════════════════════════════════════════════════
class KYCSession(BaseModel):
    session_id:    str
    state:         str = State.CONSENT
    full_name:     Optional[str] = None
    email:         Optional[str] = None
    phone_number:  Optional[str] = None
    account_type:  Optional[str] = None
    consent_given: bool = False
    created_at:    datetime = datetime.utcnow()
    risk_flags:    list = []

    class Config:
        arbitrary_types_allowed = True


# ═══════════════════════════════════════════════════════════════
#  PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════════
class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply:          str
    state:          str
    requires_select: bool = False
    data:           Optional[Dict[str, Any]] = None
    error_detail:   Optional[str] = None


class StartResponse(BaseModel):
    session_id: str
    message:    str
    state:      str


# ═══════════════════════════════════════════════════════════════
#  SANITIZATION
# ═══════════════════════════════════════════════════════════════
def sanitize_input(raw: str) -> str:
    text = html.unescape(raw)
    text = re.sub(r"<[^>]+>", "", text)                       # strip HTML tags
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)  # control chars
    return text.strip()[:300]


# ═══════════════════════════════════════════════════════════════
#  GUARDRAILS
# ═══════════════════════════════════════════════════════════════

_INJECTION_PATTERNS = re.compile(
    r"""
    (ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions?) |
    (forget\s+(everything|all|your\s+instructions?)) |
    (you\s+are\s+now\s+a?) |
    (act\s+as\s+(a\s+)?(different|new|unrestricted)) |
    (jailbreak|dan\s+mode|developer\s+mode) |
    (override\s+(your\s+)?(system\s+)?(prompt|instructions?)) |
    (pretend\s+(you\s+are|to\s+be)) |
    (reveal\s+(your\s+)?(system\s+)?prompt) |
    (print\s+your\s+(instructions?|prompt)) |
    (sudo|admin\s+mode)
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Questions users might legitimately ask about the process
_PROCESS_QUESTIONS = re.compile(
    r"""
    (what\s+(is|are|happens?|do|will|should)|
     how\s+(do|does|can|will|long|many)|
     why\s+(do|does|is|are|must)|
     when\s+(do|does|will|is)|
     where\s+(do|does|will|is)|
     explain|tell\s+me|describe|
     what\s+next|next\s+step|steps?|process|workflow|
     cnic|face|fingerprint|biometric|selfie|upload|camera|
     verification|verify|confirm|secure|safety|privacy|data|
     account|bank|avanza|kyc|ekyc)
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Hard off-topic signals
_HARD_OFF_TOPIC = re.compile(
    r"""
    \b(weather|recipe|joke|movie|song|music|sport|cricket|football|
     politics|bitcoin|cryptocurrency|covid|game|
     translate|poem|story|
     capital\s+of|gpt|chatgpt|openai|gemini|llm)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def check_guardrails(text: str, state: str) -> Optional[str]:
    """
    Returns a response string if the message should be intercepted,
    or None if it should proceed to the FSM.
    """

    # 1. Prompt injection — block silently with redirect
    if _INJECTION_PATTERNS.search(text):
        return (
            "I am only able to assist with your Avanza eKYC verification.\n\n"
            + WORKFLOW_DESCRIPTION
        )

    # 2. Very short inputs (names, yes/no, numbers under 15 chars) — always pass through
    if len(text.strip()) <= 15:
        return None

    # 3. Inputs that look like phone numbers / numeric codes — always pass through
    if re.search(r"\d{5,}", text):
        return None

    # 4. Hard off-topic (weather, jokes, etc.) — respond with workflow info
    if _HARD_OFF_TOPIC.search(text):
        return (
            "I am here to guide you through your Avanza eKYC verification only — "
            "I cannot help with that topic.\n\n"
            + WORKFLOW_DESCRIPTION
        )

    # 5. Looks like a genuine process question → answer with workflow info
    if _PROCESS_QUESTIONS.search(text):
        # Let the FSM handle it if the state matches common inputs,
        # but if it feels like a question, reply with workflow knowledge
        if text.strip().endswith("?") or re.search(r"^\s*(what|how|why|when|where|explain|tell)", text, re.I):
            return (
                "Great question! Here is an overview of the entire process:\n\n"
                + WORKFLOW_DESCRIPTION
                + f"\n\nWe are currently at **Step 1**. Let's continue from where we left off."
            )

    return None


# ═══════════════════════════════════════════════════════════════
#  VALIDATORS
# ═══════════════════════════════════════════════════════════════
def validate_name(text: str) -> tuple[bool, str]:
    s = text.strip()
    if len(s) < 2:
        return False, "Name is too short. Please enter your full name as it appears on your CNIC."
    if len(s) > 80:
        return False, "Name is too long. Please enter your name as per CNIC."
    if re.search(r"\d", s):
        return False, "Name must not contain numbers. Please enter alphabetic characters only."
    if re.search(r"[^A-Za-z\u0600-\u06FF\s\-\']", s):
        return False, "Name must not contain symbols. Please enter your name as per CNIC."
    return True, ""


def validate_email(text: str) -> tuple[bool, str]:
    if re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", text.strip()):
        return True, ""
    return False, "That does not appear to be a valid email address. Please try again (e.g. name@example.com)."


def validate_phone(text: str) -> tuple[bool, str]:
    stripped = re.sub(r"[\s\-\(\)]", "", text.strip())
    for pattern in [r"^03\d{9}$", r"^\+923\d{9}$", r"^923\d{9}$"]:
        if re.match(pattern, stripped):
            return True, ""
    return (
        False,
        "Please enter a valid Pakistani mobile number. Accepted formats: 03XXXXXXXXX or +923XXXXXXXXX.",
    )


def validate_account_type(text: str) -> tuple[bool, str]:
    if text.strip() in ACCOUNT_TYPES:
        return True, ""
    return False, f"Please select one of the available account types from the list."


# ═══════════════════════════════════════════════════════════════
#  FSM ENGINE
# ═══════════════════════════════════════════════════════════════
def process_message(session: KYCSession, user_input: str) -> ChatResponse:

    # Already done
    if session.state == State.READY_FOR_OCR:
        return ChatResponse(
            reply="Your details are confirmed. Document verification is loading.",
            state=State.READY_FOR_OCR,
            data=_build_data(session),
        )

    # Guardrails (run on every state)
    blocked = check_guardrails(user_input, session.state)
    if blocked:
        if _INJECTION_PATTERNS.search(user_input):
            if "prompt_injection_attempt" not in session.risk_flags:
                session.risk_flags.append("prompt_injection_attempt")
        return ChatResponse(reply=blocked, state=session.state)

    # FSM transitions
    if session.state == State.CONSENT:
        return _handle_consent(session, user_input)
    elif session.state == State.COLLECT_NAME:
        return _handle_name(session, user_input)
    elif session.state == State.COLLECT_EMAIL:
        return _handle_email(session, user_input)
    elif session.state == State.COLLECT_PHONE:
        return _handle_phone(session, user_input)
    elif session.state == State.COLLECT_ACCOUNT_TYPE:
        return _handle_account_type(session, user_input)

    return ChatResponse(reply="Unexpected state. Please refresh and try again.", state=session.state)


# ────────────────────────────────────────────────────────────────
#  CONSENT
# ────────────────────────────────────────────────────────────────
def _handle_consent(session: KYCSession, user_input: str) -> ChatResponse:
    if re.search(r"\b(yes|okay|ok|sure|agree|accept|proceed|i\s+agree|yep|yup|start|begin)\b", user_input, re.I):
        session.consent_given = True
        session.state = State.COLLECT_NAME
        return ChatResponse(
            reply=(
                "Thank you for your consent. Let's begin your verification.\n\n"
                "**Step 1 of 4 — Full Name**\n"
                "Please enter your full name exactly as it appears on your CNIC."
            ),
            state=session.state,
        )
    elif re.search(r"\b(no|decline|reject|refuse|cancel|exit)\b", user_input, re.I):
        return ChatResponse(
            reply=(
                "We respect your decision. Your information has not been stored. "
                "You may close this window or contact us at support@avanza.pk if you change your mind."
            ),
            state=State.CONSENT,
        )
    else:
        return ChatResponse(
            reply=(
                "Please type **Yes** to accept and begin, or **No** to decline.\n\n"
                "We require your explicit consent before collecting any personal information."
            ),
            state=State.CONSENT,
        )


# ────────────────────────────────────────────────────────────────
#  NAME
# ────────────────────────────────────────────────────────────────
def _handle_name(session: KYCSession, user_input: str) -> ChatResponse:
    ok, error = validate_name(user_input)
    if ok:
        session.full_name = user_input.strip().title()
        session.state = State.COLLECT_EMAIL
        return ChatResponse(
            reply=(
                f"Thank you, **{session.full_name}**.\n\n"
                "**Step 2 of 4 — Email Address**\n"
                "Please provide your email address for account notifications and document delivery."
            ),
            state=session.state,
        )
    return ChatResponse(reply=error, state=session.state)


# ────────────────────────────────────────────────────────────────
#  EMAIL
# ────────────────────────────────────────────────────────────────
def _handle_email(session: KYCSession, user_input: str) -> ChatResponse:
    ok, error = validate_email(user_input)
    if ok:
        session.email = user_input.strip().lower()
        session.state = State.COLLECT_PHONE
        return ChatResponse(
            reply=(
                "Email address recorded.\n\n"
                "**Step 3 of 4 — Mobile Number**\n"
                "Please enter your Pakistani mobile number (e.g. 03001234567)."
            ),
            state=session.state,
        )
    return ChatResponse(reply=error, state=session.state)


# ────────────────────────────────────────────────────────────────
#  PHONE
# ────────────────────────────────────────────────────────────────
def _handle_phone(session: KYCSession, user_input: str) -> ChatResponse:
    ok, error = validate_phone(user_input)
    if ok:
        session.phone_number = re.sub(r"[\s\-\(\)]", "", user_input.strip())
        session.state = State.COLLECT_ACCOUNT_TYPE
        return ChatResponse(
            reply=(
                "Mobile number confirmed.\n\n"
                "**Step 4 of 4 — Account Type**\n"
                "Please select the account type that best suits your banking needs."
            ),
            state=session.state,
            requires_select=True,
        )
    return ChatResponse(reply=error, state=session.state)


# ────────────────────────────────────────────────────────────────
#  ACCOUNT TYPE  →  immediately READY_FOR_OCR
# ────────────────────────────────────────────────────────────────
def _handle_account_type(session: KYCSession, user_input: str) -> ChatResponse:
    ok, error = validate_account_type(user_input)
    if ok:
        session.account_type = user_input.strip()
        session.state = State.READY_FOR_OCR
        return ChatResponse(
            reply=(
                f"🎉 **Congratulations, {session.full_name or 'valued customer'}!**\n\n"
                "Your personal details have been successfully recorded:\n\n"
                f"• **Name:** {session.full_name}\n"
                f"• **Email:** {session.email}\n"
                f"• **Mobile:** {session.phone_number}\n"
                f"• **Account Type:** {session.account_type}\n\n"
                "Now let's move to **CNIC Verification**. 📄\n"
                "Please have your Pakistani National ID (CNIC) ready for upload."
            ),
            state=State.READY_FOR_OCR,
            data=_build_data(session),
        )
    return ChatResponse(reply=error, state=session.state, requires_select=True)


# ────────────────────────────────────────────────────────────────
#  HELPERS
# ────────────────────────────────────────────────────────────────
def _build_data(session: KYCSession) -> Dict[str, Any]:
    return {
        "full_name":    session.full_name,
        "email":        session.email,
        "phone_number": session.phone_number,
        "account_type": session.account_type,
        "session_id":   session.session_id,
    }


def _welcome_message() -> str:
    return (
        "Welcome to **Avanza Digital Banking** — eKYC Account Verification.\n\n"
        "I am your secure onboarding assistant. I will guide you through the following steps:\n\n"
        "1️⃣  Personal Details   2️⃣  CNIC Upload\n"
        "3️⃣  Face Verification  4️⃣  Fingerprint  5️⃣  Confirmation\n\n"
        "**Privacy Notice:** Your information is collected in accordance with SBP regulations "
        "and will be used solely for KYC compliance. It will not be shared with third parties "
        "without your consent.\n\n"
        "Type **Yes** to accept and begin, or **No** to exit."
    )


# ═══════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.post("/start", response_model=StartResponse)
async def kyc_start():
    """Create a new KYC session and return the welcome + consent message."""
    _evict_expired_sessions()
    session_id = str(uuid.uuid4())
    session = KYCSession(session_id=session_id)
    _sessions[session_id] = session
    return StartResponse(
        session_id=session_id,
        message=_welcome_message(),
        state=State.CONSENT,
    )


@router.post("/chat", response_model=ChatResponse)
async def kyc_chat(body: ChatRequest):
    """Send a user message; receive the next FSM response."""
    session = _sessions.get(body.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please refresh to start a new verification session.",
        )

    if datetime.utcnow() - session.created_at > timedelta(minutes=SESSION_TTL_MINUTES):
        del _sessions[body.session_id]
        raise HTTPException(
            status_code=410,
            detail="Your session has expired (30-minute limit). Please refresh to start again.",
        )

    clean = sanitize_input(body.message)
    if not clean:
        return ChatResponse(reply="I did not receive any input. Please type your response.", state=session.state)

    return process_message(session, clean)


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Retrieve session data (for debugging or confirmation step)."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    return {
        "session_id":    session.session_id,
        "state":         session.state,
        "full_name":     session.full_name,
        "email":         session.email,
        "phone_number":  session.phone_number,
        "account_type":  session.account_type,
        "consent_given": session.consent_given,
        "risk_flags":    session.risk_flags,
        "created_at":    session.created_at.isoformat(),
    }


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Wipe a session on logout/reset."""
    if session_id in _sessions:
        del _sessions[session_id]
    return {"detail": "Session terminated."}
