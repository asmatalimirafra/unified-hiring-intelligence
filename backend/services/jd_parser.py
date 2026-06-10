import fitz  # PyMuPDF
import pdfplumber
import tempfile
from docx import Document
import os
import io
import re


# ── Text Extraction ────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes):
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            text = "\n".join([page.extract_text() or "" for page in pdf.pages])
        if len(text.strip()) >= 100:
            return text
        else:
            raise ValueError("Text too short, falling back to fitz")
    except Exception as e:
        print("⚠️ PDFPlumber failed, falling back to fitz:", e)
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            return "".join([page.get_text() for page in doc])


def extract_text_from_docx(file_bytes):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    doc = Document(tmp_path)
    os.remove(tmp_path)
    return "\n".join([para.text for para in doc.paragraphs])


# ── Resume Field Parser ────────────────────────────────────────────────────────

def parse_resume_fields(text: str) -> dict:
    """
    Extract structured contact fields from resume plain text.
    Returns a dict with keys: name, email, phone, linkedin, github, location.
    Any field that cannot be reliably extracted is returned as "" (left blank
    for the HR to fill in manually on the frontend).
    """
    fields = {
        "name":     "",
        "email":    "",
        "phone":    "",
        "linkedin": "",
        "github":   "",
        "location": "",
    }

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # ── Email ──────────────────────────────────────────────────────────────────
    # Standard email regex; picks the first match in the whole document.
    email_re = re.compile(
        r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}',
        re.IGNORECASE
    )
    m = email_re.search(text)
    if m:
        fields["email"] = m.group(0).strip()

    # ── Phone ──────────────────────────────────────────────────────────────────
    # Priority 1: Indian mobile numbers (+91 or 10-digit starting 6-9)
    phone_india_re = re.compile(
        r'(?<!\d)(?:\+91[\s\-.]?)?(?:\(?\d{5}\)?[\s\-.]?\d{5}|[6-9]\d{9})(?!\d)'
    )
    # Priority 2: International formats — (XXX) XXX-XXXX, +X-XXX-XXX-XXXX, etc.
    phone_intl_re = re.compile(
        r'(?<!\d)'
        r'(?:\+\d{1,3}[\s\-.]?)?'          # optional country code with +
        r'(?:\(?\d{3,4}\)?[\s\-.]?)'        # area / trunk code
        r'\d{3,4}[\s\-.]?'                  # first segment
        r'\d{4}'                            # last 4 digits
        r'(?!\d)'
    )
    pm = phone_india_re.search(text)
    if not pm:
        pm = phone_intl_re.search(text)
    if pm:
        raw = pm.group(0).strip()
        # Strip any leading/trailing punctuation or label characters
        raw = re.sub(r'^[\s:\-\|]+|[\s:\-\|]+$', '', raw)
        fields["phone"] = raw

    # ── LinkedIn ───────────────────────────────────────────────────────────────
    # Matches: linkedin.com/in/username, www.linkedin.com/in/username,
    #          https://linkedin.com/in/username, with optional trailing slash.
    linkedin_re = re.compile(
        r'(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-\.%]+/?',
        re.IGNORECASE
    )
    lm = linkedin_re.search(text)
    if lm:
        url = lm.group(0).strip().rstrip('/')
        if not url.lower().startswith('http'):
            url = 'https://' + url
        fields["linkedin"] = url

    # ── GitHub ─────────────────────────────────────────────────────────────────
    # Matches: github.com/username (not github.com/username/repo to avoid noise)
    github_re = re.compile(
        r'(?:https?://)?(?:www\.)?github\.com/[\w\-\.]+(?:/[\w\-\.]+)*/?',
        re.IGNORECASE
    )
    gm = github_re.search(text)
    if gm:
        url = gm.group(0).strip().rstrip('/')
        if not url.lower().startswith('http'):
            url = 'https://' + url
        # Trim to just the profile root (github.com/username), drop repo paths
        parts = url.split('/')
        # parts: ['https:', '', 'github.com', 'username', ...]
        if len(parts) >= 4:
            url = '/'.join(parts[:4])
        fields["github"] = url

    # ── Location ───────────────────────────────────────────────────────────────
    # Strategy 1: Look for an explicit label on the same line.
    loc_label_re = re.compile(
        r'(?:location|address|city|based(?:\s+in)?|residing(?:\s+at)?)\s*[:\-]?\s*'
        r'([A-Za-z][^\n\|]{3,60})',
        re.IGNORECASE
    )
    llm = loc_label_re.search(text)
    if llm:
        candidate = llm.group(1).strip().rstrip(',').strip()
        # Reject if it looks like a sentence or too long
        if len(candidate) <= 60 and len(candidate.split()) <= 8:
            fields["location"] = candidate

    # Strategy 2: Scan the first 20 lines for "City, State/Country" pattern.
    if not fields["location"]:
        city_state_re = re.compile(
            r'\b([A-Z][a-zA-Z]{2,}(?:\s[A-Z][a-zA-Z]+)*)'
            r',\s*'
            r'([A-Z][a-zA-Z]{2,}(?:\s[A-Z][a-zA-Z]+)*)\b'
        )
        _LOCATION_NOISE = {
            'university', 'institute', 'college', 'school', 'iit', 'nit',
            'ltd', 'inc', 'llc', 'pvt', 'technologies', 'solutions',
            'services', 'systems', 'research', 'labs'
        }
        for line in lines[:20]:
            cs = city_state_re.search(line)
            if cs:
                loc_candidate = cs.group(0).strip()
                words_lower = {w.lower() for w in loc_candidate.split()}
                if not words_lower & _LOCATION_NOISE:
                    fields["location"] = loc_candidate
                    break

    # ── Name ───────────────────────────────────────────────────────────────────
    # Strategy 1: Explicit "Name:" or "Full Name:" label in first 10 lines.
    name_label_re = re.compile(
        r'(?:full\s+name|name)\s*[:\-]\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})',
        re.IGNORECASE
    )
    nlm = name_label_re.search("\n".join(lines[:10]))
    if nlm:
        fields["name"] = nlm.group(1).strip()

    # Strategy 2: First line(s) that look like a proper name.
    # Rules: 2–4 words, each starting with uppercase, no digits, no special
    # chars (@, /, |, :, ·, •), not a known header word.
    if not fields["name"]:
        _NAME_STOPWORDS = {
            'resume', 'curriculum', 'vitae', 'cv', 'profile', 'summary',
            'objective', 'contact', 'information', 'details', 'page',
            'portfolio', 'biodata', 'about', 'me'
        }
        for line in lines[:8]:
            # Hard-exclude lines with clear non-name markers
            if re.search(r'[@/\|·•:\d]', line):
                continue
            words = line.split()
            if not (2 <= len(words) <= 4):
                continue
            # All words must start uppercase and be alphabetic
            if not all(re.match(r'^[A-Z][a-zA-Z]+$', w) for w in words):
                continue
            # Must not be a stopword header
            if any(w.lower() in _NAME_STOPWORDS for w in words):
                continue
            fields["name"] = line.strip()
            break

<<<<<<< HEAD
    return fields
=======
    return fields
>>>>>>> b03856d (Remove hardcoded config: centralize in config.py + env vars)
