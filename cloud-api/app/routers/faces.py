from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, UploadFile, status

from app.core.config import settings
from app.models.schemas import BatchResponse, BoundingBox, FaceResult
from app.services.face_detection import face_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix=settings.api_v1_prefix, tags=["faces"])


@router.post("/extract-faces", response_model=BatchResponse)
async def extract_faces(
    files: list[UploadFile],
    threshold: float = Query(default=settings.face_detection_threshold, ge=0.0, le=1.0),
) -> BatchResponse:
    if len(files) > settings.max_batch_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Batch size exceeds maximum of {settings.max_batch_size}",
        )

    all_faces: list[FaceResult] = []
    face_counter = 0

    for img_idx, file in enumerate(files):
        if file.content_type and not file.content_type.startswith("image/"):
            logger.warning("Skipping non-image file: %s", file.filename)
            continue

        image_bytes = await file.read()
        logger.info(
            "Processing file %d/%d: %s (%d bytes, %s)",
            img_idx + 1,
            len(files),
            file.filename,
            len(image_bytes),
            file.content_type,
        )
        detected = face_service.detect_faces(image_bytes, threshold=threshold)
        logger.info(
            "  -> %d face(s) detected in %s",
            len(detected),
            file.filename,
        )

        for face in detected:
            bbox = face.bbox.tolist()
            embedding = face.embedding.tolist()
            all_faces.append(
                FaceResult(
                    index=face_counter,
                    image_index=img_idx,
                    bbox=BoundingBox(x1=bbox[0], y1=bbox[1], x2=bbox[2], y2=bbox[3]),
                    embedding=embedding,
                    detection_score=float(face.det_score),
                )
            )
            face_counter += 1

    return BatchResponse(
        faces=all_faces,
        images_processed=len(files),
        total_faces_detected=len(all_faces),
    )
