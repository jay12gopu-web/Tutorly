"""Canonical onboarding, migration and private teacher-document regressions."""
from __future__ import annotations

import base64
import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import auth_routes
from auth_test_helpers import verified_test_session


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY7sAAAAASUVORK5CYII=")
PDF = b"%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF"


def main():
    checks = 0
    with tempfile.TemporaryDirectory() as temporary:
        auth_routes.DATABASE_PATH = Path(temporary) / "onboarding.db"
        os.environ["TUTORLY_OTP_SECRET"] = "onboarding-tests-only-long-secret"
        os.environ.pop("TUTORLY_ADMIN_EMAILS", None)
        app = FastAPI()
        app.include_router(auth_routes.router)
        client = TestClient(app)

        def login(email):
            response = verified_test_session(client, email)
            return response.json(), {"Authorization": "Bearer " + response.json()["session_token"]}

        def me(headers):
            response = client.get("/api/auth/me", headers=headers)
            assert response.status_code == 200, response.text
            return response.json()

        for grade in (1, 12):
            identity, headers = login(f"student{grade}@example.test")
            assert identity["onboarding_required"] and not identity["user"]["onboarding_completed"]
            # An old profile client cannot bypass role/age onboarding.
            draft = client.post("/api/auth/profile", headers=headers, json={"grade": str(grade), "board": "CBSE"})
            assert draft.status_code == 200 and me(headers)["onboarding_required"]
            response = client.post("/api/auth/onboarding", headers=headers, json={
                "role": "student", "full_name": f"Grade {grade} Student", "age": 6 if grade == 1 else 17,
                "grade": f"Grade {grade}", "board": "NCERT" if grade == 1 else "telangana", "school": "",
            })
            assert response.status_code == 200, response.text
            profile = response.json()
            assert not profile["onboarding_required"]
            assert profile["user"]["grade"] == str(grade)
            assert profile["user"]["board"] == ("CBSE" if grade == 1 else "telangana")
            assert profile["user"]["school"] == "" and profile["user"]["age"]
            returned, _ = login(f"student{grade}@example.test")
            assert not returned["onboarding_required"] and returned["user"]["id"] == identity["user"]["id"]
            assert returned["user"]["role"] == "student"
            checks += 2

        # Changing grades retains the canonical age and completion state.
        changed = client.post("/api/auth/profile", headers=headers, json={"grade": "Class 10", "board": "ICSE"})
        assert changed.status_code == 200 and changed.json()["age"] == 17
        assert me(headers)["user"]["board"] == "CISCE"
        assert not me(headers)["onboarding_required"]
        denied_role = client.post("/api/auth/onboarding", headers=headers, json={"role": "teacher", "full_name": "Changed Role"})
        assert denied_role.status_code == 409
        checks += 2

        incomplete, fresh = login("incomplete@example.test")
        for field, value in (("age", None), ("age", 4), ("age", 121), ("grade", "13"), ("board", "")):
            payload = {"role": "student", "full_name": "New Student", "age": 14, "grade": "9", "board": "CBSE"}
            payload[field] = value
            response = client.post("/api/auth/onboarding", headers=fresh, json=payload)
            assert response.status_code in (400, 422), response.text
            assert me(fresh)["onboarding_required"]
            checks += 1

        # Anonymous password registration does not query/disclose account existence.
        for email in ("incomplete@example.test", "unknown@example.test"):
            response = client.post("/api/auth/register", json={"email": email, "full_name": "No Ownership", "password": "strong-test-pass"})
            assert response.status_code == 401 and response.json()["detail"] == "Please log in to continue."
        checks += 1
        mismatch = client.post("/api/auth/register", headers=fresh, json={"email": "someoneelse@example.test", "full_name": "No Ownership", "password": "strong-test-pass"})
        assert mismatch.status_code == 403
        checks += 1

        teacher, tutor_headers = login("teacher@example.test")
        teacher_payload = {"role": "teacher", "full_name": "A Teacher", "subjects": ["Mathematics", "Science"],
                           "boards": ["CBSE", "ICSE", "telangana"], "grade_min": 4, "grade_max": 10,
                           "gender": "prefer_not_to_say", "teaching_personality": ["patient", "friendly"],
                           "preferred_days": ["fri", "mon"], "preferred_start_time": "18:00",
                           "preferred_end_time": "20:00", "consent": True}
        missing = client.post("/api/auth/onboarding", headers=tutor_headers, json=teacher_payload)
        assert missing.status_code == 400 and me(tutor_headers)["onboarding_required"]
        checks += 1

        upload_headers = {**tutor_headers, "Content-Type": "image/png", "X-Filename": "degree.png"}
        assert client.put("/api/auth/teacher-degree", content=PNG, headers={"Content-Type": "image/png", "X-Filename": "degree.png"}).status_code == 401
        assert client.get("/api/auth/teacher-degree").status_code == 401
        assert client.delete("/api/auth/teacher-degree").status_code == 401
        assert client.get("/api/auth/teacher-degree", headers=fresh).status_code == 404
        checks += 1
        for name, mime, content in (("degree.html", "text/html", b"<html>"), ("degree.png", "image/png", b"<script>"),
                                    ("..%2Fdegree.png", "image/png", PNG), ("degree.png", "image/jpeg", PNG)):
            response = client.put("/api/auth/teacher-degree", headers={**tutor_headers, "Content-Type": mime, "X-Filename": name}, content=content)
            assert response.status_code == 400, response.text
            checks += 1
        response = client.put("/api/auth/teacher-degree", headers=upload_headers, content=PNG + b"x" * auth_routes.DEGREE_MAX_BYTES)
        assert response.status_code == 413
        checks += 1
        # Also enforce the bound for streams without a Content-Length header.
        response = client.put("/api/auth/teacher-degree", headers=upload_headers, content=(chunk for chunk in [b"x" * (1024 * 1024)] * 6))
        assert response.status_code == 413
        checks += 1

        uploaded = client.put("/api/auth/teacher-degree", headers=upload_headers, content=PNG)
        assert uploaded.status_code == 200, uploaded.text
        degree = uploaded.json()["degree"]
        assert set(degree) == {"id", "name", "size", "content_type"}
        assert uploaded.json()["verification_status"] == "pending"
        assert me(fresh)["user"]["teacher_profile"]["degree"] is None
        retrieved = client.get("/api/auth/teacher-degree", headers=tutor_headers)
        assert retrieved.content == PNG and retrieved.headers["cache-control"] == "no-store"
        assert retrieved.headers["content-disposition"].startswith("attachment;")
        assert retrieved.headers["x-content-type-options"] == "nosniff"
        assert client.get("/api/auth/teacher-degree", headers=fresh).status_code == 404
        checks += 2

        for changes in ({"subjects": []}, {"boards": []}, {"grade_min": 11, "grade_max": 4}, {"grade_min": 0}, {"grade_max": 13}):
            bad = client.post("/api/auth/onboarding", headers=tutor_headers, json={**teacher_payload, **changes})
            assert bad.status_code == 400, bad.text
            checks += 1
        for changes in ({"gender": ""}, {"gender": "invalid"}, {"teaching_personality": []},
                        {"teaching_personality": ["unlisted"]}, {"preferred_days": []},
                        {"preferred_days": ["monday"]}, {"preferred_start_time": "25:00"},
                        {"preferred_start_time": "18:07"}, {"preferred_end_time": "18:00"},
                        {"preferred_end_time": "17:00"}, {"preferred_end_time": "20:15"}, {"consent": False}):
            bad = client.post("/api/auth/onboarding", headers=tutor_headers, json={**teacher_payload, **changes})
            assert bad.status_code == 400, bad.text
            assert me(tutor_headers)["onboarding_required"]
            checks += 1
        completed = client.post("/api/auth/onboarding", headers=tutor_headers, json={**teacher_payload, "verification_status": "verified"})
        assert completed.status_code == 200, completed.text
        saved_teacher = completed.json()["user"]
        assert not completed.json()["onboarding_required"] and saved_teacher["role"] == "teacher"
        assert saved_teacher["teacher_profile"]["verification_status"] == "pending"
        assert saved_teacher["teacher_profile"]["gender"] == "prefer_not_to_say"
        assert saved_teacher["teacher_profile"]["teaching_personality"] == ["patient", "friendly"]
        assert saved_teacher["teacher_profile"]["preferred_days"] == ["mon", "fri"]
        assert saved_teacher["teacher_profile"]["preferred_start_time"] == "18:00"
        assert saved_teacher["teacher_profile"]["preferred_end_time"] == "20:00"
        assert saved_teacher["teacher_profile"]["timezone"] == "Asia/Kolkata"
        assert saved_teacher["teacher_profile"]["consented_at"] > 0
        shortest = client.put("/api/auth/teacher-profile", headers=tutor_headers,
                              json={"preferred_start_time": "18:00", "preferred_end_time": "18:15"})
        assert shortest.status_code == 200, shortest.text
        longest = client.put("/api/auth/teacher-profile", headers=tutor_headers,
                             json={"preferred_start_time": "18:00", "preferred_end_time": "20:00"})
        assert longest.status_code == 200, longest.text
        assert client.put("/api/auth/teacher-profile", headers=tutor_headers,
                          json={"preferred_end_time": "20:15"}).status_code == 400
        checks += 3
        assert saved_teacher["teacher_profile"]["boards"] == ["CBSE", "CISCE", "telangana"]
        returned, _ = login("teacher@example.test")
        assert not returned["onboarding_required"] and returned["user"]["role"] == "teacher"
        assert returned["user"]["id"] == teacher["user"]["id"]
        try:
            auth_routes.require_role(tutor_headers["Authorization"], "teacher")
            raise AssertionError("Pending teachers must not receive trusted privileges")
        except HTTPException as error:
            assert error.status_code == 403
        checks += 3

        # Administrative approval is never exposed as a user-writable API.
        with auth_routes._connection() as connection:
            connection.execute("UPDATE tutorly_users SET teacher_verification_status = 'verified' WHERE id = ?", (teacher["user"]["id"],))
        assert auth_routes.require_role(tutor_headers["Authorization"], "teacher")["role"] == "teacher"
        edited = client.put("/api/auth/teacher-profile", headers=tutor_headers, json={"full_name": "Updated Teacher"})
        assert edited.status_code == 200 and edited.json()["user"]["teacher_profile"]["verification_status"] == "verified"
        assert client.post("/api/auth/profile", headers=tutor_headers, json={"grade": "9", "board": "CBSE"}).status_code == 400
        checks += 2
        replacement = client.put("/api/auth/teacher-degree", headers={**tutor_headers, "Content-Type": "application/pdf", "X-Filename": "degree.pdf"}, content=PDF)
        assert replacement.status_code == 200 and replacement.json()["degree"]["id"] != degree["id"]
        assert me(tutor_headers)["user"]["teacher_profile"]["verification_status"] == "pending"
        assert client.delete("/api/auth/teacher-degree", headers=tutor_headers).status_code == 200
        assert me(tutor_headers)["user"]["teacher_profile"]["degree"] is None
        assert client.get("/api/auth/teacher-degree", headers=tutor_headers).status_code == 404
        assert client.put("/api/auth/teacher-degree", headers={**headers, "Content-Type": "image/png", "X-Filename": "degree.png"}, content=PNG).status_code == 403
        checks += 3

        # Onboarding retry is harmless and cannot self-upgrade a finished teacher.
        retry = client.post("/api/auth/onboarding", headers=tutor_headers, json=teacher_payload)
        assert retry.status_code == 200 and retry.json()["user"]["full_name"] == "Updated Teacher"
        assert retry.json()["user"]["teacher_profile"]["verification_status"] == "pending"
        checks += 1

        # Wrong OTP attempts must survive the HTTP error transaction.
        with auth_routes._connection() as connection:
            connection.execute("INSERT INTO tutorly_login_otps(email, otp_hash, request_ip, created_at, expires_at) VALUES (?, ?, ?, 1, 9999999999)",
                               ("locked@example.test", auth_routes._hash_otp("locked@example.test", "123456"), "test"))
        for _ in range(5):
            assert client.post("/api/auth/verify-otp", json={"email": "locked@example.test", "code": "999999"}).status_code == 400
        assert client.post("/api/auth/verify-otp", json={"email": "locked@example.test", "code": "123456"}).status_code == 429
        checks += 1

        # Upgrade an actual legacy schema, preserving profile, prefs and sessions.
        legacy_path = Path(temporary) / "legacy.db"
        with closing(sqlite3.connect(legacy_path)) as connection:
            connection.executescript("""
                CREATE TABLE tutorly_users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, full_name TEXT,
                    role TEXT DEFAULT 'student', grade TEXT DEFAULT '', board TEXT DEFAULT '', school TEXT DEFAULT '',
                    academic_onboarding_completed INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
                INSERT INTO tutorly_users VALUES(1, 'old@example.test', 'Existing Student', 'student', '9', 'CBSE', 'Existing School', 1, 1, 1);
                INSERT INTO tutorly_users VALUES(2, 'old-teacher@example.test', 'Existing Teacher', 'teacher', '', '', '', 0, 1, 1);
                INSERT INTO tutorly_users VALUES(3, 'unfinished@example.test', 'Unfinished Student', 'student', '', '', '', 0, 1, 1);
            """)
        auth_routes.DATABASE_PATH = legacy_path
        with auth_routes._connection() as connection:
            for user_id in (1, 2, 3):
                payload = auth_routes._profile_payload(connection, user_id)
                assert payload["onboarding_required"] == (user_id == 3)
            old = auth_routes._profile_payload(connection, 1)["user"]
            assert old["full_name"] == "Existing Student" and old["school"] == "Existing School"
            assert old["age"] is None  # Do not force returning students through age onboarding.
        checks += 3
    print(f"Tutorly canonical onboarding, private degree, security and migration checks passed ({checks} cases).")


if __name__ == "__main__":
    main()
