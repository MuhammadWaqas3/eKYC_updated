import os
from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import liveness, cnic, chatbot, fingerprint
from routers.cnic import initialize_models
from auth import verify_token

app = FastAPI(title="Avanza eKYC Verification API")

# CORS — allow all origins in dev; restrict to your Vercel URL in prod via env
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "*"  # override this on Railway with your Vercel URL
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(liveness.router)
app.include_router(cnic.router, dependencies=[Depends(verify_token)])
app.include_router(chatbot.router)   # Public — chatbot uses its own session store
app.include_router(fingerprint.router, dependencies=[Depends(verify_token)])

# Serve static frontend (only if static/ folder exists — local dev)
if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.get("/")
    def root():
        return FileResponse("static/index.html")
else:
    @app.get("/")
    def root():
        return {"status": "ok", "service": "Avanza eKYC API"}


@app.on_event("startup")
def startup_event():
    try:
        initialize_models()
    except Exception as e:
        print(f"Model initialization error: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)