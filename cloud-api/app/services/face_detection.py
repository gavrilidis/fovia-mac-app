from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from app.core.config import settings

if TYPE_CHECKING:
    from insightface.app.common import Face

logger = logging.getLogger(__name__)


class FaceDetectionService:
    """Handles face detection and embedding extraction using InsightFace."""

    def __init__(self) -> None:
        self._app: FaceAnalysis | None = None

    def _ensure_model(self) -> FaceAnalysis:
        if self._app is None:
            logger.info("Loading InsightFace model: %s", settings.model_name)
            self._app = FaceAnalysis(
                name=settings.model_name,
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace model loaded successfully")
        return self._app

    def detect_faces(self, image_bytes: bytes, *, threshold: float | None = None) -> list[Face]:
        app = self._ensure_model()
        effective_threshold = (
            threshold if threshold is not None else settings.face_detection_threshold
        )
        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            return []
        faces = app.get(img)
        return [f for f in faces if f.det_score >= effective_threshold]


face_service = FaceDetectionService()
