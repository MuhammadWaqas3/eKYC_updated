

# # """
# # Face Verification + Liveness Router
# # - CNIC photo se reference embedding
# # - Live camera se face embedding
# # - Liveness: blink + head turn (left/right)
# # - Dono embeddings compare
# # - Real-time video feed with overlays
# # - Detailed terminal logging for debugging
# # """

# # import cv2
# # import numpy as np
# # from fastapi import APIRouter, UploadFile, File
# # from fastapi.responses import StreamingResponse, JSONResponse
# # import face_recognition
# # import mediapipe as mp
# # import threading
# # import os
# # import io
# # import time
# # from PIL import Image

# # router = APIRouter(prefix="/liveness", tags=["Face Liveness"])

# # os.makedirs("temp", exist_ok=True)

# # # ═══════════════════════════════════════════
# # #  MediaPipe Setup
# # # ═══════════════════════════════════════════
# # mp_face_mesh = mp.solutions.face_mesh
# # face_mesh = mp_face_mesh.FaceMesh(
# #     max_num_faces=1, refine_landmarks=True,
# #     min_detection_confidence=0.5, min_tracking_confidence=0.5
# # )

# # # Eye landmark indices
# # LEFT_EYE  = [33, 160, 158, 133, 153, 144]
# # RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# # # Nose tip + left/right ear for head pose
# # NOSE_TIP   = 1
# # LEFT_EAR   = 234
# # RIGHT_EAR  = 454
# # CHIN       = 152
# # FOREHEAD   = 10

# # # ── BLINK CONFIG ──────────────────────────────────────────────────────────────
# # # Lower threshold = easier to detect blink
# # # Higher frames_needed = need to hold closed longer = more reliable
# # EAR_THRESHOLD      = 0.18   # was 0.21 — lowered for better sensitivity
# # FRAMES_CLOSED_MIN  = 1      # was 2 — reduced so quick blinks register
# # FRAMES_OPEN_MIN    = 2      # min frames open before next blink counts (debounce)
# # BLINKS_NEEDED      = 2

# # TURN_THRESHOLD  = 0.20
# # MATCH_THRESHOLD = 0.45

# # # ═══════════════════════════════════════════
# # #  Global State
# # # ═══════════════════════════════════════════
# # state = {
# #     "ref_embedding":    None,
# #     "live_embedding":   None,
# #     "match":            None,
# #     "confidence":       0,
# #     "message":          "Upload CNIC image to begin",
# #     "webcam_active":    False,
# #     "liveness":         None,
# #     "blink_count":      0,
# #     "looked_left":      False,
# #     "looked_right":     False,
# #     "liveness_stage":   "idle",
# #     "liveness_progress": 0,
# # }
# # lock = threading.Lock()

# # blink_state = {
# #     "eye_closed":      False,
# #     "count":           0,
# #     "frames_closed":   0,
# #     "frames_open":     0,
# #     "last_ear":        0.0,
# # }
# # head_state = {
# #     "nose_history":  [],
# #     "looked_left":   False,
# #     "looked_right":  False,
# # }

# # # ═══════════════════════════════════════════
# # #  Camera
# # # ═══════════════════════════════════════════
# # camera_lock = threading.Lock()
# # _cap = None

# # def get_camera():
# #     global _cap
# #     with camera_lock:
# #         if _cap is None or not _cap.isOpened():
# #             for idx in [0, 1]:
# #                 cap = cv2.VideoCapture(idx)
# #                 time.sleep(0.3)
# #                 if cap.isOpened():
# #                     cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
# #                     cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
# #                     cap.set(cv2.CAP_PROP_FPS, 30)
# #                     cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
# #                     _cap = cap
# #                     print(f"[CAM] ✓ Camera opened at index {idx}")
# #                     break
# #     return _cap

# # def release_camera():
# #     global _cap
# #     with camera_lock:
# #         if _cap is not None:
# #             _cap.release()
# #             _cap = None
# #             print("[CAM] Camera released.")

# # # ═══════════════════════════════════════════
# # #  Face Recognition Helpers
# # # ═══════════════════════════════════════════
# # def extract_face_embedding(img_bgr, source_label="unknown"):
# #     """
# #     Extract 128-D face embedding from BGR image.
# #     source_label: used for terminal logging ("CNIC" or "LIVE_FRAME_#N")
# #     """
# #     rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
# #     locs = face_recognition.face_locations(rgb, model="hog")

# #     if not locs:
# #         print(f"[EMBED] [{source_label}] ✗ No face detected in image.")
# #         return None, None

# #     print(f"[EMBED] [{source_label}] ✓ {len(locs)} face(s) found → using first face")
# #     top, right, bottom, left = locs[0]
# #     face_w = right - left
# #     face_h = bottom - top
# #     print(f"[EMBED] [{source_label}]   Face bounding box → top:{top} right:{right} bottom:{bottom} left:{left}")
# #     print(f"[EMBED] [{source_label}]   Face size          → {face_w}×{face_h} px")

# #     encs = face_recognition.face_encodings(rgb, locs)
# #     if not encs:
# #         print(f"[EMBED] [{source_label}] ✗ Could not compute encoding.")
# #         return None, None

# #     embedding = encs[0]
# #     print(f"[EMBED] [{source_label}]   Embedding shape    → {embedding.shape}  (128-dimensional vector)")
# #     print(f"[EMBED] [{source_label}]   Embedding preview  → [{', '.join(f'{v:.4f}' for v in embedding[:8])} ...]")
# #     norm = float(np.linalg.norm(embedding))
# #     print(f"[EMBED] [{source_label}]   Embedding L2 norm  → {norm:.6f}")

# #     return embedding, locs[0]


# # def compare_embeddings(ref_enc, live_enc, frame_label="LIVE"):
# #     """
# #     Compare reference (CNIC) embedding vs live face embedding.
# #     Prints full breakdown to terminal.
# #     """
# #     dist = face_recognition.face_distance([ref_enc], live_enc)[0]
# #     confidence = max(0, int((1 - dist / 0.6) * 100))
# #     is_match   = dist < MATCH_THRESHOLD

# #     print(f"\n[MATCH] ── Face Comparison ({frame_label}) ──────────────────")
# #     print(f"[MATCH]   Euclidean distance   → {dist:.6f}  (threshold: {MATCH_THRESHOLD})")
# #     print(f"[MATCH]   Confidence score     → {confidence}%  (formula: max(0, (1 - dist/0.6) × 100))")
# #     print(f"[MATCH]   Result               → {'✅ MATCHED' if is_match else '❌ NOT MATCHED'}")

# #     # Dot product similarity (cosine-like, both norms ~1 for face_recognition)
# #     dot = float(np.dot(ref_enc, live_enc))
# #     print(f"[MATCH]   Dot product          → {dot:.6f}")
# #     print(f"[MATCH] ─────────────────────────────────────────────────────\n")

# #     return is_match, confidence, dist


# # # ═══════════════════════════════════════════
# # #  Liveness Helpers
# # # ═══════════════════════════════════════════
# # def eye_aspect_ratio(landmarks, eye_indices, w, h):
# #     pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices]
# #     # Vertical distances
# #     A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
# #     B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
# #     # Horizontal distance
# #     C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
# #     ear = (A + B) / (2.0 * C + 1e-6)
# #     return ear


# # def check_blink(landmarks, w, h):
# #     """
# #     Improved blink detection with proper state machine and terminal logging.
# #     Returns current blink count.
# #     """
# #     left_ear  = eye_aspect_ratio(landmarks, LEFT_EYE,  w, h)
# #     right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)
# #     avg_ear   = (left_ear + right_ear) / 2.0

# #     bs = blink_state
# #     prev_count = bs["count"]

# #     if avg_ear < EAR_THRESHOLD:
# #         # Eyes are closing / closed
# #         bs["frames_closed"] += 1
# #         bs["frames_open"]    = 0

# #         if bs["frames_closed"] == FRAMES_CLOSED_MIN:
# #             # Just transitioned to "closed" state
# #             bs["eye_closed"] = True
# #             print(f"[BLINK] 👁️  Eyes CLOSED   EAR={avg_ear:.4f} (L:{left_ear:.4f} R:{right_ear:.4f})  frames_closed={bs['frames_closed']}")

