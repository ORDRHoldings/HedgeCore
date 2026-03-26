"""NEXUS database schema: 28 tables across 7 domains + genesis seed."""
import sqlite3
from datetime import datetime, timezone

from ..constants import NEXUS_VERSION, SCHEMA_VERSION, GENESIS_HASH, AGENT_NAMES, AGENT_ROLES

SCHEMA_DDL = """
-- ═══════════════════════════════════════════════════════════════════════
-- Domain 1: Core Infrastructure
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _nexus_meta (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_chain (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    prev_hash    TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    chain_hash   TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    payload      TEXT,
    session_id   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT PRIMARY KEY,
    parent_id        TEXT REFERENCES sessions(id),
    status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','crashed','abandoned')),
    started_at       TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT,
    context_snapshot  TEXT,
    summary          TEXT,
    learnings        TEXT,
    chain_start_seq  INTEGER REFERENCES audit_chain(seq),
    chain_end_seq    INTEGER REFERENCES audit_chain(seq),
    files_touched    INTEGER DEFAULT 0,
    actions_count    INTEGER DEFAULT 0,
    patterns_found   INTEGER DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 2: Action/Outcome Tracking
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS actions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    agent        TEXT NOT NULL,
    action_type  TEXT NOT NULL,
    tool         TEXT,
    target       TEXT,
    description  TEXT,
    metadata     TEXT,
    chain_seq    INTEGER REFERENCES audit_chain(seq),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outcomes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id     INTEGER NOT NULL REFERENCES actions(id),
    outcome_type  TEXT NOT NULL CHECK(outcome_type IN ('test_pass','test_fail','user_accepted','user_rejected','regression','security_issue','build_success','build_fail')),
    details       TEXT,
    measured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    feedback_type   TEXT NOT NULL CHECK(feedback_type IN ('approve','reject','modify','correct')),
    context         TEXT,
    correction      TEXT,
    impact_on_learning TEXT,
    pattern_id      INTEGER REFERENCES patterns(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 3: Learning Engine
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patterns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type    TEXT NOT NULL CHECK(pattern_type IN ('good_practice','anti_pattern','correlation','workflow','preference')),
    description     TEXT NOT NULL,
    context         TEXT,
    confidence      REAL NOT NULL DEFAULT 0.5,
    evidence_count  INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'observation' CHECK(status IN ('observation','candidate','promoted','canon','deprecated')),
    first_seen      TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen       TEXT NOT NULL DEFAULT (datetime('now')),
    promoted_at     TEXT,
    source_sessions TEXT,
    metadata        TEXT
);

CREATE TABLE IF NOT EXISTS recommendations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id       INTEGER NOT NULL REFERENCES patterns(id),
    recommendation   TEXT NOT NULL,
    priority         TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    score            REAL NOT NULL DEFAULT 0.0,
    confidence       REAL NOT NULL DEFAULT 0.5,
    times_shown      INTEGER NOT NULL DEFAULT 0,
    times_applied    INTEGER NOT NULL DEFAULT 0,
    times_rejected   INTEGER NOT NULL DEFAULT 0,
    effectiveness    REAL,
    context_filter   TEXT,
    expires_at       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_shown_at    TEXT
);

CREATE TABLE IF NOT EXISTS learning_metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,
    pattern_count   INTEGER NOT NULL DEFAULT 0,
    confidence_avg  REAL NOT NULL DEFAULT 0.0,
    hit_rate        REAL NOT NULL DEFAULT 0.0,
    new_patterns    INTEGER NOT NULL DEFAULT 0,
    promotions      INTEGER NOT NULL DEFAULT 0,
    deprecations    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS effectiveness (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recommendation_id INTEGER NOT NULL REFERENCES recommendations(id),
    measurement_type  TEXT NOT NULL CHECK(measurement_type IN ('quality','speed','accuracy','user_satisfaction')),
    before_value      REAL NOT NULL,
    after_value       REAL NOT NULL,
    delta             REAL GENERATED ALWAYS AS (after_value - before_value) STORED,
    measured_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 4: Knowledge Graph
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kg_entities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('file','function','class','module','concept','decision','pattern','risk','agent')),
    name        TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entity_type, name)
);

CREATE TABLE IF NOT EXISTS kg_edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES kg_entities(id),
    target_id   INTEGER NOT NULL REFERENCES kg_entities(id),
    relation    TEXT NOT NULL CHECK(relation IN ('imports','calls','modifies','tests','depends_on','freezes','owns','relates_to','supersedes')),
    weight      REAL NOT NULL DEFAULT 1.0,
    metadata    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, relation)
);

CREATE TABLE IF NOT EXISTS file_facts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT NOT NULL UNIQUE,
    purpose      TEXT,
    owner_agent  TEXT,
    complexity   TEXT CHECK(complexity IN ('low','medium','high','critical')),
    test_coverage REAL,
    dependencies TEXT,
    last_modified TEXT NOT NULL DEFAULT (datetime('now')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 5: Agent Operations
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','suspended')),
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_failed    INTEGER NOT NULL DEFAULT 0,
    success_rate    REAL GENERATED ALWAYS AS (
        CASE WHEN (tasks_completed + tasks_failed) > 0
        THEN CAST(tasks_completed AS REAL) / (tasks_completed + tasks_failed)
        ELSE 0.0 END
    ) STORED,
    specializations TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_activity (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    agent_name   TEXT NOT NULL REFERENCES agents(name),
    task         TEXT NOT NULL,
    outcome      TEXT CHECK(outcome IN ('success','failure','partial','escalated')),
    confidence   REAL,
    files_touched TEXT,
    escalated_to TEXT,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at     TEXT
);

CREATE TABLE IF NOT EXISTS agent_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    from_agent   TEXT NOT NULL,
    to_agent     TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK(message_type IN ('request','response','escalation','handoff','verdict','notification')),
    subject      TEXT NOT NULL,
    body         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decisions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT REFERENCES sessions(id),
    title             TEXT NOT NULL,
    options_considered TEXT,
    rationale         TEXT NOT NULL,
    decided_by        TEXT NOT NULL,
    approved_by       TEXT,
    status            TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','implemented','superseded','rejected')),
    supersedes        INTEGER REFERENCES decisions(id),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 6: Quality & Risk
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS validation_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT REFERENCES sessions(id),
    run_type     TEXT NOT NULL CHECK(run_type IN ('test','lint','build','security','review','type_check')),
    result       TEXT NOT NULL CHECK(result IN ('pass','fail','warning','error','skip')),
    evidence     TEXT,
    duration_ms  INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_metrics (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,
    test_count   INTEGER DEFAULT 0,
    pass_rate    REAL DEFAULT 0.0,
    lint_issues  INTEGER DEFAULT 0,
    build_time_ms INTEGER,
    coverage     REAL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS risks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    severity    TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
    category    TEXT NOT NULL CHECK(category IN ('security','quality','architecture','performance','data','operational')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','mitigated','accepted','closed')),
    owner_agent TEXT,
    mitigation  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS architecture_freeze (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    component       TEXT NOT NULL UNIQUE,
    frozen_at       TEXT NOT NULL DEFAULT (datetime('now')),
    reason          TEXT NOT NULL,
    override_requires TEXT NOT NULL DEFAULT 'architect+commander',
    last_verified   TEXT NOT NULL DEFAULT (datetime('now')),
    frozen_by       TEXT NOT NULL DEFAULT 'architect'
);

-- ═══════════════════════════════════════════════════════════════════════
-- Domain 7: Self-Healing
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integrity_checks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    check_type  TEXT NOT NULL,
    frequency   TEXT NOT NULL DEFAULT 'session_start' CHECK(frequency IN ('session_start','on_demand','hourly','daily')),
    auto_repair INTEGER NOT NULL DEFAULT 0,
    last_run    TEXT,
    last_result TEXT CHECK(last_result IN ('pass','fail','repaired','escalated')),
    enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS healing_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id      INTEGER NOT NULL REFERENCES integrity_checks(id),
    session_id    TEXT REFERENCES sessions(id),
    issue         TEXT NOT NULL,
    action_taken  TEXT NOT NULL,
    verified_after INTEGER NOT NULL DEFAULT 0,
    chain_seq     INTEGER REFERENCES audit_chain(seq),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done','cancelled')),
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    assigned_to TEXT,
    parent_id   INTEGER REFERENCES work_items(id),
    session_id  TEXT REFERENCES sessions(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

-- ═══════════════════════════════════════════════════════════════════════
-- WORM Triggers (audit_chain + healing_log)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TRIGGER IF NOT EXISTS audit_chain_no_update
    BEFORE UPDATE ON audit_chain
    BEGIN SELECT RAISE(ABORT, 'WORM: audit_chain rows cannot be updated'); END;

CREATE TRIGGER IF NOT EXISTS audit_chain_no_delete
    BEFORE DELETE ON audit_chain
    BEGIN SELECT RAISE(ABORT, 'WORM: audit_chain rows cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS healing_log_no_update
    BEFORE UPDATE ON healing_log
    BEGIN SELECT RAISE(ABORT, 'WORM: healing_log rows cannot be updated'); END;

CREATE TRIGGER IF NOT EXISTS healing_log_no_delete
    BEFORE DELETE ON healing_log
    BEGIN SELECT RAISE(ABORT, 'WORM: healing_log rows cannot be deleted'); END;

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_actions_session ON actions(session_id);
CREATE INDEX IF NOT EXISTS idx_actions_agent ON actions(agent);
CREATE INDEX IF NOT EXISTS idx_outcomes_action ON outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_patterns_status ON patterns(status);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_recommendations_score ON recommendations(score);
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_session ON agent_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_audit_chain_session ON audit_chain(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(session_id);
"""


