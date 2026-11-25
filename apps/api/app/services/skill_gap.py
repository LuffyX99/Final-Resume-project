import json
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

from app.config import settings
from app.services.skill_extraction import SKILL_ALIASES

logger = logging.getLogger(__name__)

# Deprecated/legacy technologies mapped to modern counterparts or staleness markers
LEGACY_SKILL_MAP = {
    "angularjs": "Angular",
    "python 2": "Python",
    "python 2.7": "Python",
    "vue 2": "Vue.js",
    "subversion": "Git",
    "svn": "Git",
    "cvs": "Git",
    "struts": "Spring Boot",
    "jquery": "JavaScript",
    "docker swarm": "Kubernetes",
    "soap": "REST API",
    "vb6": "C#",
}

# Rich deterministic curated learning recommendations
CURATED_LEARNING_STEPS: dict[str, dict[str, str]] = {
    "kubernetes": {
        "missing_title": "Build and Deploy Containerized Workloads on Kubernetes",
        "missing_action": "Containerize a multi-tier web application, write deployment and service YAML manifests, configure ingress routing, and deploy to a local Minikube or cloud Kubernetes cluster.",
        "stale_title": "Modernize Kubernetes Skills with Helm & GitOps",
        "stale_action": "Refresh knowledge by packaging apps using Helm charts and implementing automated GitOps continuous deployment using ArgoCD or Flux.",
        "resource": "Official Kubernetes Docs & CKA Curriculum",
        "time": "2-3 weeks",
    },
    "docker": {
        "missing_title": "Master Containerization with Docker",
        "missing_action": "Write multi-stage Dockerfiles for backend and frontend services, optimize image layer caching, and manage multi-container stacks with Docker Compose.",
        "stale_title": "Modernize Docker Workflows & Security",
        "stale_action": "Audit container images for CVE vulnerabilities with Docker Scout, use rootless containers, and implement distroless base images.",
        "resource": "Docker Documentation & Best Practices Guide",
        "time": "1-2 weeks",
    },
    "python": {
        "missing_title": "Core Python & Asynchronous Programming",
        "missing_action": "Learn Python 3.12+ features, type hints (mypy), asynchronous I/O with asyncio, and write unit tests using pytest.",
        "stale_title": "Refresh Python with Modern 3.12+ Syntax & Async Patterns",
        "stale_action": "Migrate older synchronous patterns to modern async/await, structural pattern matching, and dataclasses/Pydantic models.",
        "resource": "Python.org Official Tutorial & Real Python",
        "time": "2-3 weeks",
    },
    "fastapi": {
        "missing_title": "Develop High-Performance REST APIs with FastAPI",
        "missing_action": "Build an asynchronous CRUD API using FastAPI, Pydantic v2 schemas, SQLAlchemy 2.0 async sessions, and dependency injection.",
        "stale_title": "Update to FastAPI & Pydantic v2 Standards",
        "stale_action": "Refactor API endpoints to use Pydantic v2 model_validate, lifespan event managers, and background task processing.",
        "resource": "FastAPI Official Documentation",
        "time": "1-2 weeks",
    },
    "react": {
        "missing_title": "Modern Frontend Development with React & TypeScript",
        "missing_action": "Build a responsive web application utilizing React 19 functional components, custom hooks, Tailwind CSS, and state management.",
        "stale_title": "Modernize React from Class Components to Hooks & Server Components",
        "stale_action": "Refactor legacy lifecycle methods to useEffect/useMemo and explore modern React server-side rendering or Next.js App Router.",
        "resource": "React.dev Official Documentation",
        "time": "2-3 weeks",
    },
    "typescript": {
        "missing_title": "Type-Safe Development with TypeScript",
        "missing_action": "Migrate JavaScript code to TypeScript with strict type checking, generics, utility types, and union discriminated interfaces.",
        "stale_title": "Advanced TypeScript Patterns & Strict Mode",
        "stale_action": "Implement advanced conditional types, template literal types, and eliminate 'any' types across your codebase.",
        "resource": "TypeScript Handbook",
        "time": "1-2 weeks",
    },
    "postgresql": {
        "missing_title": "Relational Database Design & Performance in PostgreSQL",
        "missing_action": "Design third-normal-form relational schemas, write complex joins and window functions, analyze EXPLAIN ANALYZE query plans, and add B-tree/GIN indexes.",
        "stale_title": "Modern PostgreSQL Tuning & pgvector Extensions",
        "stale_action": "Explore PostgreSQL 16 features, query optimization, connection pooling with PgBouncer, and vector similarity search with pgvector.",
        "resource": "PostgreSQL Documentation & Use The Index Luke",
        "time": "2 weeks",
    },
    "aws": {
        "missing_title": "Cloud Architecture on Amazon Web Services (AWS)",
        "missing_action": "Deploy cloud infrastructure using AWS ECS/Fargate, RDS PostgreSQL, S3, and CloudFront with Infrastructure-as-Code (Terraform or AWS CDK).",
        "stale_title": "Refresh AWS with Serverless & Containerized Solutions",
        "stale_action": "Modernize EC2-heavy architectures to containerized serverless tasks on ECS Fargate and automated CI/CD deployment pipelines.",
        "resource": "AWS Well-Architected Framework & Solutions Library",
        "time": "3 weeks",
    },
    "redis": {
        "missing_title": "Caching & In-Memory Data Structures with Redis",
        "missing_action": "Implement cache-aside patterns, rate limiting with Redis sliding-window counters, and pub/sub message brokers.",
        "stale_title": "Redis Streams & Advanced In-Memory Patterns",
        "stale_action": "Upgrade simple key-value caching to Redis Streams and distributed locks (Redlock) for fault-tolerant microservices.",
        "resource": "Redis University & Developer Guide",
        "time": "1 week",
    },
    "ci/cd": {
        "missing_title": "Automated Testing & Deployment Pipelines (CI/CD)",
        "missing_action": "Create automated GitHub Actions workflows that execute linting, unit tests, security scans, and deploy Docker images to production.",
        "stale_title": "Modernize CI/CD with Pipeline-as-Code & Matrix Builds",
        "stale_action": "Replace manual deployment scripts with multi-stage GitHub Actions workflows using OIDC authentication to cloud providers.",
        "resource": "GitHub Actions Documentation",
        "time": "1 week",
    },
}

