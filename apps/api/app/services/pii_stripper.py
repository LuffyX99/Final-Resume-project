import logging
import re

from openai import AsyncOpenAI

from app.config import settings

PII_MODEL = "gpt-4o-mini"
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a PII removal assistant for bias-reduced resume matching. Given a text (resume or job description), remove all personally identifiable information while preserving professional content.

Remove:
- Names (person names, not company/technology names)
- Age, date of birth
- Gender, pronouns, marital status
- Ethnicity, nationality, race
- Physical descriptions, photo references
- Home address, personal phone, personal email
- Social media profiles (LinkedIn, etc.)
- References to protected characteristics

Keep:
- Skills, technologies, tools
- Work experience descriptions (job titles, responsibilities, achievements)
- Education (degrees, fields of study, certifications — but remove institution names that could reveal demographics)
- Years of experience (as ranges, not exact dates that reveal age)
- Professional certifications and awards

Return ONLY the cleaned text with PII removed. Do not add explanations or markers."""


class PIIStripperService:
    def __init__(self):
        self.client = (
            AsyncOpenAI(api_key=settings.openai_api_key)
            if settings.openai_api_key
            else None
        )

    async def strip_pii(self, text: str) -> str:
        text = text.strip()
        if not text:
            return text

        if self.client is None:
            return self._local_strip(text)

        try:
            response = await self.client.chat.completions.create(
                model=PII_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                temperature=0,
            )
            return response.choices[0].message.content or text
        except Exception as exc:
            logger.warning(
                "OpenAI PII cleanup failed (%s); using local redaction.",
                type(exc).__name__,
            )
            return self._local_strip(text)

    @staticmethod
    def _local_strip(text: str) -> str:
        text = re.sub(
            r"(?im)^\s*(?:full\s+)?name\s*:\s*[^\r\n]+",
            "Name: [REDACTED]",
            text,
        )
        text = re.sub(
            r"(?im)^\s*(?:date of birth|birth date|dob)\s*:\s*[^\r\n]+",
            "Date of birth: [REDACTED]",
            text,
        )
        text = re.sub(
            r"(?im)^\s*(?:home )?address\s*:\s*[^\r\n]+",
            "Address: [REDACTED]",
            text,
        )
        text = re.sub(
            r"(?im)^\s*(?:phone|mobile|telephone)\s*:\s*[^\r\n]+",
            "Phone: [REDACTED]",
            text,
        )
        text = re.sub(
            r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
            "[REDACTED EMAIL]",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r"(?<!\w)(?:\+?\d[\d().\s-]{7,}\d)(?!\w)",
            "[REDACTED PHONE]",
            text,
        )
        text = re.sub(
            r"\b(?:https?://)?(?:www\.)?(?:linkedin\.com/in|github\.com)/[^\s]+\b",
            "[REDACTED PROFILE]",
            text,
            flags=re.IGNORECASE,
        )
        return text
