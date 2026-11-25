import re
from collections import Counter

from app.services.integrity.models import FlagSeverity, TrustFlag

STOPWORDS = {
    "and", "with", "in", "for", "at", "the", "a", "an", "of", "to", "on",
    "is", "are", "by", "as", "from", "into", "that", "this", "or", "it",
    "was", "were", "be", "been", "have", "has", "had", "do", "does", "did",
    "can", "could", "will", "would", "should", "our", "we", "i", "my",
}

TOKEN_RE = re.compile(r"\b[a-zA-Z0-9+#.-]{2,}\b")


class KeywordStuffingDetector:
    """Detects keyword stuffing, unnatural skill density, and job description injection."""

    def inspect(
        self,
        resume_text: str,
        job_text: str | None = None,
        job_required_skills: list[str] | None = None,
    ) -> list[TrustFlag]:
        flags: list[TrustFlag] = []
        cleaned_resume = resume_text.strip()
        if not cleaned_resume:
            return flags

        # 1. Abnormal Keyword Repetition
        repetition_flag = self._check_abnormal_repetition(cleaned_resume)
        if repetition_flag:
            flags.append(repetition_flag)

        # 2. Skill-List Density vs Real Context
        density_flag = self._check_skill_density(cleaned_resume)
        if density_flag:
            flags.append(density_flag)

        # 3. Copy-Pasted Job Description Text
        if job_text:
            injection_flag = self._check_job_description_injection(
                cleaned_resume, job_text
            )
            if injection_flag:
                flags.append(injection_flag)

        return flags

    def _check_abnormal_repetition(self, text: str) -> TrustFlag | None:
        words = [w.lower() for w in TOKEN_RE.findall(text)]
        content_words = [w for w in words if w not in STOPWORDS]
        if len(content_words) < 25:
            return None

        freqs = Counter(content_words)
        total_content = len(content_words)

        suspicious: list[tuple[str, int, float]] = []
        for word, count in freqs.most_common(5):
            pct = count / total_content
            # Trigger if word is repeated >= 10 times and accounts for >= 7% of non-stopword tokens
            if count >= 10 and pct >= 0.07:
                suspicious.append((word, count, pct))

        # Check paragraph-level repetition
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for p in paragraphs:
            p_words = [w.lower() for w in TOKEN_RE.findall(p) if w.lower() not in STOPWORDS]
            p_counts = Counter(p_words)
            for word, count in p_counts.items():
                if count >= 8 and (word, count, count / max(1, len(p_words))) not in suspicious:
                    suspicious.append((word, count, count / max(1, len(p_words))))

        if suspicious:
            top_word, top_count, top_pct = suspicious[0]
            return TrustFlag(
                code="EXCESSIVE_KEYWORD_REPETITION",
                severity=FlagSeverity.MEDIUM,
                penalty=0.20,
                reason=(
                    f"Abnormal keyword repetition detected: '{top_word}' repeats {top_count} times "
                    f"({top_pct:.1%} of vocabulary)."
                ),
                evidence={
                    "abnormal_keywords": [
                        {"word": w, "count": c, "share": f"{p:.1%}"}
                        for w, c, p in suspicious
                    ]
                },
            )
        return None

    def _check_skill_density(self, text: str) -> TrustFlag | None:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        total_words = len(text.split())
        if total_words < 25:
            return None

        # Check for massive comma-separated skill lists (e.g. "React, Node, Python, Docker, AWS, ...")
        comma_list_count = 0
        max_consecutive_tags = 0
        for line in lines:
            parts = [p.strip() for p in line.split(",") if p.strip()]
            if len(parts) >= 8:
                comma_list_count += len(parts)
                max_consecutive_tags = max(max_consecutive_tags, len(parts))

        # If more than 20 comma-separated items exist in an isolated list or comma list is > 40% of document
        if max_consecutive_tags >= 18 or (total_words >= 40 and (comma_list_count / total_words) > 0.40):
            return TrustFlag(
                code="ABNORMAL_SKILL_DENSITY",
                severity=FlagSeverity.MEDIUM,
                penalty=0.20,
                reason=(
                    f"Abnormally dense skill list ({max_consecutive_tags} consecutive tags) "
                    "without supporting narrative or project context."
                ),
                evidence={
                    "consecutive_tags": max_consecutive_tags,
                    "total_comma_tags": comma_list_count,
                    "total_words": total_words,
                },
            )
        return None

    def _check_job_description_injection(
        self, resume_text: str, job_text: str
    ) -> TrustFlag | None:
        norm_resume = " ".join(resume_text.lower().split())
        norm_job = " ".join(job_text.lower().split())

        # Check verbatim 14-word shingles
        job_words = norm_job.split()
        if len(job_words) < 14:
            return None

        shingle_len = 14
        matching_shingles: list[str] = []
        for i in range(0, len(job_words) - shingle_len + 1, 4):
            shingle = " ".join(job_words[i : i + shingle_len])
            if shingle in norm_resume:
                matching_shingles.append(shingle)

        # Check sentence overlap
        job_sentences = [
            s.strip()
            for s in re.split(r"[.\n;]+", job_text)
            if len(s.strip().split()) >= 10
        ]
        matching_sentences: list[str] = []
        for s in job_sentences:
            cleaned = " ".join(s.lower().split())
            if cleaned and cleaned in norm_resume:
                matching_sentences.append(s.strip())

        if matching_shingles or len(matching_sentences) >= 2:
            evidence_sample = matching_sentences[0] if matching_sentences else matching_shingles[0]
            return TrustFlag(
                code="JOB_DESCRIPTION_INJECTION",
                severity=FlagSeverity.CRITICAL,
                penalty=0.50,
                reason=(
                    "Detected verbatim job description text copied directly inside the resume "
                    f"('{evidence_sample[:60]}...')."
                ),
                evidence={
                    "matching_shingle_count": len(matching_shingles),
                    "matching_sentence_count": len(matching_sentences),
                    "sample": evidence_sample[:120],
                },
            )
        return None