# #     else:
# #         # Eyes are open
# #         if bs["eye_closed"]:
# #             # Eyes just opened — this is the end of a blink
# #             bs["frames_open"] += 1
# #             if bs["frames_open"] >= FRAMES_OPEN_MIN:
# #                 bs["count"]      += 1
# #                 bs["eye_closed"]  = False
# #                 bs["frames_closed"] = 0
# #                 bs["frames_open"]   = 0
# #                 print(f"[BLINK] ✅ BLINK DETECTED!  EAR={avg_ear:.4f}  Total blinks = {bs['count']}/{BLINKS_NEEDED}")
# #                 if bs["count"] >= BLINKS_NEEDED:
# #                     print(f"[BLINK] 🎉 Blink requirement met ({BLINKS_NEEDED} blinks)!")
# #         else:
# #             bs["frames_closed"] = 0
# #             bs["frames_open"]   = 0

# #     bs["last_ear"] = avg_ear
# #     return bs["count"]


# # def check_head_turn(landmarks, w, h):
# #     """Detect head turn left/right using nose-to-ear ratio."""
# #     nose_x  = landmarks[NOSE_TIP].x
# #     left_x  = landmarks[LEFT_EAR].x
# #     right_x = landmarks[RIGHT_EAR].x

# #     face_width = abs(right_x - left_x) + 1e-6
# #     norm_pos = (nose_x - left_x) / face_width

# #     hs = head_state
# #     if norm_pos < (0.5 - TURN_THRESHOLD) and not hs["looked_right"]:
# #         hs["looked_right"] = True
# #         print(f"[HEAD]  ➡️  Head turned RIGHT  norm_pos={norm_pos:.3f}")
# #     if norm_pos > (0.5 + TURN_THRESHOLD) and not hs["looked_left"]:
# #         hs["looked_left"] = True
# #         print(f"[HEAD]  ⬅️  Head turned LEFT   norm_pos={norm_pos:.3f}")

# #     return hs["looked_left"], hs["looked_right"]


# # def compute_liveness_progress(blinks, looked_left, looked_right):
# #     total = 3
# #     done  = 0
# #     if looked_right: done += 1
# #     if looked_left:  done += 1
# #     if blinks >= BLINKS_NEEDED: done += 1

# #     if not looked_right:
# #         stage = "look_right"
# #     elif not looked_left:
# #         stage = "look_left"
# #     elif blinks < BLINKS_NEEDED:
# #         stage = "blink"
# #     else:
# #         stage = "done"

# #     return int((done / total) * 100), stage


# # # ═══════════════════════════════════════════
# # #  Draw Helpers
# # # ═══════════════════════════════════════════
# # def draw_face_box(frame, face_loc, match, conf):
# #     if face_loc is None:
# #         return
# #     top, right, bottom, left = face_loc
# #     if match is True:
# #         color = (0, 220, 80)
# #     elif match is False:
# #         color = (40, 40, 200)
# #     else:
# #         color = (180, 180, 180)

# #     cv2.rectangle(frame, (left, top), (right, bottom), color, 3)

# #     size = 18; lw = 4
# #     for (cx, cy, dx1, dy1, dx2, dy2) in [
# #         (left,  top,    size, 0, 0,     size),
# #         (right, top,   -size, 0, 0,     size),
# #         (left,  bottom, size, 0, 0,    -size),
# #         (right, bottom,-size, 0, 0,    -size),
# #     ]:
# #         cv2.line(frame, (cx, cy), (cx + dx1, cy + dy1), color, lw)
# #         cv2.line(frame, (cx, cy), (cx + dx2, cy + dy2), color, lw)

# #     label = f"{'MATCH' if match else 'NO MATCH'} {conf}%"
# #     (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
# #     cv2.rectangle(frame, (left, top - th - 10), (left + tw + 10, top), color, -1)
# #     cv2.putText(frame, label, (left + 5, top - 5),
# #                 cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)


# # def draw_hud(frame, match, conf, liveness, blinks, stage, progress, looked_left, looked_right):
# #     h, w = frame.shape[:2]

# #     cv2.rectangle(frame, (0, 0), (w, 60), (8, 8, 14), -1)

# #     if match is True and liveness == "LIVE":
# #         bar_color = (0, 220, 80)
# #         icon_text = "VERIFIED + LIVE"
# #     elif match is True:
# #         bar_color = (0, 180, 255)
# #         icon_text = f"MATCHED — Complete liveness"
# #     elif match is False:
# #         bar_color = (60, 60, 220)
# #         icon_text = "FACE NOT MATCHED"
# #     else:
# #         bar_color = (100, 100, 140)
# #         icon_text = "SCANNING..."

# #     cv2.putText(frame, icon_text, (14, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)
# #     if conf > 0:
# #         cv2.putText(frame, f"{conf}%", (w - 70, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)

# #     cv2.rectangle(frame, (20, h - 15), (w - 20, h - 5), (25, 25, 35), -1)
# #     if conf > 0:
# #         bar_w = int((conf / 100) * (w - 40))
# #         fill  = (0, 220, 80) if (match and liveness == "LIVE") else (0, 140, 220)
# #         cv2.rectangle(frame, (20, h - 15), (20 + bar_w, h - 5), fill, -1)
# #         cv2.putText(frame, f"{conf}%", (w // 2 - 15, h - 18),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

# #     checks = [
# #         ("Turn Right", looked_right),
# #         ("Turn Left",  looked_left),
# #         (f"Blink x{BLINKS_NEEDED}", blinks >= BLINKS_NEEDED),
# #     ]
# #     y_start = h - 95
# #     for label, done in checks:
# #         color = (0, 220, 80) if done else (140, 140, 160)
# #         mark  = "[OK]" if done else "[ ]"
# #         cv2.putText(frame, f"{mark} {label}", (14, y_start),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1)
# #         y_start += 22

# #     bar_x, bar_y = w - 130, h - 95
# #     cv2.rectangle(frame, (bar_x, bar_y), (bar_x + 110, bar_y + 12), (30, 30, 40), -1)
# #     prog_w = int((progress / 100) * 110)
# #     prog_col = (0, 220, 80) if progress == 100 else (0, 180, 255)
# #     cv2.rectangle(frame, (bar_x, bar_y), (bar_x + prog_w, bar_y + 12), prog_col, -1)
# #     cv2.putText(frame, f"Liveness {progress}%", (bar_x, bar_y - 5),
# #                 cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)

# #     stage_msgs = {
# #         "look_right": ">> Turn your head RIGHT",
# #         "look_left":  "<< Turn your head LEFT",
# #         "blink":      "^^ Now BLINK your eyes",
# #         "done":       "LIVENESS COMPLETE!",
# #         "idle":       "Waiting...",
# #     }
# #     msg = stage_msgs.get(stage, "")
# #     if msg:
# #         (tw, th), _ = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
# #         cx = (w - tw) // 2
# #         cv2.rectangle(frame, (cx - 8, 65), (cx + tw + 8, 65 + th + 10), (0, 0, 0), -1)
# #         cv2.putText(frame, msg, (cx, 65 + th + 2),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 220, 200), 2)

# #     # Live EAR debug overlay (bottom right, small text)
# #     ear_val = blink_state.get("last_ear", 0.0)
# #     ear_color = (0, 80, 255) if ear_val < EAR_THRESHOLD else (180, 180, 180)
# #     cv2.putText(frame, f"EAR:{ear_val:.3f} B:{blinks}", (w - 140, h - 22),
# #                 cv2.FONT_HERSHEY_SIMPLEX, 0.42, ear_color, 1)


# # # ═══════════════════════════════════════════
# # #  Frame Generator
# # # ═══════════════════════════════════════════
# # def generate_frames():
# #     RECOGNITION_EVERY  = 15   # run face recognition every N frames
# #     LIVENESS_EVERY     = 1    # run liveness every frame for responsive blink detection

# #     frame_count     = 0
# #     no_frame_count  = 0
# #     cached_match    = None
# #     cached_conf     = 0
# #     cached_face_loc = None
# #     live_frame_num  = 0       # for logging

# #     print("\n[STREAM] ═══════════════ Video stream started ═══════════════")

# #     while True:
# #         with lock:
# #             active = state["webcam_active"]

# #         if not active:
# #             blank = np.zeros((480, 640, 3), dtype=np.uint8)
# #             cv2.putText(blank, "Webcam not active", (160, 240),
# #                         cv2.FONT_HERSHEY_DUPLEX, 0.8, (60, 60, 90), 2)
# #             _, buf = cv2.imencode(".jpg", blank)
# #             yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
# #                    + buf.tobytes() + b"\r\n")
# #             time.sleep(0.05)
# #             continue

