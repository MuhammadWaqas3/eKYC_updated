from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import liveness, cnic, chatbot, fingerprint
from routers.cnic import initialize_models
from fastapi import Depends
from auth import verify_token

app = FastAPI(title="Verification Pipeline")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Note: liveness routes are mostly protected inside liveness.py to exclude video_feed
app.include_router(liveness.router)
app.include_router(cnic.router, dependencies=[Depends(verify_token)])
app.include_router(chatbot.router)  # Public — chatbot uses its own session store, no auth needed
app.include_router(fingerprint.router, dependencies=[Depends(verify_token)])

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")


@app.on_event("startup")
def startup_event():
    try:
        initialize_models()
    except Exception as e:
        print(f"Model initialization error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)