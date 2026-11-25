"""Unit tests for the matching logic (no HTTP): matching.match() in, MatchResponse out.

Vitest -> pytest:  test("x", () => expect(a).toBe(b))   ==>   def test_x(): assert a == b
"""
from matching import match
from schemas import MatchRequest

PAD = " Padding so the resume reaches the fifty character minimum easily."


def run(resume: str, skills: list[str]):
    return match(MatchRequest(resume_text=resume + PAD, role="Dev", company="Acme", skills=skills))


def test_java_is_not_matched_by_javascript_only():
    r = run("I only ever wrote JavaScript.", ["Java"])
    assert r.matched_skills == []
    assert r.missing_skills == ["Java"]


def test_java_and_javascript_are_told_apart():
    r = run("Some Java and some JavaScript.", ["Java", "JavaScript"])
    assert r.matched_skills == ["Java", "JavaScript"]


def test_c_is_not_matched_by_cpp_or_csharp():
    r = run("Ten years of C++ and C# development.", ["C"])
    assert r.matched_skills == []
    assert r.missing_skills == ["C"]


def test_cpp_and_csharp_match_themselves_and_plain_c_matches_plain_c():
    r = run("Ten years of C++ and C# development, plus embedded C.", ["C++", "C#", "C"])
    assert r.matched_skills == ["C++", "C#", "C"]


def test_case_insensitive_keeps_the_request_spelling():
    r = run("I build interfaces with react every day.", ["React"])
    assert r.matched_skills == ["React"]
    r = run("I build interfaces with REACT every day.", ["react"])
    assert r.matched_skills == ["react"]


def test_duplicate_skills_count_once():
    r = run("I use React daily.", ["React", "react", "REACT"])
    assert r.matched_skills == ["React"]
    assert r.score == 100


def test_duplicate_missing_skills_count_once():
    r = run("I use React daily.", ["Docker", "docker"])
    assert r.missing_skills == ["Docker"]


def test_empty_skills_gives_score_zero_without_crashing():
    r = run("I use React daily.", [])
    assert r.score == 0
    assert r.matched_skills == []
    assert r.missing_skills == []


def test_all_matched_is_100():
    r = run("React, TypeScript and Jest.", ["React", "TypeScript", "Jest"])
    assert r.score == 100
    assert r.missing_skills == []


def test_none_matched_is_0():
    r = run("I only cook and paint.", ["React", "TypeScript", "Jest"])
    assert r.score == 0
    assert r.matched_skills == []
    assert r.missing_skills == ["React", "TypeScript", "Jest"]


def test_blank_skills_are_ignored():
    r = run("I use React daily.", ["React", " ", "", "   "])
    assert r.matched_skills == ["React"]
    assert r.missing_skills == []
    assert r.score == 100  # blanks do not count as missing skills


def test_skills_with_symbols():
    r = run("Services in .NET and tooling in Node.js, with some C#.", [".NET", "Node.js", "C#"])
    assert r.matched_skills == [".NET", "Node.js", "C#"]


def test_score_rounds_half_up_not_to_even():
    # 1/8 = 12.5 and 3/8 = 37.5. Python's round() would give 12 and 38.
    skills = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"]
    assert run("I use alpha.", skills).score == 13
    assert run("I use alpha, gamma and epsilon.", skills).score == 38


def test_suggestion_is_the_fixed_baseline_string():
    from matching import SUGGESTION
    assert run("I use React.", ["React"]).suggestion == SUGGESTION
    assert run("I use React.", []).suggestion == SUGGESTION