# #         cap = get_camera()
# #         if cap is None or not cap.isOpened():
# #             time.sleep(0.2)
# #             continue

# #         ok, frame = cap.read()
# #         if not ok:
# #             no_frame_count += 1
# #             if no_frame_count > 10:
# #                 release_camera(); time.sleep(0.5); get_camera()
# #                 no_frame_count = 0
# #             time.sleep(0.05)
# #             continue

# #         no_frame_count = 0
# #         frame = cv2.flip(frame, 1)
# #         h, w  = frame.shape[:2]

# #         with lock:
# #             ref_emb = state["ref_embedding"]

# #         # ── Face Recognition every N frames ────────────────────────────
# #         if ref_emb is not None and frame_count % RECOGNITION_EVERY == 0:
# #             live_frame_num += 1
# #             frame_label = f"LIVE_FRAME_{live_frame_num}"

# #             print(f"\n[RECOG] ── Running face recognition on {frame_label} ──")
# #             live_emb, face_loc = extract_face_embedding(frame, source_label=frame_label)

# #             if live_emb is not None:
# #                 is_match, conf, dist = compare_embeddings(ref_emb, live_emb, frame_label=frame_label)
# #                 cached_match    = is_match
# #                 cached_conf     = conf
# #                 cached_face_loc = face_loc
# #                 with lock:
# #                     state["match"]          = is_match
# #                     state["confidence"]     = conf
# #                     state["live_embedding"] = live_emb.tolist()
# #             else:
# #                 cached_match = None; cached_face_loc = None
# #                 with lock:
# #                     state["match"]   = None
# #                     state["message"] = "Show your face clearly"

# #         # ── Liveness every frame (for responsive blink) ────────────────
# #         if frame_count % LIVENESS_EVERY == 0:
# #             rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
# #             res = face_mesh.process(rgb)
# #             if res.multi_face_landmarks:
# #                 lm     = res.multi_face_landmarks[0].landmark
# #                 blinks = check_blink(lm, w, h)
# #                 looked_left, looked_right = check_head_turn(lm, w, h)
# #                 progress, stage = compute_liveness_progress(blinks, looked_left, looked_right)
# #                 live_done = (stage == "done")
# #                 with lock:
# #                     state["liveness"]          = "LIVE" if live_done else "SPOOF"
# #                     state["blink_count"]       = blinks
# #                     state["looked_left"]       = looked_left
# #                     state["looked_right"]      = looked_right
# #                     state["liveness_stage"]    = stage
# #                     state["liveness_progress"] = progress
# #                     if live_done and state["match"]:
# #                         state["message"] = "VERIFIED — LIVE PERSON"
# #                         print("\n[✅ FINAL] ════════════════════════════════════")
# #                         print("[✅ FINAL]  PERSON VERIFIED AS LIVE + MATCHED!")
# #                         print("[✅ FINAL] ════════════════════════════════════\n")

# #         # ── Read state for drawing ─────────────────────────────────────
# #         with lock:
# #             match    = state["match"]
# #             conf     = state["confidence"]
# #             liveness = state["liveness"]
# #             blinks   = state["blink_count"]
# #             stage    = state["liveness_stage"]
# #             progress = state["liveness_progress"]
# #             l_left   = state["looked_left"]
# #             l_right  = state["looked_right"]

# #         draw_face_box(frame, cached_face_loc, cached_match, cached_conf)
# #         draw_hud(frame, match, conf, liveness, blinks, stage, progress, l_left, l_right)

# #         frame_count += 1
# #         _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
# #         yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
# #                + buf.tobytes() + b"\r\n")


# # # ═══════════════════════════════════════════
# # #  API Routes
# # # ═══════════════════════════════════════════

# # @router.post("/upload")
# # async def upload_face(file: UploadFile = File(...)):
# #     """CNIC photo se reference embedding extract karo aur save karo."""
# #     contents = await file.read()
# #     img      = Image.open(io.BytesIO(contents)).convert("RGB")
# #     img_np   = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

# #     print("\n[UPLOAD] ══════════════════════════════════════════════════════")
# #     print(f"[UPLOAD] CNIC image received  → size: {img_np.shape[1]}×{img_np.shape[0]} px")
# #     print(f"[UPLOAD] File: {file.filename}  Content-Type: {file.content_type}")

# #     embedding, loc = extract_face_embedding(img_np, source_label="CNIC_REFERENCE")

# #     if embedding is None:
# #         print("[UPLOAD] ✗ FAILED — No face found in CNIC image.")
# #         print("[UPLOAD] ══════════════════════════════════════════════════════\n")
# #         return JSONResponse({
# #             "ok": False,
# #             "message": "No face found in CNIC image. Use a clear front-facing photo."
# #         })

# #     print(f"[UPLOAD] ✓ Reference embedding saved successfully!")
# #     print(f"[UPLOAD]   This will be compared against every live frame.")
# #     print("[UPLOAD] ══════════════════════════════════════════════════════\n")

# #     with lock:
# #         state["ref_embedding"]     = embedding
# #         state["live_embedding"]    = None
# #         state["match"]             = None
# #         state["liveness"]          = None
# #         state["liveness_stage"]    = "idle"
# #         state["liveness_progress"] = 0
# #         state["blink_count"]       = 0
# #         state["looked_left"]       = False
# #         state["looked_right"]      = False
# #         state["message"]           = "CNIC face saved. Start camera to verify."

# #     blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
# #                          "frames_open": 0, "last_ear": 0.0})
# #     head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

# #     return JSONResponse({
# #         "ok": True,
# #         "message": "Reference face embedding saved from CNIC!"
# #     })


# # @router.post("/start_webcam")
# # def start_webcam():
# #     """Start live camera for verification."""
# #     blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
# #                          "frames_open": 0, "last_ear": 0.0})
# #     head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

# #     with lock:
# #         state["webcam_active"]     = True
# #         state["match"]             = None
# #         state["live_embedding"]    = None
# #         state["liveness"]          = None
# #         state["liveness_stage"]    = "idle"
# #         state["liveness_progress"] = 0
# #         state["blink_count"]       = 0
# #         state["looked_left"]       = False
# #         state["looked_right"]      = False

# #     print("\n[WEBCAM] ✓ Webcam started — beginning liveness + face verification.")
# #     print(f"[WEBCAM]   EAR threshold: {EAR_THRESHOLD}  |  Blinks needed: {BLINKS_NEEDED}")
# #     print(f"[WEBCAM]   Match threshold: {MATCH_THRESHOLD}  |  Recognition every 15 frames\n")
# #     get_camera()
# #     return JSONResponse({"ok": True})


# # @router.post("/stop_webcam")
# # def stop_webcam():
# #     with lock:
# #         state["webcam_active"] = False
# #         state["match"]         = None
# #         state["liveness"]      = None
# #     release_camera()
# #     print("[WEBCAM] ✓ Webcam stopped.")
# #     return JSONResponse({"ok": True})


# # @router.get("/video_feed")
# # def video_feed():
# #     """MJPEG stream with real-time face box + HUD overlay."""
# #     return StreamingResponse(
# #         generate_frames(),
# #         media_type="multipart/x-mixed-replace; boundary=frame"
# #     )

# # @router.get("/status")
# # def get_status():
# #     with lock:
# #         match = state["match"]
# #         return JSONResponse({
# #             "match":             bool(match) if match is not None else None,
# #             "confidence":        int(state["confidence"]),
# #             "message":           str(state["message"]),
# #             "liveness":          str(state["liveness"]) if state["liveness"] is not None else None,
# #             "liveness_stage":    str(state["liveness_stage"]),
# #             "liveness_progress": int(state["liveness_progress"]),
# #             "blink_count":       int(state["blink_count"]),
# #             "looked_left":       bool(state["looked_left"]),
# #             "looked_right":      bool(state["looked_right"]),
# #         })




# """
# Face Verification + Liveness Router
# - CNIC photo se reference embedding
# - Live camera se face embedding
# - Liveness: blink + head turn (left/right)
# - Dono embeddings compare
# - Real-time video feed with overlays
# - Detailed terminal logging for debugging
# """

# import cv2
# import numpy as np
# from fastapi import APIRouter, UploadFile, File, Depends
# from auth import verify_token
# from fastapi.responses import StreamingResponse, JSONResponse
# import face_recognition
# import mediapipe as mp
# import threading
# import os
# import io
# import time
# from PIL import Image

# router = APIRouter(prefix="/liveness", tags=["Face Liveness"])

# os.makedirs("temp", exist_ok=True)

