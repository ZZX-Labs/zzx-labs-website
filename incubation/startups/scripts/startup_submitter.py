#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QTextEdit, QPushButton, QComboBox, QMessageBox, QCheckBox
)


APP_ROOT = Path(__file__).resolve().parents[3]
STARTUPS_DIR = APP_ROOT / "incubation" / "startups"
DATA_FILE = STARTUPS_DIR / "_data" / "startups.json"
TEMPLATE_FILE = STARTUPS_DIR / "_template" / "index.html"


TRACKS = [
    "Consulting / Publishing",
    "Bitcoin / Mining / Financial Technology",
    "Cybersecurity / OSINT / Cyber Warfare",
    "AI / Machine Learning / R&D",
    "Hardware / Drones / Robotics",
    "Science / Biology / Conservation",
    "Software / Web / API",
    "Other"
]

STAGES = [
    "Concept",
    "Research",
    "Prototype",
    "Validation",
    "Launch",
    "Scale",
    "Portfolio"
]

STATUSES = [
    "Placeholder",
    "Active",
    "Paused",
    "Private",
    "Public",
    "Renaming",
    "Reworking"
]

POSTURES = [
    "Public",
    "Private",
    "Stealth",
    "Open Source",
    "Hybrid",
    "Restricted"
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value)
    return value.strip("-")


def ensure_data_file() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    if not DATA_FILE.exists():
        DATA_FILE.write_text(
            json.dumps(
                {
                    "schema_version": "0.1.0",
                    "updated_at": utc_now(),
                    "startups": []
                },
                indent=4
            ),
            encoding="utf-8"
        )


def load_data() -> dict:
    ensure_data_file()
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_data(data: dict) -> None:
    data["updated_at"] = utc_now()
    DATA_FILE.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")


@dataclass
class StartupRecord:
    name: str
    slug: str
    track: str
    stage: str
    status: str
    posture: str
    region: str
    funding_status: str
    summary: str
    mission: str
    public_profile: bool
    listed_in_directory: bool
    created_at: str
    updated_at: str


def create_profile(record: StartupRecord) -> None:
    target_dir = STARTUPS_DIR / record.slug
    target_file = target_dir / "index.html"

    if target_file.exists():
        raise FileExistsError(f"Startup page already exists: {target_file}")

    if not TEMPLATE_FILE.exists():
        raise FileNotFoundError(f"Missing template: {TEMPLATE_FILE}")

    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TEMPLATE_FILE, target_file)

    html = target_file.read_text(encoding="utf-8")

    replacements = {
        "[Startup / Company Name]": record.name,
        "[Startup Name]": record.name,
        "[One clear paragraph describing what this company, startup, laboratory, service line, or venture concept is.\n            Explain what it builds, who it serves, and why it exists.]": record.summary,
        "[Track / Category]": record.track,
        "[Track]": record.track,
        "[Concept / Research / Prototype / Validation / Launch / Scale / Portfolio]": record.stage,
        "[Placeholder / Active / Paused / Private / Public / Renaming / Reworking]": record.status,
        "[Public / Private / Stealth / Open Source / Hybrid / Restricted]": record.posture,
        "[Global / United States / India / EU / UK / Canada / Japan / Other]": record.region,
        "[Global / US / India / EU / UK / Canada / Japan / Other]": record.region,
        "[Unfunded / Internal / Donation / Grant / Sponsorship / Investment / Revenue]": record.funding_status,
        "startup-slug": record.slug
    }

    for old, new in replacements.items():
        html = html.replace(old, new)

    html = html.replace(
        "[State the venture mission in practical terms. Avoid vague slogans. Explain the intended technical,\n            commercial, research, educational, scientific, security, or public-interest outcome.]",
        record.mission
    )

    html = html.replace(
        "ZZX-Labs / Incubation / _template",
        f"ZZX-Labs / Incubation / {record.slug}"
    )

    target_file.write_text(html, encoding="utf-8")


