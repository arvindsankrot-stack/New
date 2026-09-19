"""Turns an uploaded file into plain text for the LLM parser to consume."""

import csv
import io

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pages_text: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)
    return "\n".join(pages_text)


def extract_text_from_csv(file_bytes: bytes) -> str:
    """
    Statement CSV exports vary wildly by bank. Rather than guess a fixed
    column schema, we render every row as a plain text line and let the LLM
    parser (which is schema-flexible) do the interpretation — the same code
    path used for pasted text and PDF-extracted text.
    """
    text = file_bytes.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(text))
    rows = [", ".join(cell.strip() for cell in row) for row in reader if any(row)]
    return "\n".join(rows)


def extract_text(file_bytes: bytes, content_type: str, filename: str) -> str:
    lowered_name = filename.lower()
    if content_type == "application/pdf" or lowered_name.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    if content_type in ("text/csv", "application/vnd.ms-excel") or lowered_name.endswith(".csv"):
        return extract_text_from_csv(file_bytes)
    # Fallback: treat as plain text
    return file_bytes.decode("utf-8", errors="ignore")
