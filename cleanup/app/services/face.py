"""Face search restricted to the owner's own face.

* Reference faces come only from photos the owner uploaded on the Seeds page and
  attested as their own. There is no way to supply an arbitrary face here.
* Reference encodings are stored encrypted; candidate images are downloaded into
  memory only, scored, and discarded.
* Remote services: FaceCheck.ID via its API (if a token is configured). Services
  without a public API (Google Lens, PimEyes, Bing Visual Search) are used by hand:
  run the search yourself, then paste the result URLs into "Import results" and
  the app scores them locally.
"""
from __future__ import annotations

import base64
import io
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..crypto import decrypt_str, encrypt_str, read_encrypted_file
from ..db import Finding, Seed, log_job
from . import http
from .http import domain_of, polite_get

MATCH_THRESHOLD = 0.6  # face_recognition's conventional distance threshold

try:  # optional heavy dependency (dlib); install with requirements-face.txt
    import face_recognition  # type: ignore
    import numpy as np  # type: ignore

    FACE_AVAILABLE = True
except Exception:  # noqa: BLE001
    face_recognition = None
    np = None
    FACE_AVAILABLE = False


class FaceError(Exception):
    pass


def _encodings_from_bytes(data: bytes):
    if not FACE_AVAILABLE:
        raise FaceError("Local face matching is not installed (see requirements-face.txt).")
    image = face_recognition.load_image_file(io.BytesIO(data))
    locations = face_recognition.face_locations(image)
    return face_recognition.face_encodings(image, locations)


def enroll_reference(db: Session, seed: Seed) -> None:
    """Compute and store the face encoding for an attested reference photo."""
    if seed.kind != "photo" or not seed.self_attested:
        raise FaceError("Only photos you confirmed as your own face can be used as references.")
    encs = _encodings_from_bytes(read_encrypted_file(seed.value))
    if len(encs) != 1:
        raise FaceError(f"Reference photo must contain exactly one face (found {len(encs)}).")
    seed.face_encoding_enc = encrypt_str(base64.b64encode(encs[0].astype("float64").tobytes()).decode())
    db.commit()


def reference_encodings(db: Session) -> list:
    out = []
    for seed in db.scalars(select(Seed).where(Seed.kind == "photo", Seed.self_attested.is_(True),
                                              Seed.face_encoding_enc.is_not(None))).all():
        raw = base64.b64decode(decrypt_str(seed.face_encoding_enc))
        out.append(np.frombuffer(raw, dtype="float64"))
    return out


def score_image_bytes(data: bytes, refs: list) -> Optional[float]:
    """Best match score in [0,1] between any face in the image and the owner's references."""
    if not refs:
        raise FaceError("No reference faces enrolled yet.")
    encs = _encodings_from_bytes(data)
    if not encs:
        return None
    best = min(float(face_recognition.face_distance(refs, e).min()) for e in encs)
    return round(max(0.0, 1.0 - best), 3)


def score_finding(db: Session, finding: Finding, refs: list) -> Optional[float]:
    url = finding.image_url or finding.thumbnail_url
    if not url:
        return None
    res = polite_get(url, want_bytes=True)
    if res.status != 200 or not res.content_type.startswith("image/"):
        return None
    score = score_image_bytes(res.content, refs)
    finding.face_score = score
    db.commit()
    return score


def score_all_images(db: Session) -> int:
    refs = reference_encodings(db)
    n = 0
    for f in db.scalars(select(Finding).where(Finding.face_score.is_(None),
                                              (Finding.image_url != "") | (Finding.thumbnail_url != ""))).all():
        try:
            if score_finding(db, f, refs) is not None:
                n += 1
        except FaceError:
            raise
        except Exception as e:  # noqa: BLE001
            log_job(db, "face", f"{f.url}: {e}")
    return n


def import_manual_results(db: Session, lines: str, service: str) -> int:
    """Owner pastes results from a face/reverse-image search they ran themselves.
    Each line: page_url [image_url]."""
    from .search import Hit, save_hits

    hits = []
    for line in lines.splitlines():
        parts = line.strip().split()
        if not parts or not parts[0].startswith(("http://", "https://")):
            continue
        image = parts[1] if len(parts) > 1 and parts[1].startswith(("http://", "https://")) else ""
        hits.append(Hit(url=parts[0], title=f"{service} result: {domain_of(parts[0])}", image_url=image,
                        source="manual", content_type_hint="photo", meta={"service": service}))
    return save_hits(db, hits)


# ---------------------------------------------------------------------------
# FaceCheck.ID API (verify the endpoints against their current API docs)
# ---------------------------------------------------------------------------

FACECHECK_BASE = "https://facecheck.id"


def facecheck_search(db: Session, seed: Seed, timeout_s: int = 300) -> int:
    s = get_settings()
    if not s.facecheck_api_token:
        raise FaceError("FACECHECK_API_TOKEN is not set.")
    if seed.kind != "photo" or not seed.self_attested:
        raise FaceError("Only photos you confirmed as your own face can be searched.")
    data = read_encrypted_file(seed.value)
    headers = {"accept": "application/json", "Authorization": s.facecheck_api_token}
    with http.client(headers=headers, timeout=60.0) as c:
        r = c.post(f"{FACECHECK_BASE}/api/upload_pic", files={"images": ("me.jpg", data, "image/jpeg")},
                   data={"id_search": ""})
        j = r.json()
        if j.get("error"):
            raise FaceError(f"FaceCheck upload error: {j['error']}")
        id_search = j["id_search"]
        payload = {"id_search": id_search, "with_progress": True, "status_only": False,
                   "demo": s.facecheck_testing_mode}
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            j = c.post(f"{FACECHECK_BASE}/api/search", json=payload).json()
            if j.get("error"):
                raise FaceError(f"FaceCheck search error: {j['error']}")
            if j.get("output"):
                break
            time.sleep(3)
        else:
            raise FaceError("FaceCheck search timed out.")

    from .search import Hit, save_hits

    hits = []
    for item in j["output"].get("items", []):
        hits.append(Hit(url=item["url"], title=f"FaceCheck match: {domain_of(item['url'])}", source="facecheck",
                        content_type_hint="photo", meta={"facecheck_score": item.get("score")}))
    new = save_hits(db, hits, seed.id)
    # use FaceCheck's own score as a provisional face score (0-100 -> 0-1)
    for item in j["output"].get("items", []):
        f = db.scalars(select(Finding).where(Finding.url == item["url"])).first()
        if f and f.face_score is None and item.get("score") is not None:
            f.face_score = round(float(item["score"]) / 100.0, 3)
    db.commit()
    log_job(db, "face", f"FaceCheck: {new} new findings")
    return new
