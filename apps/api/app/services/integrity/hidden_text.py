import io
import logging
from typing import Sequence

from app.services.integrity.models import FlagSeverity, TrustFlag

logger = logging.getLogger(__name__)


class HiddenTextDetector:
    """Inspects PDF and DOCX files for hidden or disguised text.

    Detects:
    - White / near-background font colors.
    - Zero or tiny font sizes (<= 2pt).
    - Off-page coordinates or collapsed bounding boxes in PDF.
    - Word 'vanish' or 'hidden' run properties in DOCX.
    """

    def inspect(self, file_bytes: bytes, filename: str) -> list[TrustFlag]:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "pdf":
            return self._inspect_pdf(file_bytes)
        elif ext == "docx":
            return self._inspect_docx(file_bytes)
        return []

    def _inspect_pdf(self, file_bytes: bytes) -> list[TrustFlag]:
        import pymupdf

        flags: list[TrustFlag] = []
        try:
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        except Exception as exc:
            logger.warning("Could not open PDF for hidden text inspection: %s", exc)
            return flags

        white_snippets: list[str] = []
        tiny_snippets: list[str] = []
        off_page_snippets: list[str] = []
        zero_bbox_snippets: list[str] = []

        try:
            for page_idx, page in enumerate(doc):
                page_rect = page.rect
                # Expand clip area to catch adversarial text positioned beyond printable page margins
                clip = pymupdf.Rect(
                    -1000, -1000, page_rect.width + 1000, page_rect.height + 1000
                )
                text_page = page.get_text("dict", clip=clip, flags=pymupdf.TEXTFLAGS_SEARCH)

                for block in text_page.get("blocks", []):
                    if block.get("type") != 0:  # 0 = text block
                        continue
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "").strip()
                            if not text:
                                continue

                            size = float(span.get("size", 10.0))
                            color = span.get("color", 0)
                            bbox = span.get("bbox", (0, 0, 0, 0))

                            # 1. Tiny font size (<= 2.0pt)
                            if size <= 2.0:
                                tiny_snippets.append(
                                    f"p.{page_idx + 1} ({size:.1f}pt): '{text[:40]}'"
                                )

                            # 2. White or near-white color
                            if isinstance(color, int):
                                r = (color >> 16) & 255
                                g = (color >> 8) & 255
                                b = color & 255
                            elif isinstance(color, (list, tuple)) and len(color) >= 3:
                                r = int(color[0] * 255 if color[0] <= 1.0 else color[0])
                                g = int(color[1] * 255 if color[1] <= 1.0 else color[1])
                                b = int(color[2] * 255 if color[2] <= 1.0 else color[2])
                            else:
                                r, g, b = 0, 0, 0

                            if r >= 245 and g >= 245 and b >= 245:
                                white_snippets.append(
                                    f"p.{page_idx + 1} (RGB #{r:02X}{g:02X}{b:02X}): '{text[:40]}'"
                                )

                            # 3. Off-page coordinates
                            x0, y0, x1, y1 = bbox
                            if (
                                x1 < -2
                                or y1 < -2
                                or x0 > page_rect.width + 2
                                or y0 > page_rect.height + 2
                            ):
                                off_page_snippets.append(
                                    f"p.{page_idx + 1} (bbox={bbox}): '{text[:40]}'"
                                )

                            # 4. Zero-size or collapsed bounding box
                            width = x1 - x0
                            height = y1 - y0
                            if width <= 0.5 or height <= 0.5:
                                zero_bbox_snippets.append(
                                    f"p.{page_idx + 1} (w={width:.1f}, h={height:.1f}): '{text[:40]}'"
                                )
        finally:
            doc.close()

        if white_snippets:
            flags.append(
                TrustFlag(
                    code="WHITE_TEXT_DETECTED",
                    severity=FlagSeverity.CRITICAL,
                    penalty=0.60,
                    reason=f"Detected {len(white_snippets)} hidden text span(s) matching background color (near-white).",
                    evidence={"samples": white_snippets[:5], "total_count": len(white_snippets)},
                )
            )

        if tiny_snippets:
            flags.append(
                TrustFlag(
                    code="TINY_FONT_TEXT",
                    severity=FlagSeverity.HIGH,
                    penalty=0.35,
                    reason=f"Detected {len(tiny_snippets)} span(s) with imperceptible tiny font size (<= 2pt).",
                    evidence={"samples": tiny_snippets[:5], "total_count": len(tiny_snippets)},
                )
            )

        if off_page_snippets:
            flags.append(
                TrustFlag(
                    code="OFF_PAGE_TEXT",
                    severity=FlagSeverity.HIGH,
                    penalty=0.35,
                    reason=f"Detected {len(off_page_snippets)} text span(s) rendered outside visible page margins.",
                    evidence={"samples": off_page_snippets[:5], "total_count": len(off_page_snippets)},
                )
            )

        if zero_bbox_snippets:
            flags.append(
                TrustFlag(
                    code="ZERO_SIZE_BOUNDING_BOX",
                    severity=FlagSeverity.HIGH,
                    penalty=0.35,
                    reason=f"Detected {len(zero_bbox_snippets)} text span(s) with collapsed or zero-size geometry.",
                    evidence={"samples": zero_bbox_snippets[:5], "total_count": len(zero_bbox_snippets)},
                )
            )

        return flags

    def _inspect_docx(self, file_bytes: bytes) -> list[TrustFlag]:
        from docx import Document
        from docx.oxml.ns import qn

        flags: list[TrustFlag] = []
        try:
            doc = Document(io.BytesIO(file_bytes))
        except Exception as exc:
            logger.warning("Could not open DOCX for hidden text inspection: %s", exc)
            return flags

        hidden_runs: list[str] = []
        tiny_runs: list[str] = []
        white_runs: list[str] = []

        def check_run(run) -> None:
            text = run.text.strip()
            if not text:
                return

            # Check hidden / vanish property
            has_vanish = False
            r_el = getattr(run, "_r", None)
            if r_el is not None and getattr(r_el, "rPr", None) is not None:
                rPr = r_el.rPr
                if (
                    rPr.find(qn("w:vanish")) is not None
                    or rPr.find(qn("w:hidden")) is not None
                ):
                    has_vanish = True

            if getattr(run.font, "hidden", False) or has_vanish:
                hidden_runs.append(f"'{text[:40]}'")

            # Check font size <= 2pt (pt is float, or in half-points <= 4)
            if run.font.size is not None and run.font.size.pt <= 2.0:
                tiny_runs.append(f"({run.font.size.pt:.1f}pt): '{text[:40]}'")

            # Check white color
            is_white = False
            if run.font.color and run.font.color.rgb:
                rgb = run.font.color.rgb
                if rgb[0] >= 245 and rgb[1] >= 245 and rgb[2] >= 245:
                    is_white = True
            elif r_el is not None and getattr(r_el, "rPr", None) is not None:
                color_el = r_el.rPr.find(qn("w:color"))
                if color_el is not None:
                    val = (color_el.get(qn("w:val")) or "").upper()
                    if val in {"FFFFFF", "FEFEFE", "FDFDFD", "FAFAFA", "F5F5F5", "WHITE"}:
                        is_white = True

            if is_white:
                white_runs.append(f"'{text[:40]}'")

        for p in doc.paragraphs:
            for r in p.runs:
                check_run(r)

        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        for r in p.runs:
                            check_run(r)

        if hidden_runs:
            flags.append(
                TrustFlag(
                    code="HIDDEN_RUN_PROPERTY",
                    severity=FlagSeverity.CRITICAL,
                    penalty=0.60,
                    reason=f"Detected {len(hidden_runs)} run(s) configured with Word 'Hidden' or 'Vanish' font attributes.",
                    evidence={"samples": hidden_runs[:5], "total_count": len(hidden_runs)},
                )
            )

        if white_runs:
            flags.append(
                TrustFlag(
                    code="WHITE_TEXT_DETECTED",
                    severity=FlagSeverity.CRITICAL,
                    penalty=0.60,
                    reason=f"Detected {len(white_runs)} text run(s) rendered in white font (#FFFFFF).",
                    evidence={"samples": white_runs[:5], "total_count": len(white_runs)},
                )
            )

        if tiny_runs:
            flags.append(
                TrustFlag(
                    code="TINY_FONT_TEXT",
                    severity=FlagSeverity.HIGH,
                    penalty=0.35,
                    reason=f"Detected {len(tiny_runs)} run(s) with imperceptible tiny font size (<= 2pt).",
                    evidence={"samples": tiny_runs[:5], "total_count": len(tiny_runs)},
                )
            )

        return flags
