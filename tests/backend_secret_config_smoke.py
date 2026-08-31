from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend import main as backend_main


SECRET_NAMES = ("SARVAM_API_KEY", "ELEVENLABS_API_KEY")


def example_value(path: Path, name: str) -> str:
    matches = [
        line.split("=", 1)[1]
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.startswith(f"{name}=")
    ]
    assert len(matches) == 1, f"{path} must contain exactly one {name} entry"
    return matches[0]


def check_examples() -> None:
    for path in (PROJECT_DIR / ".env.example", PROJECT_DIR / "backend" / ".env.example"):
        for name in SECRET_NAMES:
            assert example_value(path, name) == "", f"{name} must remain empty in {path}"


def check_git_ignores() -> None:
    secret_paths = (
        ".env",
        ".env.local",
        ".env.production",
        "backend/.env",
        "backend/.env.production",
        "backend/production.env",
        "backend/production.env.local",
    )
    for secret_path in secret_paths:
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "--quiet", secret_path],
            cwd=PROJECT_DIR,
            check=False,
        )
        assert result.returncode == 0, f"Git must ignore {secret_path}"

    tracked = subprocess.check_output(
        ["git", "ls-files"],
        cwd=PROJECT_DIR,
        text=True,
        encoding="utf-8",
    ).splitlines()
    tracked_secret_envs = [
        path for path in tracked
        if Path(path).name.startswith(".env") and Path(path).name != ".env.example"
    ]
    assert tracked_secret_envs == [], f"Secret env files are tracked: {tracked_secret_envs}"


def check_backend_environment_reads() -> None:
    original = {name: os.environ.get(name) for name in SECRET_NAMES}
    try:
        for name in SECRET_NAMES:
            os.environ.pop(name, None)
        assert backend_main.missing_provider_keys() == SECRET_NAMES

        os.environ["SARVAM_API_KEY"] = "test-value-not-a-real-key"
        assert backend_main.missing_provider_keys() == ("ELEVENLABS_API_KEY",)
        os.environ["ELEVENLABS_API_KEY"] = "test-value-not-a-real-key"
        assert backend_main.missing_provider_keys() == ()
    finally:
        for name, value in original.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    routes = (PROJECT_DIR / "backend" / "chatbot" / "routes.py").read_text(encoding="utf-8")
    vision = (PROJECT_DIR / "backend" / "chatbot" / "sarvam_vision.py").read_text(encoding="utf-8")
    assert 'os.getenv("ELEVENLABS_API_KEY", "")' in routes
    assert 'os.getenv("SARVAM_API_KEY", "")' in vision
    assert "xi-api-key" in routes
    assert "api-subscription-key" in vision


def check_frontend_isolation() -> None:
    frontend_files = list(PROJECT_DIR.glob("*.html")) + list((PROJECT_DIR / "js").rglob("*.js"))
    for path in frontend_files:
        source = path.read_text(encoding="utf-8", errors="ignore")
        for name in SECRET_NAMES:
            assert name not in source, f"{name} must not appear in frontend file {path}"


def main() -> None:
    check_examples()
    check_git_ignores()
    check_backend_environment_reads()
    check_frontend_isolation()
    print("Tutorly backend secret configuration checks passed.")


if __name__ == "__main__":
    main()
