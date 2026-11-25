from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class FlagSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


@dataclass
class TrustFlag:
    code: str
    severity: FlagSeverity
    penalty: float
    reason: str
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity.value,
            "penalty": self.penalty,
            "reason": self.reason,
            "evidence": self.evidence,
        }


@dataclass
class TrustEvaluationResult:
    trust_score: float
    flags: list[TrustFlag]
    similarity_score: float = 0.0
    final_score: float = 0.0
    is_shortlisted: bool = False

    def flags_as_dicts(self) -> list[dict[str, Any]]:
        return [f.to_dict() for f in self.flags]
