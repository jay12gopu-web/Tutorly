"""Loopback-only browser test harness with an isolated DB and captured test mail.

Run directly, never from the deployed backend. No messages go to a real inbox.
"""
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def run():
    from backend import auth_routes
    mailbox = {}
    with tempfile.TemporaryDirectory() as directory:
        auth_routes.DATABASE_PATH = Path(directory) / "auth-browser-test.db"
        auth_routes._otp_secret = lambda: b"test-browser-mailbox-only-not-production"
        auth_routes._smtp_config = lambda: {}
        auth_routes._send_otp_email = lambda email, code: mailbox.update({email: code})
        auth_routes.provider_configs = lambda: {
            name: SimpleNamespace(provider=name, label=name.title(), enabled=False)
            for name in ("google", "microsoft", "apple")
        }
        app = FastAPI()
        app.include_router(auth_routes.router)
        for folder in ("js", "css", "assets", "shared", "data"):
            app.mount(f"/{folder}", StaticFiles(directory=ROOT / folder))

        @app.get("/__test__/mail")
        def mail(email: str):
            return {"code": mailbox.get(email)}

        @app.get("/{page}")
        def html(page: str):
            if page not in {"login.html", "sign_up.html", "info.html", "maths_gpt.html", "teacher-workspace.html", "profile.html", "Terms_Conditions.html", "privacy.html"}:
                raise HTTPException(404)
            html = (ROOT / page).read_text(encoding="utf-8")
            # Test-only same-origin API wiring. Never shipped in production HTML.
            return HTMLResponse(html.replace("<head>", '<head><script>window.TUTORLY_BACKEND_ORIGIN=location.origin;</script>', 1), headers={
                "Cache-Control": "no-store",
                "Content-Security-Policy": "connect-src 'self'; frame-src 'self' blob:; object-src 'none'",
            })

        uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False, log_level="warning")


if __name__ == "__main__":
    run()