# # ═══════════════════════════════════════════
# #  MediaPipe Setup
# # ═══════════════════════════════════════════
# mp_face_mesh = mp.solutions.face_mesh
# face_mesh = mp_face_mesh.FaceMesh(
#     max_num_faces=1, refine_landmarks=True,
#     min_detection_confidence=0.5, min_tracking_confidence=0.5
# )

# # Eye landmark indices
# LEFT_EYE  = [33, 160, 158, 133, 153, 144]
# RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# # Nose tip + left/right ear for head pose
# NOSE_TIP   = 1
# LEFT_EAR   = 234
# RIGHT_EAR  = 454
# CHIN       = 152
# FOREHEAD   = 10

# # ── BLINK CONFIG ──────────────────────────────────────────────────────────────
# # Lower threshold = easier to detect blink
# # Higher frames_needed = need to hold closed longer = more reliable
# EAR_THRESHOLD      = 0.18   # was 0.21 — lowered for better sensitivity
# FRAMES_CLOSED_MIN  = 1      # was 2 — reduced so quick blinks register
# FRAMES_OPEN_MIN    = 2      # min frames open before next blink counts (debounce)
# BLINKS_NEEDED      = 2

# TURN_THRESHOLD  = 0.20
# MATCH_THRESHOLD = 0.45

# # ═══════════════════════════════════════════
# #  Global State
# # ═══════════════════════════════════════════
# state = {
#     "ref_embedding":    None,
#     "live_embedding":   None,
#     "match":            None,
#     "confidence":       0,
#     "message":          "Upload CNIC image to begin",
#     "webcam_active":    False,
#     "liveness":         None,
#     "blink_count":      0,
#     "looked_left":      False,
#     "looked_right":     False,
#     "liveness_stage":   "idle",
#     "liveness_progress": 0,
# }
# lock = threading.Lock()

# blink_state = {
#     "eye_closed":      False,
#     "count":           0,
#     "frames_closed":   0,
#     "frames_open":     0,
#     "last_ear":        0.0,
# }
# head_state = {
#     "nose_history":  [],
#     "looked_left":   False,
#     "looked_right":  False,
# }

# # ═══════════════════════════════════════════
# #  Camera
# # ═══════════════════════════════════════════
# camera_lock = threading.Lock()
# _cap = None

# def get_camera():
#     global _cap
#     with camera_lock:
#         if _cap is None or not _cap.isOpened():
#             for idx in [0, 1]:
#                 cap = cv2.VideoCapture(idx)
#                 time.sleep(0.3)
#                 if cap.isOpened():
#                     cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
#                     cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
#                     cap.set(cv2.CAP_PROP_FPS, 30)
#                     cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
#                     _cap = cap
#                     print(f"[CAM] ✓ Camera opened at index {idx}")
#                     break
#     return _cap

# def release_camera():
#     global _cap
#     with camera_lock:
#         if _cap is not None:
#             _cap.release()
#             _cap = None
#             print("[CAM] Camera released.")

# # ═══════════════════════════════════════════
# #  Face Recognition Helpers
# # ═══════════════════════════════════════════
# def extract_face_embedding(img_bgr, source_label="unknown"):
#     """
#     Extract 128-D face embedding from BGR image.
#     source_label: used for terminal logging ("CNIC" or "LIVE_FRAME_#N")
#     """
#     rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
#     locs = face_recognition.face_locations(rgb, model="hog")

#     if not locs:
#         print(f"[EMBED] [{source_label}] ✗ No face detected in image.")
#         return None, None

#     print(f"[EMBED] [{source_label}] ✓ {len(locs)} face(s) found → using first face")
#     top, right, bottom, left = locs[0]
#     face_w = right - left
#     face_h = bottom - top
#     print(f"[EMBED] [{source_label}]   Face bounding box → top:{top} right:{right} bottom:{bottom} left:{left}")
#     print(f"[EMBED] [{source_label}]   Face size          → {face_w}×{face_h} px")

#     encs = face_recognition.face_encodings(rgb, locs)
#     if not encs:
#         print(f"[EMBED] [{source_label}] ✗ Could not compute encoding.")
#         return None, None

#     embedding = encs[0]
#     print(f"[EMBED] [{source_label}]   Embedding shape    → {embedding.shape}  (128-dimensional vector)")
#     print(f"[EMBED] [{source_label}]   Embedding preview  → [{', '.join(f'{v:.4f}' for v in embedding[:8])} ...]")
#     norm = float(np.linalg.norm(embedding))
#     print(f"[EMBED] [{source_label}]   Embedding L2 norm  → {norm:.6f}")

#     return embedding, locs[0]


# def compare_embeddings(ref_enc, live_enc, frame_label="LIVE"):
#     """
#     Compare reference (CNIC) embedding vs live face embedding.
#     Prints full breakdown to terminal.
#     """
#     dist = face_recognition.face_distance([ref_enc], live_enc)[0]
#     confidence = max(0, int((1 - dist / 0.6) * 100))
#     is_match   = dist < MATCH_THRESHOLD

#     print(f"\n[MATCH] ── Face Comparison ({frame_label}) ──────────────────")
#     print(f"[MATCH]   Euclidean distance   → {dist:.6f}  (threshold: {MATCH_THRESHOLD})")
#     print(f"[MATCH]   Confidence score     → {confidence}%  (formula: max(0, (1 - dist/0.6) × 100))")
#     print(f"[MATCH]   Result               → {'✅ MATCHED' if is_match else '❌ NOT MATCHED'}")

#     # Dot product similarity (cosine-like, both norms ~1 for face_recognition)
#     dot = float(np.dot(ref_enc, live_enc))
#     print(f"[MATCH]   Dot product          → {dot:.6f}")
#     print(f"[MATCH] ─────────────────────────────────────────────────────\n")

#     return is_match, confidence, dist


# # ═══════════════════════════════════════════
# #  Liveness Helpers
# # ═══════════════════════════════════════════
# def eye_aspect_ratio(landmarks, eye_indices, w, h):
#     pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices]
#     # Vertical distances
#     A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
#     B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
#     # Horizontal distance
#     C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
#     ear = (A + B) / (2.0 * C + 1e-6)
#     return ear


# def check_blink(landmarks, w, h):
#     """
#     Improved blink detection with proper state machine and terminal logging.
#     Returns current blink count.
#     """
#     left_ear  = eye_aspect_ratio(landmarks, LEFT_EYE,  w, h)
#     right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)
#     avg_ear   = (left_ear + right_ear) / 2.0

#     bs = blink_state
#     prev_count = bs["count"]

#     if avg_ear < EAR_THRESHOLD:
#         # Eyes are closing / closed
#         bs["frames_closed"] += 1
#         bs["frames_open"]    = 0

#         if bs["frames_closed"] == FRAMES_CLOSED_MIN:
#             # Just transitioned to "closed" state
#             bs["eye_closed"] = True
#             print(f"[BLINK] 👁️  Eyes CLOSED   EAR={avg_ear:.4f} (L:{left_ear:.4f} R:{right_ear:.4f})  frames_closed={bs['frames_closed']}")

#     else:
#         # Eyes are open
#         if bs["eye_closed"]:
#             # Eyes just opened — this is the end of a blink
#             bs["frames_open"] += 1
#             if bs["frames_open"] >= FRAMES_OPEN_MIN:
#                 bs["count"]      += 1
#                 bs["eye_closed"]  = False
#                 bs["frames_closed"] = 0
#                 bs["frames_open"]   = 0
#                 print(f"[BLINK] ✅ BLINK DETECTED!  EAR={avg_ear:.4f}  Total blinks = {bs['count']}/{BLINKS_NEEDED}")
#                 if bs["count"] >= BLINKS_NEEDED:
#                     print(f"[BLINK] 🎉 Blink requirement met ({BLINKS_NEEDED} blinks)!")
#         else:
#             bs["frames_closed"] = 0
#             bs["frames_open"]   = 0

#     bs["last_ear"] = avg_ear
#     return bs["count"]


# def check_head_turn(landmarks, w, h):
#     """Detect head turn left/right using nose-to-ear ratio."""
#     nose_x  = landmarks[NOSE_TIP].x
#     left_x  = landmarks[LEFT_EAR].x
#     right_x = landmarks[RIGHT_EAR].x

#     face_width = abs(right_x - left_x) + 1e-6
#     norm_pos = (nose_x - left_x) / face_width

