"""Pins the baseline's KNOWN-WRONG answers (see KNOWN_WEAKNESSES.md).

Each test asserts what the baseline does TODAY, even where that is wrong. If one fails, the baseline changed: either
revert, or consciously re-baseline and re-record the eval numbers. The LLM version is NOT expected to pass these.
"""
from matching import match
from schemas import MatchRequest

PAD = " Padding so the resume reaches the fifty character minimum easily."


def run(resume: str, skill: str) -> bool:
    """True if the baseline says this skill is matched."""
    r = match(MatchRequest(resume_text=resume + PAD, role="Dev", company="Acme", skills=[skill]))
    return bool(r.matched_skills)


def test_1_alias_js_is_missed():
    assert run("I write JS every day.", "JavaScript") is False  # ideal: True


def test_2_alias_postgres_is_missed():
    assert run("Five years of Postgres administration.", "PostgreSQL") is False  # ideal: True


def test_3_common_word_go_is_a_false_positive():
    assert run("We go to market fast and ship weekly.", "Go") is True  # ideal: False


def test_4_dotnet_inside_aspdotnet_is_missed():
    assert run("Built services in ASP.NET for banks.", ".NET") is False  # ideal: True


def test_5_negation_is_ignored():
    assert run("I have no experience with Docker.", "Docker") is True  # ideal: False


def test_6_wishing_is_not_skill():
    assert run("I want to learn Kubernetes someday.", "Kubernetes") is True  # ideal: False


def test_7_node_vs_nodejs_is_missed():
    assert run("Backend work in Node for years.", "Node.js") is False  # ideal: True


def test_8_nextjs_spelling_is_missed():
    assert run("Shipped many NextJS sites.", "Next.js") is False  # ideal: True


def test_9_plural_is_missed():
    assert run("Wrote unit tests daily.", "Unit Test") is False  # ideal: True
