import re


def split_resume_into_chunks(resume_text: str, min_length: int = 30, max_length: int = 800):
    """
    Splits a resume into logical chunks for embedding and LLM analysis.

    KEY FIX vs original:
    - min_length changed from 200 → 30.
      The old value of 200 silently dropped short but critical sections like:
        "Skills: Python, AWS, Docker, React"  (~35 chars)
      These are the most important sections for fitment analysis.
      A 30-char minimum keeps them while still filtering truly empty lines.

    - Section header detection improved: headers are now preserved as labels
      inside their chunk so the LLM knows which section it is reading.

    - Fallback: if splitting produces no chunks (unusual resume format),
      return the full text as a single chunk so LLM always gets something.
    """

    # Normalise whitespace
    resume_text = re.sub(r"[ \t]+", " ", resume_text)
    resume_text = re.sub(r"\r\n?", "\n", resume_text)
    resume_text = force_newlines_before_headings(resume_text)

    # Split on common section headings — keep heading as part of the chunk
    # so the LLM knows context (e.g. "Skills:" prefix tells LLM these are skills)
    section_pattern = re.compile(
        r'(?:^|\n)\s*'
        r'(Skills|Technical Skills|Core Skills|Projects|Experience|Work Experience|'
        r'Internship|Education|Certifications|Achievements|Summary|Objective|Profile|'
        r'Publications|Awards|Languages|Tools)\s*:?\s*(?:\n|$)',
        re.IGNORECASE
    )

    # Find all section positions
    sections = []
    last_end = 0
    last_header = "General"

    for match in section_pattern.finditer(resume_text):
        # Save previous section
        section_text = resume_text[last_end:match.start()].strip()
        if section_text:
            sections.append((last_header, section_text))
        last_header = match.group(1).strip()
        last_end = match.end()

    # Last section
    remaining = resume_text[last_end:].strip()
    if remaining:
        sections.append((last_header, remaining))

    # If no sections found at all, treat entire resume as one chunk
    if not sections:
        return [resume_text.strip()] if resume_text.strip() else []

    chunks = []
    for header, content in sections:
        # Prefix each chunk with its section header so LLM has context
        labeled = f"{header}:\n{content}"

        if len(labeled) <= max_length:
            # Accept any chunk above the minimum — this is the critical fix
            if len(labeled) >= min_length:
                chunks.append(labeled)
        else:
            # Chunk is too long — split by double newline first
            subchunks = content.split("\n\n")
            current = f"{header}:\n"
            for sub in subchunks:
                sub = sub.strip()
                if not sub:
                    continue
                if len(current) + len(sub) + 1 <= max_length:
                    current += sub + "\n"
                else:
                    if len(current.strip()) >= min_length:
                        chunks.append(current.strip())
                    current = f"{header} (cont.):\n{sub}\n"
            if len(current.strip()) >= min_length:
                chunks.append(current.strip())

    # Final safety fallback
    if not chunks:
        print("⚠️  No chunks produced — returning full resume as single chunk.")
        return [resume_text.strip()]

    print(f"✅ Split into {len(chunks)} chunks.")
    return chunks


def force_newlines_before_headings(text: str) -> str:
    """
    Inserts a newline before common section headings to improve split accuracy.
    """
    return re.sub(
        r'(^|\n)(\s*)'
        r'(Skills|Technical Skills|Core Skills|Projects|Experience|Work Experience|'
        r'Internship|Education|Certifications|Achievements|Summary|Objective|Profile|'
        r'Publications|Awards|Languages|Tools)'
        r'\s*:?',
        r'\1\2\n\3',
        text,
        flags=re.IGNORECASE
    )