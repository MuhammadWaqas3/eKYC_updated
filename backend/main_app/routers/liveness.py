import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
import face_recognition
import mediapipe as mp
import threading
import os
import io
import time
from PIL import Image

# ─── YE LINE IMPORTANT HAI — app nahi, router hai ────────────────────────────
router = APIRouter(prefix="/liveness", tags=["Face Liveness"])

os.makedirs("temp", exist_ok=True)

# ─── MediaPipe for Liveness (Blink Detection) ────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1, refine_landmarks=True,
    min_detection_confidence=0.5, min_tracking_confidence=0.5
)
LEFT_EYE  = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
EAR_THRESHOLD = 0.21

# ─── Global State ─────────────────────────────────────────────────────────────
state = {
    "ref_embedding":  None,
    "live_embedding": None,
    "match":          None,
    "confidence":     0,
    "message":        "Upload a face image to begin",
    "webcam_active":  False,
    "liveness":       None,
    "blink_count":    0,
}
lock = threading.Lock()
blink_state = {"eye_closed": False, "count": 0, "frames_closed": 0}

# ─── Camera Global Instance ───────────────────────────────────────────────────
camera_lock = threading.Lock()
_cap = None

def get_camera():
    global _cap
    with camera_lock:
        if _cap is None or not _cap.isOpened():
            for idx in [0, 1]:
                cap = cv2.VideoCapture(idx)
                time.sleep(0.3)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    cap.set(cv2.CAP_PROP_FPS, 30)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    _cap = cap
                    print(f"[CAM] Opened index {idx}")
                    break
    return _cap

def release_camera():
    global _cap
    with camera_lock:
        if _cap is not None:
            _cap.release()
            _cap = None

get_camera()  # open at startup

# ─── Face Recognition Helpers ─────────────────────────────────────────────────
def extract_face_embedding(img_bgr):
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb, model="hog")
    if not locations:
        return None, None
    encodings = face_recognition.face_encodings(rgb, locations)
    if not encodings:
        return None, None
    return encodings[0], locations[0]

def compare_embeddings(ref_enc, live_enc, threshold=0.45):
    dist = face_recognition.face_distance([ref_enc], live_enc)[0]
    confidence = max(0, int((1 - dist / 0.6) * 100))
    is_match = dist < threshold
    return is_match, confidence, dist

# ─── Liveness: Blink Detection ────────────────────────────────────────────────
def eye_aspect_ratio(landmarks, eye_indices, w, h):
    pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in eye_indices]
    A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (A + B) / (2.0 * C + 1e-6)

def check_blink(landmarks, w, h):
    left  = eye_aspect_ratio(landmarks, LEFT_EYE,  w, h)
    right = eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)
    avg   = (left + right) / 2.0
    if avg < EAR_THRESHOLD:
        blink_state["frames_closed"] += 1
        if blink_state["frames_closed"] >= 2:
            blink_state["eye_closed"] = True
    else:
        if blink_state["eye_closed"]:
            blink_state["count"] += 1
        blink_state["eye_closed"]     = False
        blink_state["frames_closed"]  = 0
    return blink_state["count"]