#     hs = head_state
#     if norm_pos < (0.5 - TURN_THRESHOLD) and not hs["looked_right"]:
#         hs["looked_right"] = True
#         print(f"[HEAD]  ➡️  Head turned RIGHT  norm_pos={norm_pos:.3f}")
#     if norm_pos > (0.5 + TURN_THRESHOLD) and not hs["looked_left"]:
#         hs["looked_left"] = True
#         print(f"[HEAD]  ⬅️  Head turned LEFT   norm_pos={norm_pos:.3f}")

#     return hs["looked_left"], hs["looked_right"]


# def compute_liveness_progress(blinks, looked_left, looked_right):
#     total = 3
#     done  = 0
#     if looked_right: done += 1
#     if looked_left:  done += 1
#     if blinks >= BLINKS_NEEDED: done += 1

#     if not looked_right:
#         stage = "look_right"
#     elif not looked_left:
#         stage = "look_left"
#     elif blinks < BLINKS_NEEDED:
#         stage = "blink"
#     else:
#         stage = "done"

#     return int((done / total) * 100), stage


# # ═══════════════════════════════════════════
# #  Draw Helpers
# # ═══════════════════════════════════════════
# def draw_face_box(frame, face_loc, match, conf):
#     if face_loc is None:
#         return
#     top, right, bottom, left = face_loc
#     if match is True:
#         color = (0, 220, 80)
#     elif match is False:
#         color = (40, 40, 200)
#     else:
#         color = (180, 180, 180)

#     cv2.rectangle(frame, (left, top), (right, bottom), color, 3)

#     size = 18; lw = 4
#     for (cx, cy, dx1, dy1, dx2, dy2) in [
#         (left,  top,    size, 0, 0,     size),
#         (right, top,   -size, 0, 0,     size),
#         (left,  bottom, size, 0, 0,    -size),
#         (right, bottom,-size, 0, 0,    -size),
#     ]:
#         cv2.line(frame, (cx, cy), (cx + dx1, cy + dy1), color, lw)
#         cv2.line(frame, (cx, cy), (cx + dx2, cy + dy2), color, lw)

#     label = f"{'MATCH' if match else 'NO MATCH'} {conf}%"
#     (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
#     cv2.rectangle(frame, (left, top - th - 10), (left + tw + 10, top), color, -1)
#     cv2.putText(frame, label, (left + 5, top - 5),
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)


# def draw_hud(frame, match, conf, liveness, blinks, stage, progress, looked_left, looked_right):
#     h, w = frame.shape[:2]

#     cv2.rectangle(frame, (0, 0), (w, 60), (8, 8, 14), -1)

#     if match is True and liveness == "LIVE":
#         bar_color = (0, 220, 80)
#         icon_text = "VERIFIED + LIVE"
#     elif match is True:
#         bar_color = (0, 180, 255)
#         icon_text = f"MATCHED — Complete liveness"
#     elif match is False:
#         bar_color = (60, 60, 220)
#         icon_text = "FACE NOT MATCHED"
#     else:
#         bar_color = (100, 100, 140)
#         icon_text = "SCANNING..."

#     cv2.putText(frame, icon_text, (14, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)
#     if conf > 0:
#         cv2.putText(frame, f"{conf}%", (w - 70, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)

#     cv2.rectangle(frame, (20, h - 15), (w - 20, h - 5), (25, 25, 35), -1)
#     if conf > 0:
#         bar_w = int((conf / 100) * (w - 40))
#         fill  = (0, 220, 80) if (match and liveness == "LIVE") else (0, 140, 220)
#         cv2.rectangle(frame, (20, h - 15), (20 + bar_w, h - 5), fill, -1)
#         cv2.putText(frame, f"{conf}%", (w // 2 - 15, h - 18),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

#     checks = [
#         ("Turn Right", looked_right),
#         ("Turn Left",  looked_left),
#         (f"Blink x{BLINKS_NEEDED}", blinks >= BLINKS_NEEDED),
#     ]
#     y_start = h - 95
#     for label, done in checks:
#         color = (0, 220, 80) if done else (140, 140, 160)
#         mark  = "[OK]" if done else "[ ]"
#         cv2.putText(frame, f"{mark} {label}", (14, y_start),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1)
#         y_start += 22

#     bar_x, bar_y = w - 130, h - 95
#     cv2.rectangle(frame, (bar_x, bar_y), (bar_x + 110, bar_y + 12), (30, 30, 40), -1)
#     prog_w = int((progress / 100) * 110)
#     prog_col = (0, 220, 80) if progress == 100 else (0, 180, 255)
#     cv2.rectangle(frame, (bar_x, bar_y), (bar_x + prog_w, bar_y + 12), prog_col, -1)
#     cv2.putText(frame, f"Liveness {progress}%", (bar_x, bar_y - 5),
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)

#     stage_msgs = {
#         "look_right": ">> Turn your head RIGHT",
#         "look_left":  "<< Turn your head LEFT",
#         "blink":      "^^ Now BLINK your eyes",
#         "done":       "LIVENESS COMPLETE!",
#         "idle":       "Waiting...",
#     }
#     msg = stage_msgs.get(stage, "")
#     if msg:
#         (tw, th), _ = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
#         cx = (w - tw) // 2
#         cv2.rectangle(frame, (cx - 8, 65), (cx + tw + 8, 65 + th + 10), (0, 0, 0), -1)
#         cv2.putText(frame, msg, (cx, 65 + th + 2),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 220, 200), 2)

#     # Live EAR debug overlay (bottom right, small text)
#     ear_val = blink_state.get("last_ear", 0.0)
#     ear_color = (0, 80, 255) if ear_val < EAR_THRESHOLD else (180, 180, 180)
#     cv2.putText(frame, f"EAR:{ear_val:.3f} B:{blinks}", (w - 140, h - 22),
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.42, ear_color, 1)


# # ═══════════════════════════════════════════
# #  Frame Generator
# # ═══════════════════════════════════════════
# def generate_frames():
#     RECOGNITION_EVERY  = 15   # run face recognition every N frames
#     LIVENESS_EVERY     = 1    # run liveness every frame for responsive blink detection

#     frame_count     = 0
#     no_frame_count  = 0
#     cached_match    = None
#     cached_conf     = 0
#     cached_face_loc = None
#     live_frame_num  = 0       # for logging

#     print("\n[STREAM] ═══════════════ Video stream started ═══════════════")

#     while True:
#         with lock:
#             active = state["webcam_active"]

#         if not active:
#             blank = np.zeros((480, 640, 3), dtype=np.uint8)
#             cv2.putText(blank, "Webcam not active", (160, 240),
#                         cv2.FONT_HERSHEY_DUPLEX, 0.8, (60, 60, 90), 2)
#             _, buf = cv2.imencode(".jpg", blank)
#             yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
#                    + buf.tobytes() + b"\r\n")
#             time.sleep(0.05)
#             continue

#         cap = get_camera()
#         if cap is None or not cap.isOpened():
#             time.sleep(0.2)
#             continue

#         ok, frame = cap.read()
#         if not ok:
#             no_frame_count += 1
#             if no_frame_count > 10:
#                 release_camera(); time.sleep(0.5); get_camera()
#                 no_frame_count = 0
#             time.sleep(0.05)
#             continue

#         no_frame_count = 0
#         frame = cv2.flip(frame, 1)
#         h, w  = frame.shape[:2]

#         with lock:
#             ref_emb = state["ref_embedding"]

#         # ── Face Recognition every N frames ────────────────────────────
#         if ref_emb is not None and frame_count % RECOGNITION_EVERY == 0:
#             live_frame_num += 1
#             frame_label = f"LIVE_FRAME_{live_frame_num}"

#             print(f"\n[RECOG] ── Running face recognition on {frame_label} ──")
#             live_emb, face_loc = extract_face_embedding(frame, source_label=frame_label)

#             if live_emb is not None:
#                 is_match, conf, dist = compare_embeddings(ref_emb, live_emb, frame_label=frame_label)
#                 cached_match    = is_match
#                 cached_conf     = conf
#                 cached_face_loc = face_loc
#                 with lock:
#                     state["match"]          = is_match
#                     state["confidence"]     = conf
#                     state["live_embedding"] = live_emb.tolist()
#             else:
#                 cached_match = None; cached_face_loc = None
#                 with lock:
#                     state["match"]   = None
#                     state["message"] = "Show your face clearly"

