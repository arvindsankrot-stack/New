"""Encryption helpers for data that lives outside the SQLCipher database
(uploaded photos, ID documents) and for secrets stored inside it (OAuth tokens,
TOTP secret) as a second layer."""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from cryptography.fernet import Fernet

from .config import get_settings


def _fernet() -> Fernet:
    return Fernet(get_settings().file_key.encode())


def encrypt_bytes(data: bytes) -> bytes:
    return _fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    return _fernet().decrypt(token)


def encrypt_str(value: str) -> str:
    return encrypt_bytes(value.encode()).decode()


def decrypt_str(value: str) -> str:
    return decrypt_bytes(value.encode()).decode()


def store_encrypted_file(data: bytes, suffix: str = ".bin") -> str:
    """Encrypt and write a file into the files dir. Returns the stored file name."""
    name = f"{uuid.uuid4().hex}{suffix}.enc"
    path = get_settings().files_dir / name
    path.write_bytes(encrypt_bytes(data))
    os.chmod(path, 0o600)
    return name


def read_encrypted_file(name: str) -> bytes:
    path = _safe_path(name)
    return decrypt_bytes(path.read_bytes())


def delete_encrypted_file(name: str) -> None:
    path = _safe_path(name)
    if path.exists():
        path.unlink()


def _safe_path(name: str) -> Path:
    base = get_settings().files_dir.resolve()
    path = (base / name).resolve()
    if base not in path.parents:
        raise ValueError("invalid file name")
    return path