# ─── Frame Generator ──────────────────────────────────────────────────────────
def generate_frames():
    RECOGNITION_EVERY = 15
    LIVENESS_EVERY    = 2
    BLINKS_NEEDED     = 2
    MATCH_THRESHOLD   = 0.45

    frame_count    = 0
    no_frame_count = 0
    cached_match   = None
    cached_conf    = 0
    cached_dist    = 1.0
    cached_face_loc= None

    while True:
        with lock:
            active = state["webcam_active"]

        if not active:
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "Press [START WEBCAM]", (100, 230),
                        cv2.FONT_HERSHEY_DUPLEX, 0.9, (50, 70, 130), 2)
            _, buf = cv2.imencode(".jpg", blank)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                   + buf.tobytes() + b"\r\n")
            time.sleep(0.05)
            continue

        cap = get_camera()
        if cap is None or not cap.isOpened():
            time.sleep(0.2)
            continue

        ok, frame = cap.read()
        if not ok:
            no_frame_count += 1
            if no_frame_count > 10:
                release_camera(); time.sleep(0.5); get_camera()
                no_frame_count = 0
            time.sleep(0.05)
            continue

        no_frame_count = 0
        frame = cv2.flip(frame, 1)
        h, w  = frame.shape[:2]

        with lock:
            ref_emb = state["ref_embedding"]

        if ref_emb is not None and frame_count % RECOGNITION_EVERY == 0:
            live_emb, face_loc = extract_face_embedding(frame)
            if live_emb is not None:
                is_match, conf, dist = compare_embeddings(ref_emb, live_emb, MATCH_THRESHOLD)
                cached_match    = is_match
                cached_conf     = conf
                cached_dist     = dist
                cached_face_loc = face_loc
                with lock:
                    state["match"]          = is_match
                    state["confidence"]     = conf
                    state["live_embedding"] = live_emb.tolist()
            else:
                cached_match = None; cached_face_loc = None
                with lock:
                    state["match"]   = None
                    state["message"] = "Show your face clearly"

        if frame_count % LIVENESS_EVERY == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = face_mesh.process(rgb)
            if res.multi_face_landmarks:
                lm     = res.multi_face_landmarks[0].landmark
                blinks = check_blink(lm, w, h)
                with lock:
                    state["liveness"]    = "LIVE" if blinks >= BLINKS_NEEDED else "SPOOF"
                    state["blink_count"] = blinks

        with lock:
            match    = state["match"]
            conf     = state["confidence"]
            liveness = state["liveness"]
            blinks   = state["blink_count"]

        with lock:
            if match is True and liveness == "LIVE":
                state["message"] = "VERIFIED — LIVE PERSON"
            elif match is True:
                state["message"] = f"MATCHED — Blink to confirm ({blinks}/{BLINKS_NEEDED})"
            elif match is False:
                state["message"] = f"NOT MATCHED (dist: {cached_dist:.2f})"
            elif ref_emb is not None:
                state["message"] = "Show your face to camera"

        if cached_face_loc:
            top, right, bottom, left = cached_face_loc
            box_color = (0, 220, 80) if match else (40, 40, 200)
            cv2.rectangle(frame, (left, top), (right, bottom), box_color, 2)
            label = f"{'MATCH' if match else 'NO MATCH'} {conf}%"
            cv2.putText(frame, label, (left, top - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)

        cv2.rectangle(frame, (0, 0), (w, 56), (8, 8, 14), -1)

        if match is True and liveness == "LIVE":
            bar_color = (0, 220, 80);   icon = "[+] VERIFIED + LIVE"
        elif match is True:
            bar_color = (0, 180, 255);  icon = f"[~] MATCHED — BLINK! ({blinks}/{BLINKS_NEEDED})"
        elif match is False:
            bar_color = (40, 40, 200);  icon = "[x] NOT MATCHED"
        else:
            bar_color = (70, 70, 110);  icon = "[o] SCANNING..."

        cv2.putText(frame, icon, (12, 38), cv2.FONT_HERSHEY_DUPLEX, 0.78, bar_color, 2)
        if conf > 0:
            cv2.putText(frame, f"{conf}%", (w-70, 38), cv2.FONT_HERSHEY_DUPLEX, 0.78, bar_color, 2)

        bar_w = int((conf / 100) * (w - 40))
        cv2.rectangle(frame, (20, h-13), (w-20, h-5), (25, 25, 35), -1)
        if conf > 0:
            fill = (0, 220, 80) if (match and liveness == "LIVE") else (0, 140, 220)
            cv2.rectangle(frame, (20, h-13), (20 + bar_w, h-5), fill, -1)

        blink_col = (0, 220, 80) if blinks >= BLINKS_NEEDED else (100, 100, 160)
        cv2.putText(frame, f"BLINKS:{blinks}/{BLINKS_NEEDED}", (12, h-20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, blink_col, 2)

        frame_count += 1
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")

# ─── API Routes ───────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_face(file: UploadFile = File(...)):
    contents = await file.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    img_np = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    embedding, loc = extract_face_embedding(img_np)
    if embedding is None:
        return JSONResponse({"ok": False, "message": "No face found! Use a clear front-facing photo."})

    with lock:
        state["ref_embedding"]  = embedding
        state["live_embedding"] = None
        state["match"]          = None
        state["liveness"]       = None
        state["message"]        = "Face saved! Start webcam to verify."

    blink_state["count"] = blink_state["frames_closed"] = 0
    blink_state["eye_closed"] = False

    return JSONResponse({"ok": True, "message": "128-D face embedding saved! Now start webcam."})


@router.post("/start_webcam")
def start_webcam():
    blink_state["count"] = blink_state["frames_closed"] = 0
    blink_state["eye_closed"] = False
    with lock:
        state["webcam_active"]  = True
        state["match"]          = None
        state["live_embedding"] = None
        state["liveness"]       = None
        state["blink_count"]    = 0
    return JSONResponse({"ok": True})


@router.post("/stop_webcam")
def stop_webcam():
    with lock:
        state["webcam_active"] = False
        state["match"]         = None
        state["liveness"]      = None
    return JSONResponse({"ok": True})


@router.get("/video_feed")
def video_feed():
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.get("/status")
def get_status():
    with lock:
        return JSONResponse({
            "match":       state["match"],
            "confidence":  state["confidence"],
            "message":     state["message"],
            "liveness":    state["liveness"],
            "blink_count": state["blink_count"],
        })

# ─── NOTE: Koi if __name__ == "__main__" nahi hai — main.py handle karega ─────