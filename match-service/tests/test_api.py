"""API-level tests: the real FastAPI app, called in-process (no server, no network)."""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

RESUME = "Frontend developer with 3 years of experience. Built apps with React, TypeScript and Next.js. Wrote tests with Jest."


def body(**over):
    return {"resume_text": RESUME, "role": "Frontend Developer", "company": "Acme", "skills": ["React", "TypeScript", "GraphQL", "Docker"], **over}


def test_health_is_200_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_match_returns_the_contract_shape():
    r = client.post("/match", json=body())
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"score", "matched_skills", "missing_skills", "suggestion"}
    assert d["matched_skills"] == ["React", "TypeScript"]
    assert d["missing_skills"] == ["GraphQL", "Docker"]
    assert d["score"] == 50
    assert isinstance(d["score"], int)


def test_short_resume_is_422():
    r = client.post("/match", json=body(resume_text="too short"))
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "resume_text"]


def test_other_invalid_bodies_are_422():
    for payload in [
        body(resume_text="x" * 20_001),
        body(role=""), body(role="   "), body(company=""),
        body(skills=["s"] * 31),
        body(skills=["s" * 101]),
        body(skills="React"),
        {},
    ]:
        assert client.post("/match", json=payload).status_code == 422, payload
    r = client.post("/match", content="not json", headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_limits_are_inclusive():
    assert client.post("/match", json=body(resume_text="x" * 50)).status_code == 200
    assert client.post("/match", json=body(resume_text="x" * 20_000)).status_code == 200
    assert client.post("/match", json=body(skills=["s%d" % i for i in range(30)])).status_code == 200
    assert client.post("/match", json=body(skills=["s" * 100])).status_code == 200


def test_missing_skills_field_is_allowed_and_scores_zero():
    payload = {k: v for k, v in body().items() if k != "skills"}
    r = client.post("/match", json=payload)
    assert r.status_code == 200
    assert r.json()["score"] == 0


def test_unknown_request_fields_are_ignored_not_echoed():
    d = client.post("/match", json=body(userId=999, password="x")).json()
    assert "userId" not in d and "password" not in d