#         # ── Liveness every frame (for responsive blink) ────────────────
#         if frame_count % LIVENESS_EVERY == 0:
#             rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#             res = face_mesh.process(rgb)
#             if res.multi_face_landmarks:
#                 lm     = res.multi_face_landmarks[0].landmark
#                 blinks = check_blink(lm, w, h)
#                 looked_left, looked_right = check_head_turn(lm, w, h)
#                 progress, stage = compute_liveness_progress(blinks, looked_left, looked_right)
#                 live_done = (stage == "done")
#                 with lock:
#                     state["liveness"]          = "LIVE" if live_done else "SPOOF"
#                     state["blink_count"]       = blinks
#                     state["looked_left"]       = looked_left
#                     state["looked_right"]      = looked_right
#                     state["liveness_stage"]    = stage
#                     state["liveness_progress"] = progress
#                     if live_done and state["match"]:
#                         state["message"] = "VERIFIED — LIVE PERSON"
#                         print("\n[✅ FINAL] ════════════════════════════════════")
#                         print("[✅ FINAL]  PERSON VERIFIED AS LIVE + MATCHED!")
#                         print("[✅ FINAL] ════════════════════════════════════\n")

#         # ── Read state for drawing ─────────────────────────────────────
#         with lock:
#             match    = state["match"]
#             conf     = state["confidence"]
#             liveness = state["liveness"]
#             blinks   = state["blink_count"]
#             stage    = state["liveness_stage"]
#             progress = state["liveness_progress"]
#             l_left   = state["looked_left"]
#             l_right  = state["looked_right"]

#         draw_face_box(frame, cached_face_loc, cached_match, cached_conf)
#         draw_hud(frame, match, conf, liveness, blinks, stage, progress, l_left, l_right)

#         frame_count += 1
#         _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
#         yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
#                + buf.tobytes() + b"\r\n")


# # ═══════════════════════════════════════════
# #  API Routes
# # ═══════════════════════════════════════════

# @router.post("/upload")
# async def upload_face(file: UploadFile = File(...), token: dict = Depends(verify_token)):
#     """CNIC photo se reference embedding extract karo aur save karo."""
#     contents = await file.read()
#     img      = Image.open(io.BytesIO(contents)).convert("RGB")
#     img_np   = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

#     print("\n[UPLOAD] ══════════════════════════════════════════════════════")
#     print(f"[UPLOAD] CNIC image received  → size: {img_np.shape[1]}×{img_np.shape[0]} px")
#     print(f"[UPLOAD] File: {file.filename}  Content-Type: {file.content_type}")

#     embedding, loc = extract_face_embedding(img_np, source_label="CNIC_REFERENCE")

#     if embedding is None:
#         print("[UPLOAD] ✗ FAILED — No face found in CNIC image.")
#         print("[UPLOAD] ══════════════════════════════════════════════════════\n")
#         return JSONResponse({
#             "ok": False,
#             "message": "No face found in CNIC image. Use a clear front-facing photo."
#         })

#     print(f"[UPLOAD] ✓ Reference embedding saved successfully!")
#     print(f"[UPLOAD]   This will be compared against every live frame.")
#     print("[UPLOAD] ══════════════════════════════════════════════════════\n")

#     with lock:
#         state["ref_embedding"]     = embedding
#         state["live_embedding"]    = None
#         state["match"]             = None
#         state["liveness"]          = None
#         state["liveness_stage"]    = "idle"
#         state["liveness_progress"] = 0
#         state["blink_count"]       = 0
#         state["looked_left"]       = False
#         state["looked_right"]      = False
#         state["message"]           = "CNIC face saved. Start camera to verify."

#     blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
#                          "frames_open": 0, "last_ear": 0.0})
#     head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

#     return JSONResponse({
#         "ok": True,
#         "message": "Reference face embedding saved from CNIC!"
#     })


# @router.post("/start_webcam")
# def start_webcam(token: dict = Depends(verify_token)):
#     """Start live camera for verification."""
#     blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
#                          "frames_open": 0, "last_ear": 0.0})
#     head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

#     with lock:
#         state["webcam_active"]     = True
#         state["match"]             = None
#         state["live_embedding"]    = None
#         state["liveness"]          = None
#         state["liveness_stage"]    = "idle"
#         state["liveness_progress"] = 0
#         state["blink_count"]       = 0
#         state["looked_left"]       = False
#         state["looked_right"]      = False

#     print("\n[WEBCAM] ✓ Webcam started — beginning liveness + face verification.")
#     print(f"[WEBCAM]   EAR threshold: {EAR_THRESHOLD}  |  Blinks needed: {BLINKS_NEEDED}")
#     print(f"[WEBCAM]   Match threshold: {MATCH_THRESHOLD}  |  Recognition every 15 frames\n")
#     get_camera()
#     return JSONResponse({"ok": True})


# @router.post("/stop_webcam")
# def stop_webcam(token: dict = Depends(verify_token)):
#     with lock:
#         state["webcam_active"] = False
#         state["match"]         = None
#         state["liveness"]      = None
#     release_camera()
#     print("[WEBCAM] ✓ Webcam stopped.")
#     return JSONResponse({"ok": True})


# @router.get("/video_feed")
# def video_feed():
#     """MJPEG stream with real-time face box + HUD overlay."""
#     return StreamingResponse(
#         generate_frames(),
#         media_type="multipart/x-mixed-replace; boundary=frame"
#     )


# @router.get("/status")
# def get_status(token: dict = Depends(verify_token)):
#     with lock:
#         # Convert all values to native Python types — numpy bool_/int_ crash JSONResponse
#         match = state["match"]
#         return JSONResponse({
#             "match":             bool(match) if match is not None else None,
#             "confidence":        int(state["confidence"]),
#             "message":           str(state["message"]),
#             "liveness":          state["liveness"],
#             "liveness_stage":    str(state["liveness_stage"]),
#             "liveness_progress": int(state["liveness_progress"]),
#             "blink_count":       int(state["blink_count"]),
#             "looked_left":       bool(state["looked_left"]),
#             "looked_right":      bool(state["looked_right"]),
#         })




"""
Face Verification + Liveness Router
- CNIC photo se reference embedding
- Live camera se face embedding
- Liveness: blink + head turn (left/right)
- Dono embeddings compare
- Real-time video feed with overlays
- Detailed terminal logging for debugging

CHANGE: face_recognition (dlib) → insightface ONNX (face_matcher.py)
        Drop-in swap — baaki sab same hai
"""

import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, Depends
from auth import verify_token
from fastapi.responses import StreamingResponse, JSONResponse
from face_matcher import get_matcher          # ← ONLY import change
import mediapipe as mp
import threading
import os
import io
import time
from PIL import Image

router = APIRouter(prefix="/liveness", tags=["Face Liveness"])

os.makedirs("temp", exist_ok=True)

# ═══════════════════════════════════════════
#  MediaPipe Setup
# ═══════════════════════════════════════════
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1, refine_landmarks=True,
    min_detection_confidence=0.5, min_tracking_confidence=0.5
)

# Eye landmark indices
LEFT_EYE  = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# Nose tip + left/right ear for head pose
NOSE_TIP   = 1
LEFT_EAR   = 234
RIGHT_EAR  = 454
CHIN       = 152
FOREHEAD   = 10

# ── BLINK CONFIG ──────────────────────────────────────────────────────────────
EAR_THRESHOLD      = 0.18
FRAMES_CLOSED_MIN  = 1
FRAMES_OPEN_MIN    = 2
BLINKS_NEEDED      = 2

TURN_THRESHOLD  = 0.20
MATCH_THRESHOLD = 0.50   # insightface cosine distance threshold (0.5 = strict)

# ═══════════════════════════════════════════
#  Global State
# ═══════════════════════════════════════════
state = {
    "ref_embedding":    None,
    "live_embedding":   None,
    "match":            None,
    "confidence":       0,
    "message":          "Upload CNIC image to begin",
    "webcam_active":    False,
    "liveness":         None,
    "blink_count":      0,
    "looked_left":      False,
    "looked_right":     False,
    "liveness_stage":   "idle",
    "liveness_progress": 0,
}
lock = threading.Lock()

blink_state = {
    "eye_closed":      False,
    "count":           0,
    "frames_closed":   0,
    "frames_open":     0,
    "last_ear":        0.0,
}
head_state = {
    "nose_history":  [],
    "looked_left":   False,
    "looked_right":  False,
}

# ═══════════════════════════════════════════
#  Camera
# ═══════════════════════════════════════════
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
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    cap.set(cv2.CAP_PROP_FPS, 30)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    _cap = cap
                    print(f"[CAM] ✓ Camera opened at index {idx}")
                    break
    return _cap