YEAR_RANGE_RE = re.compile(r"\b(20\d{2}|19\d{2})\s*(?:[-–—]|to)\s*(20\d{2}|present|current)\b", re.IGNORECASE)
SINGLE_YEAR_RE = re.compile(r"\b(20\d{2})\b")


@dataclass
class LearningStep:
    skill: str
    status: str  # "missing" | "stale"
    title: str
    action: str
    resource_hint: str = ""
    estimated_time: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SkillGapAnalysis:
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    stale_skills: list[str] = field(default_factory=list)
    readiness_score: int = 0
    learning_steps: list[LearningStep] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "stale_skills": self.stale_skills,
            "readiness_score": self.readiness_score,
            "learning_steps": [s.to_dict() for s in self.learning_steps],
        }


def normalize_skill(skill: str) -> str:
    """Normalize a skill name using alias tables and canonical casing."""
    cleaned = skill.strip()
    if not cleaned:
        return ""
    lower = cleaned.lower()
    return SKILL_ALIASES.get(lower, cleaned)


class SkillGapService:
    """Classifies skill gaps, evaluates temporal staleness, and computes readiness."""

    def __init__(self, current_year: int = 2026):
        self.current_year = current_year
        self.stale_threshold_years = settings.stale_skill_years_threshold
        self.stale_credit = settings.stale_skill_credit

    def _extract_timeline_contexts(self, resume_text: str) -> list[tuple[int, int, str]]:
        """Extract paragraphs and their associated active year intervals."""
        paragraphs = [p.strip() for p in resume_text.split("\n\n") if p.strip()]
        contexts: list[tuple[int, int, str]] = []

        current_start = self.current_year
        current_end = self.current_year

        for p in paragraphs:
            # Check for year ranges e.g. "2018 - 2021" or "2023 - Present"
            match = YEAR_RANGE_RE.search(p)
            if match:
                start_year = int(match.group(1))
                end_str = match.group(2).lower()
                end_year = self.current_year if end_str in {"present", "current"} else int(end_str)
                current_start = start_year
                current_end = end_year
            else:
                # Check for single year
                single_match = SINGLE_YEAR_RE.search(p)
                if single_match:
                    y = int(single_match.group(1))
                    current_start = y
                    current_end = y

            contexts.append((current_start, current_end, p))

        return contexts

    def _is_skill_stale(
        self,
        skill: str,
        resume_text: str,
        timeline: list[tuple[int, int, str]],
    ) -> bool:
        """Determine if a skill is stale based on recency or legacy technology."""
        lower_skill = skill.lower()

        # 1. Check if the skill matches known legacy technologies
        if lower_skill in LEGACY_SKILL_MAP:
            return True

        # Check if resume mentions a legacy counterpart (e.g. mentions "AngularJS" when "Angular" required)
        for legacy_tech, modern_counterpart in LEGACY_SKILL_MAP.items():
            if modern_counterpart.lower() == lower_skill:
                pattern = rf"\b{re.escape(legacy_tech)}\b"
                if re.search(pattern, resume_text, re.IGNORECASE):
                    # Check if modern counterpart is NOT mentioned recently
                    modern_pattern = rf"\b{re.escape(modern_counterpart)}\b"
                    if not re.search(modern_pattern, resume_text, re.IGNORECASE):
                        return True

        # 2. Check temporal recency across resume experience sections
        skill_re = re.compile(rf"\b{re.escape(lower_skill)}\b", re.IGNORECASE)
        max_year_practiced: int | None = None
        has_recent_mention = False
        cutoff_year = self.current_year - self.stale_threshold_years

        for start_year, end_year, paragraph_text in timeline:
            if skill_re.search(paragraph_text):
                if end_year >= cutoff_year:
                    has_recent_mention = True
                if max_year_practiced is None or end_year > max_year_practiced:
                    max_year_practiced = end_year

        # If skill was practiced exclusively in sections older than the cutoff
        if max_year_practiced is not None and max_year_practiced < cutoff_year and not has_recent_mention:
            return True

        return False

    def generate_learning_step(self, skill: str, status: str) -> LearningStep:
        """Generate a concrete, actionable learning recommendation for a skill."""
        lower_key = skill.lower().replace(".js", "").replace(" ", "")
        curated = None
        for key, step in CURATED_LEARNING_STEPS.items():
            if key == lower_key or key in lower_key or lower_key in key:
                curated = step
                break

        if curated:
            if status == "stale":
                return LearningStep(
                    skill=skill,
                    status=status,
                    title=curated.get("stale_title", f"Refresh and Modernize {skill} Skills"),
                    action=curated.get(
                        "stale_action",
                        f"Review latest releases and best practices for {skill}, updating existing projects to modern standards.",
                    ),
                    resource_hint=curated.get("resource", f"Official {skill} Documentation"),
                    estimated_time=curated.get("time", "1-2 weeks"),
                )
            else:
                return LearningStep(
                    skill=skill,
                    status=status,
                    title=curated.get("missing_title", f"Learn {skill} Fundamentals & Best Practices"),
                    action=curated.get(
                        "missing_action",
                        f"Build an end-to-end practical project incorporating {skill} with automated tests and production deployment.",
                    ),
                    resource_hint=curated.get("resource", f"Official {skill} Documentation"),
                    estimated_time=curated.get("time", "2-3 weeks"),
                )

        # Fallback template for uncurated skills
        if status == "stale":
            return LearningStep(
                skill=skill,
                status=status,
                title=f"Update and Refresh Knowledge in {skill}",
                action=f"Build a proof-of-concept demonstrating {skill} using the latest version, idioms, and industry best practices.",
                resource_hint=f"Official {skill} Documentation & Reference Guides",
                estimated_time="1-2 weeks",
            )
        else:
            return LearningStep(
                skill=skill,
                status=status,
                title=f"Master {skill} for Production Readiness",
                action=f"Complete a hands-on project utilizing {skill}, integrating it with standard tooling and documenting architectural decisions.",
                resource_hint=f"Official {skill} Documentation & Tutorials",
                estimated_time="2-3 weeks",
            )

    def analyze(
        self,
        *,
        required_skills: list[str],
        extracted_skills: list[str] | None = None,
        candidate_skills: list[str] | None = None,
        resume_text: str = "",
        similarity_score: float = 0.0,
    ) -> SkillGapAnalysis:
        """Perform comprehensive skill gap classification, readiness scoring, and learning path generation."""
        crit_set = {normalize_skill(s) for s in (required_skills or []) if s.strip()}
        extr_set = {normalize_skill(s) for s in (extracted_skills or []) if s.strip()} - crit_set

        all_target_skills = list(crit_set | extr_set)
        if not all_target_skills:
            # If job has no requirements, fall back to similarity score
            score = int(round(max(0.0, min(1.0, similarity_score)) * 100))
            return SkillGapAnalysis(
                matched_skills=candidate_skills or [],
                missing_skills=[],
                stale_skills=[],
                readiness_score=score,
                learning_steps=[],
            )

        # Build candidate's normalized skill set
        cand_normalized_map: dict[str, str] = {}
        for s in candidate_skills or []:
            norm = normalize_skill(s)
            if norm:
                cand_normalized_map[norm.lower()] = norm

        # Also search resume text directly for any unparsed mentions
        resume_lower = resume_text.lower()
        timeline = self._extract_timeline_contexts(resume_text)

        matched: list[str] = []
        missing: list[str] = []
        stale: list[str] = []

        total_weight = 0.0
        earned_credit = 0.0

        for skill in all_target_skills:
            skill_lower = skill.lower()
            is_critical = skill in crit_set
            weight = 2.0 if is_critical else 1.0
            total_weight += weight

            # Check if candidate has skill in extracted list or resume text
            in_candidate_list = skill_lower in cand_normalized_map
            in_resume_text = bool(re.search(rf"\b{re.escape(skill_lower)}\b", resume_lower))

            # Check if candidate has a recognized legacy technology variant
            has_legacy_variant = False
            for legacy_tech, modern in LEGACY_SKILL_MAP.items():
                if modern.lower() == skill_lower:
                    if legacy_tech in cand_normalized_map or re.search(
                        rf"\b{re.escape(legacy_tech)}\b", resume_lower
                    ):
                        has_legacy_variant = True
                        break

            if in_candidate_list or in_resume_text or has_legacy_variant:
                if has_legacy_variant or self._is_skill_stale(skill, resume_text, timeline):
                    stale.append(skill)
                    earned_credit += weight * self.stale_credit
                else:
                    matched.append(skill)
                    earned_credit += weight * 1.0
            else:
                missing.append(skill)
                # 0 credit for missing

        # Calculate Readiness Score (0-100) using half-up rounding
        raw_pct = (earned_credit / max(0.0001, total_weight)) * 100.0
        readiness_score = int(round(raw_pct + 1e-9))
        readiness_score = max(0, min(100, readiness_score))

        # Generate learning steps for missing and stale skills
        learning_steps: list[LearningStep] = []
        for s in missing:
            learning_steps.append(self.generate_learning_step(s, status="missing"))
        for s in stale:
            learning_steps.append(self.generate_learning_step(s, status="stale"))

        return SkillGapAnalysis(
            matched_skills=sorted(matched),
            missing_skills=sorted(missing),
            stale_skills=sorted(stale),
            readiness_score=readiness_score,
            learning_steps=learning_steps,
        )
