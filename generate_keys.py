#!/usr/bin/env python3
"""
FaceFlow Serial Key Generator.

Reads the secret from `faceflow-client/src-tauri/activation.secret`
and generates valid serial keys.

Usage:
    python3 generate_keys.py           # generate 1 key
    python3 generate_keys.py 10        # generate 10 keys
    python3 generate_keys.py 10 -o     # generate 10 keys and append to activation_keys.txt
"""

import hmac
import hashlib
import random
import sys
import os

# Charset matching the Rust side — no ambiguous chars (0/O, 1/I/L removed)
CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
GROUP_COUNT = 5
GROUP_LENGTH = 5


def load_secret() -> bytes:
    secret_path = os.path.join(
        os.path.dirname(__file__),
        "faceflow-client",
        "src-tauri",
        "activation.secret",
    )
    if not os.path.exists(secret_path):
        print(f"Error: Secret file not found at {secret_path}")
        sys.exit(1)
    with open(secret_path) as f:
        return f.read().strip().encode()


def compute_checksum(secret: bytes, payload: str) -> str:
    """Compute 5-char HMAC checksum — mirrors the Rust implementation exactly."""
    digest = hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    check = ""
    for byte in digest[:5]:
        check += CHARSET[byte % len(CHARSET)]
    return check


def generate_key(secret: bytes) -> str:
    """Generate a single valid serial key."""
    groups = []
    for _ in range(GROUP_COUNT - 1):
        group = "".join(random.choices(CHARSET, k=GROUP_LENGTH))
        groups.append(group)

    payload = "".join(groups)
    checksum = compute_checksum(secret, payload)
    groups.append(checksum)

    return "-".join(groups)


def validate_key(secret: bytes, key: str) -> bool:
    """Validate a serial key (for testing)."""
    parts = key.strip().upper().split("-")
    if len(parts) != GROUP_COUNT:
        return False
    if not all(len(p) == GROUP_LENGTH and all(c in CHARSET for c in p) for p in parts):
        return False
    payload = "".join(parts[:4])
    expected = compute_checksum(secret, payload)
    return parts[4] == expected


def main():
    count = 1
    save_to_file = False

    args = sys.argv[1:]
    if "-o" in args:
        save_to_file = True
        args.remove("-o")
    if args:
        try:
            count = int(args[0])
        except ValueError:
            print("Usage: python3 generate_keys.py [count] [-o]")
            sys.exit(1)

    secret = load_secret()
    keys = []

    for _ in range(count):
        key = generate_key(secret)
        # Self-check
        assert validate_key(secret, key), f"Generated key failed validation: {key}"
        keys.append(key)
        print(key)

    if save_to_file:
        keys_path = os.path.join(os.path.dirname(__file__), "activation_keys.txt")
        with open(keys_path, "a") as f:
            for key in keys:
                f.write(key + "\n")
        print(f"\n[Saved {count} key(s) to {keys_path}]")


if __name__ == "__main__":
    main()
