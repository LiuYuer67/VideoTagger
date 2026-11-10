from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger("videotagger")

JobTarget = Callable[["Job"], Any]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"
    phase: str = "queued"
    progress: float = 0.0
    message: str = "Queued"
    result: Any = None
    error: str | None = None
    error_code: str | None = None
    created_at: str = field(default_factory=_utcnow_iso)
    updated_at: str = field(default_factory=_utcnow_iso)

    def update(
        self,
        *,
        progress: float | None = None,
        message: str | None = None,
        phase: str | None = None,
    ) -> None:
        if progress is not None:
            self.progress = max(0.0, min(100.0, round(float(progress), 2)))
        if message is not None:
            self.message = message
        if phase is not None:
            self.phase = phase
        self.updated_at = _utcnow_iso()

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "phase": self.phase,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "error_code": self.error_code,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def start(self, kind: str, target: JobTarget) -> Job:
        job = Job(id=uuid.uuid4().hex, kind=kind)
        with self._lock:
            self._prune_locked()
            self._jobs[job.id] = job

        def runner() -> None:
            job.status = "running"
            job.phase = "running"
            job.updated_at = _utcnow_iso()
            try:
                result = target(job)
                job.result = result
                job.status = "success"
                job.phase = "complete"
                job.progress = 100.0
                job.message = "Complete"
            except Exception as exc:  # noqa: BLE001 - jobs report failures to the UI
                from .errors import AppError

                if isinstance(exc, AppError):
                    job.error = exc.message
                    job.error_code = exc.code
                    logger.warning("%s job %s failed: %s", kind, job.id, exc.message)
                else:
                    job.error = "The operation failed unexpectedly. Check the server log for details."
                    job.error_code = "JOB_FAILED"
                    logger.exception("%s job %s crashed", kind, job.id)
                job.status = "error"
                job.phase = "error"
                job.message = job.error or "Failed"
            finally:
                job.updated_at = _utcnow_iso()

        threading.Thread(target=runner, name=f"videotagger-{kind}-{job.id[:6]}", daemon=True).start()
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _prune_locked(self) -> None:
        if len(self._jobs) < 100:
            return
        cutoff = time.time() - 60 * 60 * 4
        stale: list[str] = []
        for job_id, job in self._jobs.items():
            if job.status in {"success", "error"}:
                try:
                    updated = datetime.fromisoformat(job.updated_at).timestamp()
                except ValueError:
                    updated = 0
                if updated < cutoff:
                    stale.append(job_id)
        for job_id in stale:
            self._jobs.pop(job_id, None)
        if len(self._jobs) >= 100:
            finished = sorted(
                (
                    job
                    for job in self._jobs.values()
                    if job.status in {"success", "error"}
                ),
                key=lambda job: job.updated_at,
            )
            for job in finished[: max(1, len(self._jobs) - 80)]:
                self._jobs.pop(job.id, None)


jobs = JobManager()
