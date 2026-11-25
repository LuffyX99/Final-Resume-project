import json
import logging
import re

from openai import APIConnectionError, AsyncOpenAI

from app.config import settings

EXTRACTION_MODEL = "gpt-4o-mini"
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a skill extraction assistant. Given a job description or resume text, extract a list of distinct professional skills, technologies, tools, and competencies mentioned.

Rules:
- Return ONLY a JSON object with a single key "skills" containing an array of strings
- Each skill should be concise (1-4 words)
- Normalize skill names (e.g. "JS" → "JavaScript", "k8s" → "Kubernetes")
- Remove duplicates
- Order by relevance/prominence in the text
- Maximum 30 skills

Example output: {"skills": ["Python", "Machine Learning", "Docker", "PostgreSQL"]}"""

LOCAL_SKILLS = (
    "Machine Learning", "Deep Learning", "Natural Language Processing",
    "Computer Vision", "Data Analysis", "Data Science", "Data Engineering",
    "Project Management", "Product Management", "Agile", "Scrum",
    "GitHub Actions", "Spring Boot", "Next.js", "Node.js", "Express.js",
    "scikit-learn", "TensorFlow", "PyTorch", "JavaScript", "TypeScript",
    "Python", "Java", "C++", "C#", "Rust", "Ruby", "PHP", "Swift",
    "Kotlin", "Golang", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
    "Elasticsearch", "DynamoDB", "AWS", "Azure", "Google Cloud", "GCP",
    "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "CI/CD",
    "Linux", "Git", "React", "Angular", "Vue.js", "Django", "Flask",
    "FastAPI", ".NET", "REST API", "GraphQL", "Microservices", "HTML",
    "CSS", "Tailwind CSS", "Pandas", "NumPy", "Apache Spark", "Airflow",
    "Excel", "Power BI", "Tableau", "Communication", "Leadership",
)
SKILL_ALIASES = {
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "k8s": "Kubernetes",
    "golang": "Golang",
    "postgres": "PostgreSQL",
    "scikit-learn": "scikit-learn",
}


class SkillExtractionService:
    def __init__(self):
        self.client = (
            AsyncOpenAI(api_key=settings.openai_api_key)
            if settings.openai_api_key
            else None
        )

    async def extract_skills(self, text: str) -> list[str]:
        text = text.strip()
        if not text:
            return []

        if self.client is None:
            return self._local_extract(text)

        try:
            response = await self.client.chat.completions.create(
                model=EXTRACTION_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )

            content = response.choices[0].message.content or "{}"
            data = json.loads(content)
            skills = data.get("skills", [])
            return [skill for skill in skills if isinstance(skill, str)][:30]
        except APIConnectionError:
            logger.warning(
                "OpenAI skill extraction is unreachable; using local skill matching."
            )
            return self._local_extract(text)

    @staticmethod
    def _local_extract(text: str) -> list[str]:
        normalized = text.casefold()
        matches = []
        for skill in LOCAL_SKILLS:
            name = skill.strip()
            if not name:
                continue
            pattern = re.escape(name.casefold()).replace(r"\ ", r"\s+")
            if re.search(rf"(?<![\w]){pattern}(?![\w])", normalized):
                matches.append((normalized.index(name.casefold()), name))

        found = {name.casefold(): (position, name) for position, name in matches}
        aliases = []
        for alias, canonical in SKILL_ALIASES.items():
            if re.search(rf"(?<![\w]){re.escape(alias)}(?![\w])", normalized):
                aliases.append((normalized.index(alias), canonical))
        for position, name in aliases:
            found.setdefault(name.casefold(), (position, name))

        return [
            name
            for _, name in sorted(found.values(), key=lambda match: match[0])[:30]
        ]