def release_camera():
    global _cap
    with camera_lock:
        if _cap is not None:
            _cap.release()
            _cap = None
            print("[CAM] Camera released.")

# ═══════════════════════════════════════════
#  Face Recognition Helpers  (insightface)
# ═══════════════════════════════════════════
def extract_face_embedding(img_bgr, source_label="unknown"):
    """
    Extract 512-D face embedding from BGR image using insightface.
    Drop-in replacement for face_recognition.face_encodings()
    Returns (embedding_ndarray | None, face_bbox_tuple | None)
    """
    matcher = get_matcher()
    embedding = matcher.encode(img_bgr)

    if embedding is None:
        print(f"[EMBED] [{source_label}] ✗ No face detected in image.")
        return None, None

    print(f"[EMBED] [{source_label}] ✓ Face found and encoded")
    print(f"[EMBED] [{source_label}]   Embedding shape    → {embedding.shape}  (512-dimensional ArcFace vector)")
    print(f"[EMBED] [{source_label}]   Embedding preview  → [{', '.join(f'{v:.4f}' for v in embedding[:8])} ...]")
    norm = float(np.linalg.norm(embedding))
    print(f"[EMBED] [{source_label}]   Embedding L2 norm  → {norm:.6f}")

    # Get bbox for draw_face_box (insightface returns it via app.get())
    try:
        faces = matcher._app.get(img_bgr)
        if faces:
            b = faces[0].bbox.astype(int)
            # Convert to (top, right, bottom, left) to match face_recognition format
            face_loc = (b[1], b[2], b[3], b[0])
        else:
            face_loc = None
    except Exception:
        face_loc = None

    return embedding, face_loc


def compare_embeddings(ref_enc, live_enc, frame_label="LIVE"):
    """
    Compare reference (CNIC) vs live embedding using cosine distance.
    insightface stores normalized 512-D vectors → dot product = cosine similarity
    distance = 1 - cosine_similarity  (0=same, 2=opposite)
    """
    matcher  = get_matcher()
    is_match, dist = matcher.compare(ref_enc, live_enc, threshold=MATCH_THRESHOLD)

    # Map distance to 0-100 confidence (lower distance = higher confidence)
    # dist range roughly 0.0 (same) to 1.0+ (different)
    confidence = max(0, int((1.0 - dist) * 100))

    print(f"\n[MATCH] ── Face Comparison ({frame_label}) ──────────────────")
    print(f"[MATCH]   Cosine distance      → {dist:.6f}  (threshold: {MATCH_THRESHOLD})")
    print(f"[MATCH]   Confidence score     → {confidence}%")
    print(f"[MATCH]   Result               → {'✅ MATCHED' if is_match else '❌ NOT MATCHED'}")
    dot = float(np.dot(ref_enc, live_enc))
    print(f"[MATCH]   Dot product          → {dot:.6f}")
    print(f"[MATCH] ─────────────────────────────────────────────────────\n")

    return is_match, confidence, dist


# ═══════════════════════════════════════════
#  Liveness Helpers  (unchanged)
# ═══════════════════════════════════════════
def eye_aspect_ratio(landmarks, eye_indices, w, h):
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices]
    A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    ear = (A + B) / (2.0 * C + 1e-6)
    return ear


def check_blink(landmarks, w, h):
    left_ear  = eye_aspect_ratio(landmarks, LEFT_EYE,  w, h)
    right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)
    avg_ear   = (left_ear + right_ear) / 2.0

    bs = blink_state

    if avg_ear < EAR_THRESHOLD:
        bs["frames_closed"] += 1
        bs["frames_open"]    = 0
        if bs["frames_closed"] == FRAMES_CLOSED_MIN:
            bs["eye_closed"] = True
            print(f"[BLINK] 👁️  Eyes CLOSED   EAR={avg_ear:.4f} (L:{left_ear:.4f} R:{right_ear:.4f})  frames_closed={bs['frames_closed']}")
    else:
        if bs["eye_closed"]:
            bs["frames_open"] += 1
            if bs["frames_open"] >= FRAMES_OPEN_MIN:
                bs["count"]       += 1
                bs["eye_closed"]   = False
                bs["frames_closed"] = 0
                bs["frames_open"]   = 0
                print(f"[BLINK] ✅ BLINK DETECTED!  EAR={avg_ear:.4f}  Total blinks = {bs['count']}/{BLINKS_NEEDED}")
                if bs["count"] >= BLINKS_NEEDED:
                    print(f"[BLINK] 🎉 Blink requirement met ({BLINKS_NEEDED} blinks)!")
        else:
            bs["frames_closed"] = 0
            bs["frames_open"]   = 0

    bs["last_ear"] = avg_ear
    return bs["count"]


def check_head_turn(landmarks, w, h):
    nose_x  = landmarks[NOSE_TIP].x
    left_x  = landmarks[LEFT_EAR].x
    right_x = landmarks[RIGHT_EAR].x

    face_width = abs(right_x - left_x) + 1e-6
    norm_pos = (nose_x - left_x) / face_width

    hs = head_state
    if norm_pos < (0.5 - TURN_THRESHOLD) and not hs["looked_right"]:
        hs["looked_right"] = True
        print(f"[HEAD]  ➡️  Head turned RIGHT  norm_pos={norm_pos:.3f}")
    if norm_pos > (0.5 + TURN_THRESHOLD) and not hs["looked_left"]:
        hs["looked_left"] = True
        print(f"[HEAD]  ⬅️  Head turned LEFT   norm_pos={norm_pos:.3f}")

    return hs["looked_left"], hs["looked_right"]


def compute_liveness_progress(blinks, looked_left, looked_right):
    total = 3
    done  = 0
    if looked_right: done += 1
    if looked_left:  done += 1
    if blinks >= BLINKS_NEEDED: done += 1

    if not looked_right:
        stage = "look_right"
    elif not looked_left:
        stage = "look_left"
    elif blinks < BLINKS_NEEDED:
        stage = "blink"
    else:
        stage = "done"

    return int((done / total) * 100), stage


