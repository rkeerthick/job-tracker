"""Naive matching (no LLM): which of the job's skills appear in the resume text? This is the evals baseline.

Pure functions, no FastAPI, so they are trivial to test. An LLM version comes in the next session
and must keep the same MatchResponse shape.
"""
import re

from schemas import MatchRequest, MatchResponse


def _clean_skills(skills: list[str]) -> list[str]:
    """Trim, drop blanks, drop case-insensitive duplicates, keep the first spelling and the order."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in skills:
        skill = raw.strip()
        if skill and skill.lower() not in seen:
            seen.add(skill.lower())
            out.append(skill)
    return out


def _mentions(text: str, skill: str) -> bool:
    """Whole-word, case-insensitive. A plain `in` check would say "Java" is in "JavaScript".

    \b does not work for names like "C++" or ".NET", so the boundary is
    "not a letter or digit on either side" instead. One extra rule: a one-letter skill ("C", "R")
    must not be followed by + or #, or "C" would match inside "C++" and "C#".
    """
    after = r"(?![A-Za-z0-9+#])" if len(skill) == 1 else r"(?![A-Za-z0-9])"
    pattern = r"(?<![A-Za-z0-9])" + re.escape(skill) + after
    return re.search(pattern, text, flags=re.IGNORECASE) is not None


# Fixed on purpose: this is the BASELINE the LLM version will be compared against in the evals
# ("is the LLM answer better than keyword matching?"), so it must stay simple and deterministic.
SUGGESTION = "Baseline match (keyword check only). Add the missing skills to your resume if you have them."


def match(req: MatchRequest) -> MatchResponse:
    skills = _clean_skills(req.skills)
    matched = [s for s in skills if _mentions(req.resume_text, s)]
    missing = [s for s in skills if s not in matched]

    # Divide-by-zero guard. With no skills there is nothing to measure, and we do NOT claim a
    # perfect match (100) or an error (the job simply listed no skills), so the score is 0.
    # An evals note for later: "0 because empty" is different from "0 because nothing matched".
    # Round HALF UP with integer maths. Python's round() rounds halves to the nearest EVEN number
    # (12.5 -> 12 but 37.5 -> 38), which would make scores inconsistent for the evals.
    score = (200 * len(matched) + len(skills)) // (2 * len(skills)) if skills else 0

    return MatchResponse(score=score, matched_skills=matched, missing_skills=missing, suggestion=SUGGESTION)
