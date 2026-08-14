import sqlite3
from unittest.mock import patch

import pytest

from bosshunter.ai.scorer import score_jobs
from bosshunter.db import (
    JobDeletionConflictError,
    add_history,
    get_db,
    get_jobs_by_status,
    get_jobs_pending_confirmation,
    get_jobs_ready_to_send,
    insert_job,
    job_exists,
    permanent_delete_jobs,
    query_jobs,
    restore_jobs,
    soft_delete_jobs,
    update_job_greeting,
    update_job_score,
    update_job_status,
)


def _job(job_id: str) -> dict:
    return {
        "id": job_id,
        "title": "Engineer",
        "company": "Example",
        "salary": "10-20K",
        "city": "北京",
        "experience": "1-3 years",
        "jd": "Build product features",
        "hr_name": "HR",
        "hr_title": "Recruiter",
        "hr_active": "active",
        "company_size": "100-499",
        "company_industry": "Software",
        "url": f"https://example.com/jobs/{job_id}",
    }


def test_legacy_database_migrates_without_rewriting_job_data(tmp_path):
    db_path = tmp_path / "legacy.db"
    legacy = sqlite3.connect(db_path)
    legacy.executescript(
        """
        CREATE TABLE jobs (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL,
            salary TEXT, city TEXT, experience TEXT, jd TEXT, hr_name TEXT,
            hr_title TEXT, hr_active TEXT, company_size TEXT, company_industry TEXT,
            url TEXT, score INTEGER DEFAULT 0, score_reason TEXT, greeting TEXT,
            status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
            action TEXT NOT NULL, detail TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE risk_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL,
            detail TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO jobs (id, title, company, city, url, score, greeting, status)
        VALUES ('legacy', 'Legacy Job', 'Legacy Co', '北京', 'https://example.com/legacy', 77, 'hello', 'ready');
        """
    )
    legacy.commit()
    legacy.close()

    db = get_db(db_path)
    try:
        columns = {row[1] for row in db.execute("PRAGMA table_info(jobs)").fetchall()}
        row = dict(db.execute("SELECT * FROM jobs WHERE id = 'legacy'").fetchone())
        assert {"deleted_at", "deleted_reason"} <= columns
        assert row["title"] == "Legacy Job"
        assert row["score"] == 77
        assert row["greeting"] == "hello"
        assert row["deleted_at"] is None
    finally:
        db.close()


def test_soft_deleted_jobs_leave_all_operational_queues_and_do_not_recollect(tmp_path):
    db = get_db(tmp_path / "delete.db")
    job = _job("deleted-pending")
    try:
        insert_job(db, job)
        soft_delete_jobs(db, [job["id"]], confirmed=True)

        assert get_jobs_by_status(db, "pending") == []
        assert get_jobs_pending_confirmation(db) == []
        assert get_jobs_ready_to_send(db) == []
        assert query_jobs(db, deleted="active")[1] == 0
        assert query_jobs(db, deleted="only")[1] == 1
        assert job_exists(db, job["id"]) is True
        insert_job(db, job)
        assert query_jobs(db, deleted="only")[1] == 1
    finally:
        db.close()


def test_scoring_never_selects_soft_deleted_pending_jobs(tmp_path):
    db_path = tmp_path / "score-delete.db"
    db = get_db(db_path)
    try:
        insert_job(db, _job("deleted-score"))
        soft_delete_jobs(db, ["deleted-score"], confirmed=True)
    finally:
        db.close()

    with patch("bosshunter.ai.scorer.get_db", side_effect=lambda: get_db(db_path)), \
         patch("bosshunter.ai.scorer._load_resume", return_value="resume"), \
         patch("bosshunter.ai.scorer._request_score") as request_score:
        assert score_jobs({"scoring": {"threshold": 60}}) == (0, 0)

    request_score.assert_not_called()


def test_restore_preserves_business_fields_and_history(tmp_path):
    db = get_db(tmp_path / "restore.db")
    try:
        insert_job(db, _job("restore"))
        update_job_score(db, "restore", 88, "good match")
        update_job_greeting(db, "restore", "hello")
        update_job_status(db, "restore", "approved")
        before = dict(db.execute("SELECT * FROM jobs WHERE id = 'restore'").fetchone())
        soft_delete_jobs(db, ["restore"], confirmed=True, reason="test")
        result = restore_jobs(db, ["restore"], confirmed=True)
        after = dict(db.execute("SELECT * FROM jobs WHERE id = 'restore'").fetchone())
        actions = {row["action"] for row in db.execute("SELECT action FROM history WHERE job_id = 'restore'").fetchall()}
    finally:
        db.close()

    assert result["affected_count"] == 1
    assert after["status"] == before["status"]
    assert after["score"] == before["score"]
    assert after["greeting"] == before["greeting"]
    assert after["deleted_at"] is None
    assert {"soft_deleted", "restored"} <= actions


def test_permanent_delete_is_atomic_and_protects_delivery_history(tmp_path):
    db = get_db(tmp_path / "permanent.db")
    try:
        for job_id in ("safe", "protected"):
            insert_job(db, _job(job_id))
        update_job_status(db, "protected", "sent")
        add_history(db, "protected", "sent", "delivery evidence")
        soft_delete_jobs(db, ["safe", "protected"], confirmed=True)

        with pytest.raises(JobDeletionConflictError):
            permanent_delete_jobs(
                db,
                ["safe", "protected"],
                confirmed=True,
                confirmation="PERMANENT_DELETE",
            )
        assert db.execute("SELECT 1 FROM jobs WHERE id = 'safe'").fetchone() is not None

        result = permanent_delete_jobs(db, ["safe"], confirmed=True, confirmation="PERMANENT_DELETE")
        assert result["affected_count"] == 1
        assert db.execute("SELECT 1 FROM jobs WHERE id = 'safe'").fetchone() is None
    finally:
        db.close()
