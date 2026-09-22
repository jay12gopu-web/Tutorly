"""Synthetic identities for isolated backend tests; never imported by the app.

Older regression tests used anonymous password registration to seed an account.
New accounts now prove email ownership before a password/profile can be saved.
This fixture inserts a known test OTP in the test database, then exercises the
real OTP verifier, authenticated password setup and onboarding endpoints.
"""
import secrets
import time

from backend import auth_routes


def verified_test_session(client, email: str):
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = int(time.time())
    with auth_routes._connection() as connection:
        connection.execute(
            """INSERT INTO tutorly_login_otps(email, otp_hash, request_ip, created_at, expires_at)
               VALUES (?, ?, 'isolated-test', ?, ?)""",
            (email, auth_routes._hash_otp(email, code), now, now + 600),
        )
    response = client.post("/api/auth/verify-otp", json={"email": email, "code": code})
    assert response.status_code == 200, response.text
    return response


def register_test_user(client, *, full_name: str, email: str, password: str, complete: bool = True):
    verified = verified_test_session(client, email)
    headers = {"Authorization": f"Bearer {verified.json()['session_token']}"}
    if complete:
        onboarded = client.post("/api/auth/onboarding", headers=headers, json={
            "role": "student", "full_name": full_name, "age": 14, "grade": "9", "board": "CBSE",
        })
        assert onboarded.status_code == 200, onboarded.text
    return client.post("/api/auth/register", headers=headers, json={
        "full_name": full_name, "email": email, "password": password,
    })