def create_schema(conn: sqlite3.Connection) -> None:
    """Create all 28 tables + WORM triggers + indexes."""
    conn.executescript(SCHEMA_DDL)


def seed_genesis(conn: sqlite3.Connection) -> None:
    """Seed the genesis row in audit_chain and meta."""
    now = datetime.now(timezone.utc).isoformat()

    # Genesis audit chain entry
    existing = conn.execute("SELECT seq FROM audit_chain WHERE seq = 1").fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO audit_chain (prev_hash, payload_hash, chain_hash, event_type, payload) "
            "VALUES (?, ?, ?, 'genesis', 'NEXUS genesis')",
            (GENESIS_HASH, GENESIS_HASH, GENESIS_HASH),
        )

    # Meta entries
    meta = [
        ("schema_version", str(SCHEMA_VERSION)),
        ("nexus_version", NEXUS_VERSION),
        ("created_at", now),
        ("last_init", now),
    ]
    for key, value in meta:
        conn.execute(
            "INSERT OR REPLACE INTO _nexus_meta (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, now),
        )


def seed_agents(conn: sqlite3.Connection) -> None:
    """Seed agent registry."""
    for name in AGENT_NAMES:
        role = AGENT_ROLES[name]
        conn.execute(
            "INSERT OR IGNORE INTO agents (name, role) VALUES (?, ?)",
            (name, role),
        )


