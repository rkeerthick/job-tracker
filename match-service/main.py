from fastapi import FastAPI

app = FastAPI()


# Next.js: app/api/health/route.ts -> export async function GET()
@app.get("/health")
def health():
    # Returning a dict is enough: FastAPI turns it into a JSON response.
    return {"status": "ok"}
