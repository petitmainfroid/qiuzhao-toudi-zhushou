# Local resume parser

This module reads the already encrypted, locally saved PDF through an injected
byte source. It extracts the PDF text layer in Node.js and returns only a
structured `CandidateProfile`, field paths, warnings, page count, and aggregate
character count. It never returns or persists the PDF text, filename, or bytes.

Scanned PDFs that do not contain a usable text layer fail closed with
`resume_ocr_required`; OCR is not silently invoked.