# ═══════════════════════════════════════════
#  Draw Helpers  (unchanged)
# ═══════════════════════════════════════════
def draw_face_box(frame, face_loc, match, conf):
    if face_loc is None:
        return
    top, right, bottom, left = face_loc
    if match is True:
        color = (0, 220, 80)
    elif match is False:
        color = (40, 40, 200)
    else:
        color = (180, 180, 180)

    cv2.rectangle(frame, (left, top), (right, bottom), color, 3)

    size = 18; lw = 4
    for (cx, cy, dx1, dy1, dx2, dy2) in [
        (left,  top,    size, 0, 0,     size),
        (right, top,   -size, 0, 0,     size),
        (left,  bottom, size, 0, 0,    -size),
        (right, bottom,-size, 0, 0,    -size),
    ]:
        cv2.line(frame, (cx, cy), (cx + dx1, cy + dy1), color, lw)
        cv2.line(frame, (cx, cy), (cx + dx2, cy + dy2), color, lw)

    label = f"{'MATCH' if match else 'NO MATCH'} {conf}%"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(frame, (left, top - th - 10), (left + tw + 10, top), color, -1)
    cv2.putText(frame, label, (left + 5, top - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)


def draw_hud(frame, match, conf, liveness, blinks, stage, progress, looked_left, looked_right):
    h, w = frame.shape[:2]

    cv2.rectangle(frame, (0, 0), (w, 60), (8, 8, 14), -1)

    if match is True and liveness == "LIVE":
        bar_color = (0, 220, 80)
        icon_text = "VERIFIED + LIVE"
    elif match is True:
        bar_color = (0, 180, 255)
        icon_text = f"MATCHED — Complete liveness"
    elif match is False:
        bar_color = (60, 60, 220)
        icon_text = "FACE NOT MATCHED"
    else:
        bar_color = (100, 100, 140)
        icon_text = "SCANNING..."

    cv2.putText(frame, icon_text, (14, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)
    if conf > 0:
        cv2.putText(frame, f"{conf}%", (w - 70, 38), cv2.FONT_HERSHEY_DUPLEX, 0.72, bar_color, 2)

    cv2.rectangle(frame, (20, h - 15), (w - 20, h - 5), (25, 25, 35), -1)
    if conf > 0:
        bar_w = int((conf / 100) * (w - 40))
        fill  = (0, 220, 80) if (match and liveness == "LIVE") else (0, 140, 220)
        cv2.rectangle(frame, (20, h - 15), (20 + bar_w, h - 5), fill, -1)
        cv2.putText(frame, f"{conf}%", (w // 2 - 15, h - 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

    checks = [
        ("Turn Right", looked_right),
        ("Turn Left",  looked_left),
        (f"Blink x{BLINKS_NEEDED}", blinks >= BLINKS_NEEDED),
    ]
    y_start = h - 95
    for label, done in checks:
        color = (0, 220, 80) if done else (140, 140, 160)
        mark  = "[OK]" if done else "[ ]"
        cv2.putText(frame, f"{mark} {label}", (14, y_start),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1)
        y_start += 22

    bar_x, bar_y = w - 130, h - 95
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + 110, bar_y + 12), (30, 30, 40), -1)
    prog_w = int((progress / 100) * 110)
    prog_col = (0, 220, 80) if progress == 100 else (0, 180, 255)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + prog_w, bar_y + 12), prog_col, -1)
    cv2.putText(frame, f"Liveness {progress}%", (bar_x, bar_y - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)

    stage_msgs = {
        "look_right": ">> Turn your head RIGHT",
        "look_left":  "<< Turn your head LEFT",
        "blink":      "^^ Now BLINK your eyes",
        "done":       "LIVENESS COMPLETE!",
        "idle":       "Waiting...",
    }
    msg = stage_msgs.get(stage, "")
    if msg:
        (tw, th), _ = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cx = (w - tw) // 2
        cv2.rectangle(frame, (cx - 8, 65), (cx + tw + 8, 65 + th + 10), (0, 0, 0), -1)
        cv2.putText(frame, msg, (cx, 65 + th + 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 220, 200), 2)

    ear_val = blink_state.get("last_ear", 0.0)
    ear_color = (0, 80, 255) if ear_val < EAR_THRESHOLD else (180, 180, 180)
    cv2.putText(frame, f"EAR:{ear_val:.3f} B:{blinks}", (w - 140, h - 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, ear_color, 1)


# ═══════════════════════════════════════════
#  Frame Generator
# ═══════════════════════════════════════════
def generate_frames():
    RECOGNITION_EVERY = 15
    LIVENESS_EVERY    = 1

    frame_count     = 0
    no_frame_count  = 0
    cached_match    = None
    cached_conf     = 0
    cached_face_loc = None
    live_frame_num  = 0

    print("\n[STREAM] ═══════════════ Video stream started ═══════════════")

    while True:
        with lock:
            active = state["webcam_active"]

        if not active:
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "Webcam not active", (160, 240),
                        cv2.FONT_HERSHEY_DUPLEX, 0.8, (60, 60, 90), 2)
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

        # ── Face Recognition every N frames ────────────────────────────
        if ref_emb is not None and frame_count % RECOGNITION_EVERY == 0:
            live_frame_num += 1
            frame_label = f"LIVE_FRAME_{live_frame_num}"

            print(f"\n[RECOG] ── Running face recognition on {frame_label} ──")
            live_emb, face_loc = extract_face_embedding(frame, source_label=frame_label)

            if live_emb is not None:
                is_match, conf, dist = compare_embeddings(ref_emb, live_emb, frame_label=frame_label)
                cached_match    = is_match
                cached_conf     = conf
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

        # ── Liveness every frame ───────────────────────────────────────
        if frame_count % LIVENESS_EVERY == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = face_mesh.process(rgb)
            if res.multi_face_landmarks:
                lm     = res.multi_face_landmarks[0].landmark
                blinks = check_blink(lm, w, h)
                looked_left, looked_right = check_head_turn(lm, w, h)
                progress, stage = compute_liveness_progress(blinks, looked_left, looked_right)
                live_done = (stage == "done")
                with lock:
                    state["liveness"]          = "LIVE" if live_done else "SPOOF"
                    state["blink_count"]       = blinks
                    state["looked_left"]       = looked_left
                    state["looked_right"]      = looked_right
                    state["liveness_stage"]    = stage
                    state["liveness_progress"] = progress
                    if live_done and state["match"]:
                        state["message"] = "VERIFIED — LIVE PERSON"
                        print("\n[✅ FINAL] ════════════════════════════════════")
                        print("[✅ FINAL]  PERSON VERIFIED AS LIVE + MATCHED!")
                        print("[✅ FINAL] ════════════════════════════════════\n")

        # ── Draw ───────────────────────────────────────────────────────
        with lock:
            match    = state["match"]
            conf     = state["confidence"]
            liveness = state["liveness"]
            blinks   = state["blink_count"]
            stage    = state["liveness_stage"]
            progress = state["liveness_progress"]
            l_left   = state["looked_left"]
            l_right  = state["looked_right"]

        draw_face_box(frame, cached_face_loc, cached_match, cached_conf)
        draw_hud(frame, match, conf, liveness, blinks, stage, progress, l_left, l_right)

        frame_count += 1
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")


# ═══════════════════════════════════════════
#  API Routes
# ═══════════════════════════════════════════

@router.post("/upload")
async def upload_face(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    """CNIC photo se reference embedding extract karo aur save karo."""
    contents = await file.read()
    img      = Image.open(io.BytesIO(contents)).convert("RGB")
    img_np   = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    print("\n[UPLOAD] ══════════════════════════════════════════════════════")
    print(f"[UPLOAD] CNIC image received  → size: {img_np.shape[1]}×{img_np.shape[0]} px")
    print(f"[UPLOAD] File: {file.filename}  Content-Type: {file.content_type}")

    embedding, loc = extract_face_embedding(img_np, source_label="CNIC_REFERENCE")

    if embedding is None:
        print("[UPLOAD] ✗ FAILED — No face found in CNIC image.")
        return JSONResponse({
            "ok": False,
            "message": "No face found in CNIC image. Use a clear front-facing photo."
        })

    print(f"[UPLOAD] ✓ Reference embedding saved (512-D ArcFace vector)")
    print("[UPLOAD] ══════════════════════════════════════════════════════\n")

    with lock:
        state["ref_embedding"]     = embedding      # numpy array — same as before
        state["live_embedding"]    = None
        state["match"]             = None
        state["liveness"]          = None
        state["liveness_stage"]    = "idle"
        state["liveness_progress"] = 0
        state["blink_count"]       = 0
        state["looked_left"]       = False
        state["looked_right"]      = False
        state["message"]           = "CNIC face saved. Start camera to verify."

    blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
                         "frames_open": 0, "last_ear": 0.0})
    head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

    return JSONResponse({"ok": True, "message": "Reference face embedding saved from CNIC!"})


@router.post("/start_webcam")
def start_webcam(token: dict = Depends(verify_token)):
    blink_state.update({"eye_closed": False, "count": 0, "frames_closed": 0,
                         "frames_open": 0, "last_ear": 0.0})
    head_state.update({"nose_history": [], "looked_left": False, "looked_right": False})

    with lock:
        state["webcam_active"]     = True
        state["match"]             = None
        state["live_embedding"]    = None
        state["liveness"]          = None
        state["liveness_stage"]    = "idle"
        state["liveness_progress"] = 0
        state["blink_count"]       = 0
        state["looked_left"]       = False
        state["looked_right"]      = False

    print("\n[WEBCAM] ✓ Webcam started — insightface ArcFace matching active.")
    print(f"[WEBCAM]   EAR threshold: {EAR_THRESHOLD}  |  Blinks needed: {BLINKS_NEEDED}")
    print(f"[WEBCAM]   Match threshold (cosine dist): {MATCH_THRESHOLD}\n")
    get_camera()
    return JSONResponse({"ok": True})


@router.post("/stop_webcam")
def stop_webcam(token: dict = Depends(verify_token)):
    with lock:
        state["webcam_active"] = False
        state["match"]         = None
        state["liveness"]      = None
    release_camera()
    print("[WEBCAM] ✓ Webcam stopped.")
    return JSONResponse({"ok": True})


@router.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/status")
def get_status(token: dict = Depends(verify_token)):
    with lock:
        match = state["match"]
        return JSONResponse({
            "match":             bool(match) if match is not None else None,
            "confidence":        int(state["confidence"]),
            "message":           str(state["message"]),
            "liveness":          state["liveness"],
            "liveness_stage":    str(state["liveness_stage"]),
            "liveness_progress": int(state["liveness_progress"]),
            "blink_count":       int(state["blink_count"]),
            "looked_left":       bool(state["looked_left"]),
            "looked_right":      bool(state["looked_right"]),
        })