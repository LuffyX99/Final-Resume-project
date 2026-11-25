import { describe, expect, it } from "vitest";
import {
  deriveMatchInsight,
  jobSkillsForMatching,
  rankApplicants,
} from "../matchInsight";
import type { Job, Match } from "../../types";

const job: Job = {
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build APIs",
  skills: ["Python", "FastAPI", "PostgreSQL"],
  required_skills: ["Python", "FastAPI", "PostgreSQL"],
  extracted_skills: ["Python", "FastAPI", "PostgreSQL"],
  location: null,
  experience: null,
  job_type: null,
  status: "open",
  recruiter_id: "recruiter-1",
  applicant_count: 0,
  shortlisted_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    job_id: job.id,
    resume_id: "resume-1",
    similarity_score: 0.8,
    bias_reduced: false,
    shortlisted: false,
    created_at: "2026-01-02T00:00:00Z",
    candidate_name: "Alice",
    candidate_skills: ["python", "FastAPI", "Docker"],
    job_company: "Acme",
    ...overrides,
  };
}

describe("deriveMatchInsight", () => {
  it("derives matched/missing skills case-insensitively", () => {
    const insight = deriveMatchInsight(makeMatch(), job);

    expect(insight.matchedSkills).toEqual(["Python", "FastAPI"]);
    expect(insight.missingSkills).toEqual(["PostgreSQL"]);
    expect(insight.trustScore).toBeCloseTo(2 / 3, 4);
    expect(insight.finalScore).toBeCloseTo(0.65 * 0.8 + 0.35 * (2 / 3), 4);
  });

  it("deduplicates skills while preserving the job's casing", () => {
    const insight = deriveMatchInsight(
      makeMatch({
        candidate_skills: ["python", "PYTHON", "fastapi", "FastAPI"],
      }),
      {
        ...job,
        required_skills: ["Python", "python", "FastAPI"],
      },
    );

    expect(insight.requiredSkills).toEqual(["Python", "FastAPI"]);
    expect(insight.matchedSkills).toEqual(["Python", "FastAPI"]);
    expect(insight.missingSkills).toEqual([]);
    expect(insight.trustScore).toBe(1);
  });

  it("falls back to extracted job skills when no required skills are set", () => {
    const insight = deriveMatchInsight(
      makeMatch({ candidate_skills: ["typescript"] }),
      { ...job, required_skills: [], skills: ["React", "TypeScript"] },
    );

    expect(insight.requiredSkills).toEqual(["React", "TypeScript"]);
    expect(insight.matchedSkills).toEqual(["TypeScript"]);
    expect(insight.missingSkills).toEqual(["React"]);
    expect(insight.trustScore).toBe(0.5);
  });

  it("uses similarity as trust when the job has no skills", () => {
    const insight = deriveMatchInsight(
      makeMatch({ candidate_skills: null }),
      { ...job, required_skills: [], skills: [] },
    );

    expect(insight.requiredSkills).toEqual([]);
    expect(insight.matchedSkills).toEqual([]);
    expect(insight.missingSkills).toEqual([]);
    expect(insight.trustScore).toBe(0.8);
    expect(insight.finalScore).toBe(0.8);
  });

  it("respects API-provided scores and alignment when present", () => {
    const insight = deriveMatchInsight(
      makeMatch({
        final_score: 0.42,
        trust_score: 0.9,
        readiness_score: 78,
        matched_skills: ["Python"],
        missing_skills: ["Rust"],
        stale_skills: ["AngularJS"],
        skill_gap_analysis: {
          readiness_score: 78,
          matched_skills: ["Python"],
          missing_skills: ["Rust"],
          stale_skills: ["AngularJS"],
          critical_missing_skills: ["Rust"],
          learning_steps: [
            {
              skill: "Rust",
              status: "missing",
              priority: 1,
              title: "Learn Rust",
              action: "Read The Rust Book",
              resource_hint: "doc.rust-lang.org",
              estimated_time: "2-4 weeks",
            },
          ],
        },
      }),
      { ...job, required_skills: ["Python", "Rust", "AngularJS"] },
    );

    expect(insight.finalScore).toBe(0.42);
    expect(insight.trustScore).toBe(0.9);
    expect(insight.readinessScore).toBe(78);
    expect(insight.matchedSkills).toEqual(["Python"]);
    expect(insight.missingSkills).toEqual(["Rust"]);
    expect(insight.staleSkills).toEqual(["AngularJS"]);
    expect(insight.learningSteps).toHaveLength(1);
    expect(insight.learningSteps[0].skill).toBe("Rust");
  });

  it("treats zero-valued API scores as authoritative", () => {
    const insight = deriveMatchInsight(
      makeMatch({ final_score: 0, trust_score: 0 }),
      job,
    );

    expect(insight.finalScore).toBe(0);
    expect(insight.trustScore).toBe(0);
  });

  it("clamps out-of-range API values to 0..1", () => {
    const insight = deriveMatchInsight(
      makeMatch({ similarity_score: 1.7, final_score: -0.2, trust_score: 3 }),
      job,
    );

    expect(insight.similarityScore).toBe(1);
    expect(insight.finalScore).toBe(0);
    expect(insight.trustScore).toBe(1);
  });

  it("does not mutate the fetched matches while ranking", () => {
    const matches = [
      makeMatch({ id: "low-sim-high-skills", similarity_score: 0.6 }),
      makeMatch({
        id: "high-sim-no-skills",
        similarity_score: 0.95,
        candidate_skills: [],
      }),
    ];
    const before = [...matches];

    const ranked = rankApplicants(matches, job);

    expect(matches).toEqual(before);
    expect(ranked[0].match.id).toBe("low-sim-high-skills");
    expect(ranked[0].insight.finalScore).toBeCloseTo(0.6233, 4);
    expect(ranked[1].match.id).toBe("high-sim-no-skills");
  });

  it("breaks final-score ties with similarity, then name", () => {
    const ranked = rankApplicants(
      [
        makeMatch({
          id: "alice",
          candidate_name: "Alice",
          similarity_score: 0.7,
          candidate_skills: [],
        }),
        makeMatch({
          id: "bob",
          candidate_name: "Bob",
          similarity_score: 0.8,
          candidate_skills: [],
        }),
      ],
      job,
    );

    expect(ranked.map((row) => row.match.id)).toEqual(["bob", "alice"]);
  });
});

describe("jobSkillsForMatching", () => {
  it("prefers required skills and falls back to extracted skills", () => {
    expect(jobSkillsForMatching(job)).toEqual([
      "Python",
      "FastAPI",
      "PostgreSQL",
    ]);
    expect(
      jobSkillsForMatching({ ...job, required_skills: [] }),
    ).toEqual(["Python", "FastAPI", "PostgreSQL"]);
  });
});
