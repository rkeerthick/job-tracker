# Baseline matcher: known weaknesses

`POST /match` in this version is a **keyword baseline**: a skill counts as matched if it appears in the resume as a
whole word (case-insensitive). These are not bugs to fix here. They are the cases the LLM version is expected to handle
better, and the first test cases for the February evals ("is the LLM better than the baseline?").

The current (wrong) behaviour of every row is pinned in `tests/test_known_weaknesses.py`. If you change the baseline, that file
fails on purpose: **keep the baseline frozen**, otherwise scores recorded earlier can no longer be compared.

## Planned cases

| # | Resume says | Job skill | Baseline | Ideal | Why |
|---|---|---|---|---|---|
| 1 | "JS" | "JavaScript" | miss | match | alias / abbreviation |
| 2 | "Postgres" | "PostgreSQL" | miss | match | alias / short name |
| 3 | "We go to market fast" | "Go" | **match** (false positive) | miss | common word, no sense of context |
| 4 | "ASP.NET" | ".NET" | miss | match | the word-boundary rule (nothing alphanumeric directly before) blocks "P.NET" |

## Found while checking

| # | Resume says | Job skill | Baseline | Ideal | Why |
|---|---|---|---|---|---|
| 5 | "I have no experience with Docker" | "Docker" | **match** | miss | negation is invisible |
| 6 | "I want to learn Kubernetes someday" | "Kubernetes" | **match** | miss | mention is not experience |
| 7 | "Node" | "Node.js" | miss | match | partial name |
| 8 | "NextJS" | "Next.js" | miss | match | spelling variant |
| 9 | "unit tests" | "Unit Test" | miss | match | plural / word form |

## Limits that are not about the skill list

- **`role` and `company` are never used.** They only appear in the request. A match is purely skills vs resume text.
- **All skills weigh the same.** Missing "Docker" costs as much as missing the core language of the job.
- **Years, seniority and context are ignored.** "Used React once in 2015" matches like "5 years of React".
- **Score 0 has two meanings:** "the job listed no skills" and "nothing matched". Keep them apart when scoring (check `missing_skills`).
- **One-letter skills ("C", "R") need a special rule** so "C" does not match inside "C++" or "C#". Other symbol-heavy names are only handled by the general boundary rule.
- **The suggestion is a fixed string.** It never says anything about the actual gaps.

## Fixed during the baseline work (not weaknesses any more)

- Substring matching ("Java" inside "JavaScript"): replaced by whole-word matching.
- `round()` rounding halves to even (12.5 -> 12, 37.5 -> 38): the score now rounds half up.
