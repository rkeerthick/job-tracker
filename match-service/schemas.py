"""The API contract for POST /match (what Next.js sends and what it gets back).

Next.js equivalent: the zod schemas in lib/validation.ts.
"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated
from pydantic import StringConstraints

# One skill: at most 100 characters (defined at module level: inside the class Pydantic would read it as a field).
Skill = Annotated[str, StringConstraints(max_length=100)]


class MatchRequest(BaseModel):
    # Trim whitespace first, so "   " cannot pass min_length (same idea as zod's .trim().min(1)).
    model_config = ConfigDict(str_strip_whitespace=True)

    resume_text: str = Field(min_length=50, max_length=20_000)
    # The tracker stores only the extracted fields (not the full posting), so these are the input.
    role: str = Field(min_length=1, max_length=255)
    company: str = Field(min_length=1, max_length=255)
    skills: list[Skill] = Field(default_factory=list, max_length=30)


class MatchResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
    suggestion: str
