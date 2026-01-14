import io
import mimetypes
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Optional
from uuid import uuid4

import jwt
from botocore.config import Config as BotoConfig
import boto3
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from pyicloud import PyiCloudService

app = FastAPI()


@dataclass
class PendingSession:
    apple_id: str
    app_password: str
    session_dir: str
    created_at: float


pending_sessions: dict[str, PendingSession] = {}


class SessionPayload(BaseModel):
    file_name: str
    data: str


class SyncRequest(BaseModel):
    apple_id: str
    app_password: str
    session: Optional[SessionPayload] = None
    limit: Optional[int] = None


class TwoFactorRequest(BaseModel):
    session_id: str
    code: str


def verify_token(auth_header: Optional[str]):
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth_header.split(" ", 1)[1]
    secret = os.environ.get("WORKER_JWT_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="WORKER_JWT_SECRET not configured")

    try:
        jwt.decode(token, secret, algorithms=["HS256"], audience="icloud-worker")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def get_s3_client():
    bucket = os.environ.get("PHOTO_BUCKET")
    if not bucket:
        raise HTTPException(status_code=500, detail="PHOTO_BUCKET not configured")

    region = os.environ.get("S3_REGION", "auto")
    endpoint = os.environ.get("S3_ENDPOINT")
    access_key = os.environ.get("S3_ACCESS_KEY_ID")
    secret_key = os.environ.get("S3_SECRET_ACCESS_KEY")
    force_path = os.environ.get("S3_FORCE_PATH_STYLE") == "true"

    config = BotoConfig(s3={"addressing_style": "path"} if force_path else {})

    client = boto3.client(
        "s3",
        region_name=region,
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=config,
    )

    return client, bucket


def list_existing_keys(client, bucket: str, prefix: str):
    keys = set()
    continuation = None

    while True:
        params = {"Bucket": bucket, "Prefix": prefix}
        if continuation:
            params["ContinuationToken"] = continuation

        response = client.list_objects_v2(**params)
        for item in response.get("Contents", []):
            key = item.get("Key")
            if key:
                keys.add(key)

        if response.get("IsTruncated"):
            continuation = response.get("NextContinuationToken")
        else:
            break

    return keys


def ensure_photo_prefix():
    prefix = os.environ.get("PHOTO_PREFIX", "photos/")
    return prefix if prefix.endswith("/") else f"{prefix}/"


def create_session_dir(session: Optional[SessionPayload]):
    session_dir = tempfile.mkdtemp(prefix="icloud-session-")

    if session:
        file_name = os.path.basename(session.file_name)
        file_path = os.path.join(session_dir, file_name)
        with open(file_path, "w", encoding="utf-8") as handle:
            handle.write(session.data)

    return session_dir


def extract_session_payload(session_dir: str):
    files = [
        f
        for f in os.listdir(session_dir)
        if os.path.isfile(os.path.join(session_dir, f))
    ]
    if not files:
        return None

    file_name = files[0]
    file_path = os.path.join(session_dir, file_name)

    with open(file_path, "r", encoding="utf-8") as handle:
        data = handle.read()

    return {"file_name": file_name, "data": data}


def get_photo_identifier(photo):
    for attr in ("id", "asset_id", "record_name", "recordName"):
        value = getattr(photo, attr, None)
        if value:
            return str(value)
    return None


def get_photo_filename(photo):
    for attr in ("filename", "original_filename", "file_name", "name"):
        value = getattr(photo, attr, None)
        if value:
            return str(value)
    identifier = get_photo_identifier(photo)
    return f"{identifier or uuid4().hex}.jpg"


def download_photo_bytes(photo):
    downloaded = photo.download()

    if isinstance(downloaded, bytes):
        return downloaded

    if hasattr(downloaded, "content"):
        return downloaded.content

    if hasattr(downloaded, "read"):
        return downloaded.read()

    if isinstance(downloaded, io.BytesIO):
        return downloaded.getvalue()

    if isinstance(downloaded, dict) and "data" in downloaded:
        return downloaded["data"]

    temp_dir = tempfile.mkdtemp(prefix="icloud-photo-")
    file_path = photo.download(download_dir=temp_dir)

    if not file_path:
        fallback = os.path.join(temp_dir, get_photo_filename(photo))
        file_path = fallback if os.path.exists(fallback) else None

    if not file_path or not os.path.exists(file_path):
        raise RuntimeError("Failed to download photo")

    with open(file_path, "rb") as handle:
        return handle.read()


def upload_photo(client, bucket: str, key: str, data: bytes):
    content_type, _ = mimetypes.guess_type(key)
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type or "application/octet-stream",
    )


def perform_sync(api: PyiCloudService, limit: Optional[int]):
    client, bucket = get_s3_client()
    prefix = ensure_photo_prefix()
    existing = list_existing_keys(client, bucket, prefix)

    imported = 0
    skipped = 0
    errors: list[str] = []

    photos = api.photos.all

    for index, photo in enumerate(photos):
        if limit is not None and index >= limit:
            break

        filename = get_photo_filename(photo)
        identifier = get_photo_identifier(photo)
        safe_identifier = "".join(
            ch for ch in (identifier or "") if ch.isalnum() or ch in ("-", "_")
        )

        if safe_identifier:
            key = f"{prefix}{safe_identifier}-{filename}"
        else:
            key = f"{prefix}{filename}"

        if key in existing:
            skipped += 1
            continue

        try:
            data = download_photo_bytes(photo)
            upload_photo(client, bucket, key, data)
            existing.add(key)
            imported += 1
        except Exception as exc:
            errors.append(f"Failed {filename}: {exc}")

    return imported, skipped, errors


@app.post("/sync")
async def sync_photos(
    request: SyncRequest, authorization: Optional[str] = Header(default=None)
):
    verify_token(authorization)

    session_dir = create_session_dir(request.session)
    api = PyiCloudService(
        request.apple_id, request.app_password, cookie_directory=session_dir
    )

    if getattr(api, "requires_2fa", False) or getattr(api, "requires_2sa", False):
        session_id = uuid4().hex
        pending_sessions[session_id] = PendingSession(
            apple_id=request.apple_id,
            app_password=request.app_password,
            session_dir=session_dir,
            created_at=time.time(),
        )
        return {"status": "needs_2fa", "session_id": session_id}

    imported, skipped, errors = perform_sync(api, request.limit)
    session_payload = extract_session_payload(session_dir)

    return {
        "status": "ok",
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "session": session_payload,
    }


@app.post("/sync/2fa")
async def sync_with_2fa(
    payload: TwoFactorRequest, authorization: Optional[str] = Header(default=None)
):
    verify_token(authorization)

    pending = pending_sessions.get(payload.session_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Session not found")

    api = PyiCloudService(
        pending.apple_id, pending.app_password, cookie_directory=pending.session_dir
    )

    if getattr(api, "requires_2fa", False):
        if not api.validate_2fa_code(payload.code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    imported, skipped, errors = perform_sync(api, None)
    session_payload = extract_session_payload(pending.session_dir)

    pending_sessions.pop(payload.session_id, None)

    return {
        "status": "ok",
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "session": session_payload,
    }
