"""
Fingerprint Verification Router
- Camera se fingers ki image lena
- Image ko save karna (temp mein)
- Verification status return karna
- Ye ek simple simulated fingerprint verification hai
  (production mein real biometric SDK use karein)
"""

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import os
import io
import time
from PIL import Image
import base64

router = APIRouter(prefix="/fingerprint", tags=["Fingerprint Verification"])

os.makedirs("temp/fingerprints", exist_ok=True)

# Global state
fp_state = {
    "image_saved": False,
    "verified": False,
    "timestamp": None,
    "message": "Fingerprint not captured yet",
}


@router.post("/upload")
async def upload_fingerprint(file: UploadFile = File(...)):
    """
    Frontend se fingerprint image receive karo aur save karo.
    Returns verification result.
    """
    try:
        contents = await file.read()

        # Image validate karo
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        w, h = img.size

        if w < 50 or h < 50:
            return JSONResponse({
                "ok": False,
                "message": "Image too small. Please capture a clear image."
            })

        # Temp mein save karo
        timestamp = int(time.time())
        filename = f"temp/fingerprints/fp_{timestamp}.jpg"
        img.save(filename, "JPEG", quality=90)

        # State update karo
        fp_state["image_saved"] = True
        fp_state["verified"] = True
        fp_state["timestamp"] = timestamp
        fp_state["message"] = "Fingerprint captured and verified successfully!"

        return JSONResponse({
            "ok": True,
            "verified": True,
            "message": "Fingerprint verified successfully!",
            "timestamp": timestamp,
            "image_size": f"{w}x{h}",
        })

    except Exception as e:
        return JSONResponse({
            "ok": False,
            "message": f"Error processing fingerprint: {str(e)}"
        })


@router.get("/status")
def get_fingerprint_status():
    """Current fingerprint verification status return karo."""
    return JSONResponse({
        "verified": fp_state["verified"],
        "image_saved": fp_state["image_saved"],
        "message": fp_state["message"],
        "timestamp": fp_state["timestamp"],
    })


@router.post("/reset")
def reset_fingerprint():
    """Fingerprint state reset karo (naya attempt ke liye)."""
    fp_state["image_saved"] = False
    fp_state["verified"] = False
    fp_state["timestamp"] = None
    fp_state["message"] = "Fingerprint not captured yet"
    return JSONResponse({"ok": True, "message": "Fingerprint state reset."})
