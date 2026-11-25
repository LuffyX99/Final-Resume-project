import io


def parse_pdf(file_bytes: bytes) -> str:
    import pymupdf

    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n\n".join(pages).strip()


def parse_docx(file_bytes: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    text_chunks = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

    for table in doc.tables:
        for row in table.rows:
            row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_texts:
                deduped = []
                for t in row_texts:
                    if not deduped or t != deduped[-1]:
                        deduped.append(t)
                text_chunks.append(" | ".join(deduped))

    return "\n\n".join(text_chunks).strip()


def parse_file(file_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        return parse_pdf(file_bytes)
    elif ext == "docx":
        return parse_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Only PDF and DOCX are supported.")