class StartupSubmitter(QWidget):
    def __init__(self) -> None:
        super().__init__()

        self.setWindowTitle("ZZX-Labs Startup Submission Tool")
        self.setMinimumWidth(760)

        layout = QVBoxLayout()

        self.name = QLineEdit()
        self.slug = QLineEdit()
        self.region = QLineEdit("Global")
        self.funding = QLineEdit("Internal / Unfunded")

        self.track = QComboBox()
        self.track.addItems(TRACKS)

        self.stage = QComboBox()
        self.stage.addItems(STAGES)

        self.status = QComboBox()
        self.status.addItems(STATUSES)

        self.posture = QComboBox()
        self.posture.addItems(POSTURES)

        self.summary = QTextEdit()
        self.mission = QTextEdit()

        self.public_profile = QCheckBox("Public profile")
        self.public_profile.setChecked(True)

        self.listed = QCheckBox("List in startup directory")
        self.listed.setChecked(True)

        self.name.textChanged.connect(self.autoslug)

        layout.addWidget(QLabel("Startup / Company Name"))
        layout.addWidget(self.name)

        layout.addWidget(QLabel("Slug"))
        layout.addWidget(self.slug)

        row1 = QHBoxLayout()
        row1.addWidget(self.labeled("Track", self.track))
        row1.addWidget(self.labeled("Stage", self.stage))
        layout.addLayout(row1)

        row2 = QHBoxLayout()
        row2.addWidget(self.labeled("Status", self.status))
        row2.addWidget(self.labeled("Posture", self.posture))
        layout.addLayout(row2)

        layout.addWidget(QLabel("Region"))
        layout.addWidget(self.region)

        layout.addWidget(QLabel("Funding Status"))
        layout.addWidget(self.funding)

        layout.addWidget(QLabel("Summary"))
        layout.addWidget(self.summary)

        layout.addWidget(QLabel("Mission"))
        layout.addWidget(self.mission)

        layout.addWidget(self.public_profile)
        layout.addWidget(self.listed)

        submit = QPushButton("Create Startup Record + Page")
        submit.clicked.connect(self.submit)
        layout.addWidget(submit)

        self.setLayout(layout)

    def labeled(self, text: str, widget):
        box = QWidget()
        layout = QVBoxLayout()
        layout.addWidget(QLabel(text))
        layout.addWidget(widget)
        box.setLayout(layout)
        return box

    def autoslug(self) -> None:
        if not self.slug.text().strip():
            self.slug.setText(slugify(self.name.text()))

    def submit(self) -> None:
        name = self.name.text().strip()
        slug = slugify(self.slug.text().strip() or name)

        if not name or not slug:
            QMessageBox.warning(self, "Missing Data", "Name and slug are required.")
            return

        record = StartupRecord(
            name=name,
            slug=slug,
            track=self.track.currentText(),
            stage=self.stage.currentText(),
            status=self.status.currentText(),
            posture=self.posture.currentText(),
            region=self.region.text().strip() or "Global",
            funding_status=self.funding.text().strip() or "Unfunded",
            summary=self.summary.toPlainText().strip(),
            mission=self.mission.toPlainText().strip(),
            public_profile=self.public_profile.isChecked(),
            listed_in_directory=self.listed.isChecked(),
            created_at=utc_now(),
            updated_at=utc_now()
        )

        if not record.summary:
            QMessageBox.warning(self, "Missing Summary", "Summary is required.")
            return

        if not record.mission:
            QMessageBox.warning(self, "Missing Mission", "Mission is required.")
            return

        try:
            data = load_data()

            if any(item.get("slug") == record.slug for item in data.get("startups", [])):
                QMessageBox.warning(self, "Duplicate Slug", f"Startup slug already exists: {record.slug}")
                return

            data.setdefault("startups", []).append(asdict(record))
            save_data(data)
            create_profile(record)

            QMessageBox.information(
                self,
                "Startup Created",
                f"Created:\n{STARTUPS_DIR / record.slug / 'index.html'}\n\nUpdated:\n{DATA_FILE}"
            )

        except Exception as exc:
            QMessageBox.critical(self, "Error", str(exc))


def main() -> int:
    app = QApplication([])
    window = StartupSubmitter()
    window.show()
    return app.exec_()


if __name__ == "__main__":
    raise SystemExit(main())
