from fastapi import FastAPI

from matching import match
from schemas import MatchRequest, MatchResponse

app = FastAPI()


# Next.js: app/api/health/route.ts -> export async function GET()
@app.get("/health")
def health():
    # Returning a dict is enough: FastAPI turns it into a JSON response.
    return {"status": "ok"}


# Next.js: app/api/match/route.ts -> export async function POST(request)
# `body: MatchRequest` = parseBody(request, schema): invalid input never reaches this function, FastAPI
# answers 422 with the field errors. response_model keeps the output exactly the contract's shape.
@app.post("/match", response_model=MatchResponse)
def post_match(body: MatchRequest):
    return match(body)
