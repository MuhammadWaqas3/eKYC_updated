"""
face_matcher.py  — Drop-in replacement for face_recognition library
====================================================================
face_recognition (dlib) → insightface ONNX

Usage in liveness.py:
    # OLD:
    # import face_recognition
    # enc = face_recognition.face_encodings(rgb)[0]
    # match = face_recognition.compare_faces([ref_enc], enc, tolerance=0.6)

    # NEW (just swap to this):
    from main_app.face_matcher import FaceMatcher
    matcher = FaceMatcher()          # singleton, call once
    ref_enc = matcher.encode(image)  # numpy array HWC BGR
    match, dist = matcher.compare(ref_enc, live_enc, threshold=0.5)
"""

import numpy as np
import cv2
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_matcher_instance = None

def get_matcher():
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = FaceMatcher()
    return _matcher_instance


class FaceMatcher:
    """
    Wraps insightface ArcFace ONNX model for face embedding + comparison.
    No dlib. No cmake. No 20-minute build.
    """

    def __init__(self):
        self._app = None
        self._initialized = False
        self._init()

    def _init(self):
        try:
            import insightface
            from insightface.app import FaceAnalysis

            model_root = os.path.join(Path.home(), ".insightface")
            self._app = FaceAnalysis(
                name="buffalo_sc",          # small model — fast CPU inference
                root=model_root,
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=-1, det_size=(320, 320))  # -1 = CPU
            self._initialized = True
            logger.info("✅ FaceMatcher (insightface buffalo_sc) initialized")
        except Exception as e:
            logger.error(f"FaceMatcher init failed: {e}")
            self._initialized = False

    def encode(self, bgr_image: np.ndarray) -> np.ndarray | None:
        """
        Returns 512-D face embedding for the largest face in the image.
        bgr_image: numpy HWC uint8 (OpenCV format)
        Returns None if no face detected.
        """
        if not self._initialized:
            logger.warning("FaceMatcher not initialized — returning None")
            return None

        try:
            faces = self._app.get(bgr_image)
            if not faces:
                return None
            # Pick the largest face by bbox area
            largest = max(faces, key=lambda f: (
                (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
            ))
            return largest.normed_embedding  # 512-D normalized vector
        except Exception as e:
            logger.error(f"encode() error: {e}")
            return None

    def compare(
        self,
        ref_embedding: np.ndarray,
        live_embedding: np.ndarray,
        threshold: float = 0.5,
    ) -> tuple[bool, float]:
        """
        Compare two 512-D embeddings.
        Returns (is_match: bool, cosine_distance: float)

        threshold=0.5 recommended for Pakistani CNICs
        Lower threshold = stricter matching
        """
        if ref_embedding is None or live_embedding is None:
            return False, 1.0

        # Cosine similarity → distance
        sim = float(np.dot(ref_embedding, live_embedding))
        dist = 1.0 - sim   # 0 = identical, 2 = opposite

        is_match = dist < threshold
        logger.debug(f"Face compare: dist={dist:.3f}, match={is_match}")
        return is_match, dist

    def is_same_person(
        self,
        img1: np.ndarray,
        img2: np.ndarray,
        threshold: float = 0.5,
    ) -> tuple[bool, float]:
        """Convenience: encode both images and compare in one call."""
        enc1 = self.encode(img1)
        enc2 = self.encode(img2)
        return self.compare(enc1, enc2, threshold)