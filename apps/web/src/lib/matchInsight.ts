import type { Job, LearningStep, Match } from "../types";

/**
 * Recruiter-facing score model.
 *
 * The API is the source of truth when it returns these fields. Until it does,
 * they are derived deterministically from the live match/job payload so every
 * screen shows the same ranking without storing a second copy of server data.
 *
 * Trust = share of the job's skill requirements evidenced in the candidate's
 * profile (falling back to semantic similarity when the job has no skills).
 * Final = weighted blend of semantic similarity and trust.
 */
export const SIMILARITY_WEIGHT = 0.65;
export const TRUST_WEIGHT = 0.35;

export interface MatchInsight {
  finalScore: number;
  similarityScore: number;
  trustScore: number;
  readinessScore: number;
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  staleSkills: string[];
  learningSteps: LearningStep[];
}

export interface RankedApplicant {
  match: Match;
  insight: MatchInsight;
}

type JobSkills = Pick<Job, "required_skills" | "skills">;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
}

function uniqueSkills(skills: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const skill of skills ?? []) {
    if (typeof skill !== "string") continue;
    const cleaned = skill.trim();
    if (!cleaned) continue;
    const key = normalizeSkill(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

/** Prefer recruiter-entered requirements, then fall back to extracted skills. */
export function jobSkillsForMatching(job: JobSkills): string[] {
  const required = uniqueSkills(job.required_skills);
  return required.length > 0 ? required : uniqueSkills(job.skills);
}

export function deriveMatchInsight(match: Match, job: JobSkills): MatchInsight {
  const similarityScore = clamp01(match.similarity_score);
  const requiredSkills = jobSkillsForMatching(job);
  const candidateSkills = new Set(
    uniqueSkills(match.candidate_skills).map(normalizeSkill),
  );

  const derivedMatched = requiredSkills.filter((skill) =>
    candidateSkills.has(normalizeSkill(skill)),
  );
  const derivedMissing = requiredSkills.filter(
    (skill) => !candidateSkills.has(normalizeSkill(skill)),
  );

  const hasApiAlignment =
    match.matched_skills != null && match.missing_skills != null;
  const matchedSkills = hasApiAlignment
    ? uniqueSkills(match.matched_skills)
    : derivedMatched;
  const missingSkills = hasApiAlignment
    ? uniqueSkills(match.missing_skills)
    : derivedMissing;
  const staleSkills = uniqueSkills(
    match.stale_skills ?? match.skill_gap_analysis?.stale_skills ?? [],
  );

  const derivedReadiness =
    requiredSkills.length > 0
      ? Math.round(
          ((matchedSkills.length + 0.5 * staleSkills.length) /
            requiredSkills.length) *
            100,
        )
      : Math.round(similarityScore * 100);

  const readinessScore =
    match.readiness_score != null
      ? Math.max(0, Math.min(100, match.readiness_score))
      : match.skill_gap_analysis?.readiness_score != null
        ? Math.max(0, Math.min(100, match.skill_gap_analysis.readiness_score))
        : Math.max(0, Math.min(100, derivedReadiness));

  const learningSteps = match.skill_gap_analysis?.learning_steps ?? [];

  const skillCoverage =
    requiredSkills.length > 0
      ? matchedSkills.length / requiredSkills.length
      : similarityScore;
  const trustScore =
    match.trust_score != null
      ? clamp01(match.trust_score)
      : clamp01(skillCoverage);

  const blendedScore =
    SIMILARITY_WEIGHT * similarityScore + TRUST_WEIGHT * trustScore;
  const finalScore =
    match.final_score != null
      ? clamp01(match.final_score)
      : clamp01(blendedScore);

  return {
    finalScore: round4(finalScore),
    similarityScore: round4(similarityScore),
    trustScore: round4(trustScore),
    readinessScore,
    requiredSkills,
    matchedSkills,
    missingSkills,
    staleSkills,
    learningSteps,
  };
}

/** Rank from the API payload only; never mutates the fetched match array. */
export function rankApplicants(
  matches: readonly Match[],
  job: JobSkills,
): RankedApplicant[] {
  return matches
    .map((match) => ({ match, insight: deriveMatchInsight(match, job) }))
    .sort(
      (a, b) =>
        b.insight.finalScore - a.insight.finalScore ||
        b.insight.similarityScore - a.insight.similarityScore ||
        (a.match.candidate_name ?? "").localeCompare(
          b.match.candidate_name ?? "",
        ) ||
        a.match.id.localeCompare(b.match.id),
    );
}