def seed_integrity_checks(conn: sqlite3.Connection) -> None:
    """Seed the 12 integrity check definitions."""
    checks = [
        ("hash_chain_integrity", "hash_chain", "session_start", 0),
        ("state_files_exist", "file_existence", "session_start", 1),
        ("state_files_fresh", "state_consistency", "session_start", 1),
        ("schema_version_match", "schema_integrity", "session_start", 1),
        ("orphan_sessions", "state_consistency", "session_start", 1),
        ("hook_compilation", "hook_compile", "session_start", 0),
        ("settings_valid_json", "config_valid", "session_start", 0),
        ("agent_definitions_exist", "file_existence", "session_start", 1),
        ("kg_orphaned_edges", "reference_integrity", "on_demand", 1),
        ("worm_triggers_exist", "schema_integrity", "session_start", 0),
        ("recommendation_ttl", "state_consistency", "session_start", 1),
        ("permissions_valid", "permission_valid", "session_start", 0),
    ]
    for name, check_type, freq, auto in checks:
        conn.execute(
            "INSERT OR IGNORE INTO integrity_checks (name, check_type, frequency, auto_repair) "
            "VALUES (?, ?, ?, ?)",
            (name, check_type, freq, auto),
        )


def initialize_database(conn: sqlite3.Connection) -> None:
    """Full initialization: schema + seeds."""
    create_schema(conn)
    seed_genesis(conn)
    seed_agents(conn)
    seed_integrity_checks(conn)
