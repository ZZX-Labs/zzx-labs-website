#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


try:
    from PyQt5.QtWidgets import (
        QApplication,
        QCheckBox,
        QComboBox,
        QFormLayout,
        QGroupBox,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMessageBox,
        QPushButton,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
except ImportError:
    QApplication = None


APP_ROOT = Path(__file__).resolve().parents[3]
STARTUPS_DIR = APP_ROOT / "incubation" / "startups"
DATA_DIR = STARTUPS_DIR / "_data"
DATA_FILE = DATA_DIR / "startups.json"
TEMPLATE_FILE = STARTUPS_DIR / "_template" / "index.html"


TRACKS = [
    "Consulting / Publishing",
    "Bitcoin / Mining / Financial Technology",
    "Cybersecurity / OSINT / Cyber Warfare",
    "AI / Machine Learning / R&D",
    "Hardware / Drones / Robotics",
    "Science / Biology / Conservation",
    "Software / Web / API",
    "Other",
]

STAGES = [
    "Concept",
    "Research",
    "Prototype",
    "Validation",
    "Launch",
    "Scale",
    "Portfolio",
]

STATUSES = [
    "Placeholder",
    "Active",
    "Paused",
    "Private",
    "Public",
    "Renaming",
    "Reworking",
]

POSTURES = [
    "Public",
    "Private",
    "Stealth",
    "Open Source",
    "Hybrid",
    "Restricted",
]

FUNDING_DEFAULTS = [
    "Unfunded",
    "Internal",
    "Internal / Unfunded",
    "Donation",
    "Grant",
    "Sponsorship",
    "Investment",
    "Revenue",
    "Not Seeking Funding",
]

PLACEHOLDER_REPLACEMENTS = {
    "[Startup / Company Name]": "name",
    "[Startup Name]": "name",
    "[Track / Category]": "track",
    "[Track]": "track",
    "[Concept / Research / Prototype / Validation / Launch / Scale / Portfolio]": "stage",
    "[Placeholder / Active / Paused / Private / Public / Renaming / Reworking]": "status",
    "[Public / Private / Stealth / Open Source / Hybrid / Restricted]": "posture",
    "[Global / United States / India / EU / UK / Canada / Japan / Other]": "region",
    "[Global / US / India / EU / UK / Canada / Japan / Other]": "region",
    "[Unfunded / Internal / Donation / Grant / Sponsorship / Investment / Revenue]": "funding_status",
    "startup-slug": "slug",
}


SUMMARY_PLACEHOLDERS = [
    "[One clear paragraph describing what this company, startup, laboratory, service line, or venture concept is.\n            Explain what it builds, who it serves, and why it exists.]",
    "[Write a clear description of the venture. Explain what it is, what problem it solves, what technical domain\n            it belongs to, and how it fits inside ZZX-Labs R&D incubation.]",
]

MISSION_PLACEHOLDERS = [
    "[State the venture mission in practical terms. Avoid vague slogans. Explain the intended technical,\n            commercial, research, educational, scientific, security, or public-interest outcome.]",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = value.replace("+", "plus")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value)
    return value.strip("-")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON file: {path}\n{exc}") from exc


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")


def ensure_data_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if DATA_FILE.exists():
        return

    write_json(
        DATA_FILE,
        {
            "schema_version": "0.2.0",
            "updated_at": utc_now(),
            "startups": [],
        },
    )


def load_data() -> dict[str, Any]:
    ensure_data_file()

    data = read_json(DATA_FILE)

    if not isinstance(data.get("startups"), list):
        data["startups"] = []

    data.setdefault("schema_version", "0.2.0")
    data.setdefault("updated_at", utc_now())

    return data


def save_data(data: dict[str, Any]) -> None:
    data["updated_at"] = utc_now()
    write_json(DATA_FILE, data)


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
    profile_version: str = "0.2.0"


def validate_record(record: StartupRecord) -> list[str]:
    errors: list[str] = []

    if not record.name.strip():
        errors.append("Startup / company name is required.")

    if not record.slug.strip():
        errors.append("Slug is required.")

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", record.slug):
        errors.append("Slug must contain only lowercase letters, numbers, and hyphens.")

    if record.slug.startswith("_"):
        errors.append("Slug may not begin with underscore. Underscore directories are reserved.")

    if record.slug in {"index", "template", "assets", "data", "scripts", "schemas"}:
        errors.append(f"Slug is reserved: {record.slug}")

    if record.track not in TRACKS:
        errors.append(f"Unknown track: {record.track}")

    if record.stage not in STAGES:
        errors.append(f"Unknown stage: {record.stage}")

    if record.status not in STATUSES:
        errors.append(f"Unknown status: {record.status}")

    if record.posture not in POSTURES:
        errors.append(f"Unknown posture: {record.posture}")

    if not record.summary.strip():
        errors.append("Summary is required.")

    if not record.mission.strip():
        errors.append("Mission is required.")

    return errors


def backup_file(path: Path) -> Path | None:
    if not path.exists():
        return None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = path.with_suffix(path.suffix + f".bak-{stamp}")
    shutil.copy2(path, backup)
    return backup


def render_template(record: StartupRecord) -> str:
    if not TEMPLATE_FILE.exists():
        raise FileNotFoundError(f"Missing template: {TEMPLATE_FILE}")

    html = TEMPLATE_FILE.read_text(encoding="utf-8")
    record_map = asdict(record)

    for placeholder, field_name in PLACEHOLDER_REPLACEMENTS.items():
        html = html.replace(placeholder, str(record_map[field_name]))

    for placeholder in SUMMARY_PLACEHOLDERS:
        html = html.replace(placeholder, record.summary)

    for placeholder in MISSION_PLACEHOLDERS:
        html = html.replace(placeholder, record.mission)

    html = html.replace(
        "ZZX-Labs / Incubation / _template",
        f"ZZX-Labs / Incubation / {record.slug}",
    )

    html = html.replace(
        "This page is based on the ZZX-Labs R&D incubation startup profile template. Replace all bracketed fields,\n"
        "            remove template-only notices, and customize each section before using it as a public venture profile.",
        "This profile is part of the ZZX-Labs R&D incubation startup ecosystem. Names, stage, status, operating structure, and public posture may change as the venture matures.",
    )

    html = remove_developer_notice(html)

    return html


def remove_developer_notice(html: str) -> str:
    pattern = re.compile(
        r"\n\s*<section class=\"container zzx-panel\">\s*"
        r"\n\s*<p class=\"zzx-kicker\">Developer Notice</p>.*?"
        r"\n\s*</section>\s*",
        re.DOTALL,
    )
    return pattern.sub("\n", html, count=1)


def create_profile(record: StartupRecord, overwrite: bool = False, backup: bool = True) -> Path:
    target_dir = STARTUPS_DIR / record.slug
    target_file = target_dir / "index.html"

    if target_file.exists() and not overwrite:
        raise FileExistsError(f"Startup page already exists: {target_file}")

    target_dir.mkdir(parents=True, exist_ok=True)

    if target_file.exists() and backup:
        backup_file(target_file)

    target_file.write_text(render_template(record), encoding="utf-8")
    return target_file


def upsert_record(record: StartupRecord, overwrite: bool = False) -> None:
    data = load_data()
    records = data.setdefault("startups", [])

    existing_index = None
    for i, item in enumerate(records):
        if item.get("slug") == record.slug:
            existing_index = i
            break

    record_dict = asdict(record)

    if existing_index is not None:
        if not overwrite:
            raise FileExistsError(f"Startup slug already exists in data file: {record.slug}")

        existing = records[existing_index]
        record_dict["created_at"] = existing.get("created_at") or record.created_at
        record_dict["updated_at"] = utc_now()
        records[existing_index] = record_dict
    else:
        records.append(record_dict)

    records.sort(key=lambda item: (str(item.get("track", "")), str(item.get("name", "")).lower()))
    save_data(data)


def build_record(
    name: str,
    slug: str,
    track: str,
    stage: str,
    status: str,
    posture: str,
    region: str,
    funding_status: str,
    summary: str,
    mission: str,
    public_profile: bool = True,
    listed_in_directory: bool = True,
) -> StartupRecord:
    clean_name = name.strip()
    clean_slug = slugify(slug or clean_name)
    now = utc_now()

    return StartupRecord(
        name=clean_name,
        slug=clean_slug,
        track=track.strip(),
        stage=stage.strip(),
        status=status.strip(),
        posture=posture.strip(),
        region=region.strip() or "Global",
        funding_status=funding_status.strip() or "Unfunded",
        summary=summary.strip(),
        mission=mission.strip(),
        public_profile=public_profile,
        listed_in_directory=listed_in_directory,
        created_at=now,
        updated_at=now,
    )


class StartupSubmitter(QWidget):
    def __init__(self) -> None:
        super().__init__()

        self.setWindowTitle("ZZX-Labs Startup Submission Tool")
        self.setMinimumWidth(900)

        layout = QVBoxLayout()

        self.name = QLineEdit()
        self.slug = QLineEdit()
        self.region = QLineEdit("Global")

        self.funding = QComboBox()
        self.funding.addItems(FUNDING_DEFAULTS)
        self.funding.setEditable(True)
        self.funding.setCurrentText("Internal / Unfunded")

        self.track = QComboBox()
        self.track.addItems(TRACKS)

        self.stage = QComboBox()
        self.stage.addItems(STAGES)

        self.status = QComboBox()
        self.status.addItems(STATUSES)

        self.posture = QComboBox()
        self.posture.addItems(POSTURES)

        self.summary = QTextEdit()
        self.summary.setPlaceholderText("One concise paragraph describing what the venture does, who it serves, and why it exists.")

        self.mission = QTextEdit()
        self.mission.setPlaceholderText("Mission in practical terms. Avoid vague slogans. Explain the technical, commercial, research, scientific, security, or public-interest outcome.")

        self.public_profile = QCheckBox("Create public profile page")
        self.public_profile.setChecked(True)

        self.listed = QCheckBox("List in startup directory JSON")
        self.listed.setChecked(True)

        self.overwrite = QCheckBox("Overwrite existing startup page/data if slug already exists")
        self.overwrite.setChecked(False)

        self.backup_existing = QCheckBox("Backup existing page before overwrite")
        self.backup_existing.setChecked(True)

        self.name.textChanged.connect(self.autoslug)

        form = QFormLayout()
        form.addRow("Startup / Company Name", self.name)
        form.addRow("Slug", self.slug)
        form.addRow("Region", self.region)
        form.addRow("Funding Status", self.funding)

        row1 = QHBoxLayout()
        row1.addWidget(self.labeled("Track", self.track))
        row1.addWidget(self.labeled("Stage", self.stage))

        row2 = QHBoxLayout()
        row2.addWidget(self.labeled("Status", self.status))
        row2.addWidget(self.labeled("Posture", self.posture))

        options = QGroupBox("Output Options")
        options_layout = QVBoxLayout()
        options_layout.addWidget(self.public_profile)
        options_layout.addWidget(self.listed)
        options_layout.addWidget(self.overwrite)
        options_layout.addWidget(self.backup_existing)
        options.setLayout(options_layout)

        submit = QPushButton("Create / Update Startup Record + Page")
        submit.clicked.connect(self.submit)

        layout.addLayout(form)
        layout.addLayout(row1)
        layout.addLayout(row2)
        layout.addWidget(QLabel("Summary"))
        layout.addWidget(self.summary)
        layout.addWidget(QLabel("Mission"))
        layout.addWidget(self.mission)
        layout.addWidget(options)
        layout.addWidget(submit)

        self.setLayout(layout)

    def labeled(self, text: str, widget: QWidget) -> QWidget:
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
        record = build_record(
            name=self.name.text(),
            slug=self.slug.text(),
            track=self.track.currentText(),
            stage=self.stage.currentText(),
            status=self.status.currentText(),
            posture=self.posture.currentText(),
            region=self.region.text(),
            funding_status=self.funding.currentText(),
            summary=self.summary.toPlainText(),
            mission=self.mission.toPlainText(),
            public_profile=self.public_profile.isChecked(),
            listed_in_directory=self.listed.isChecked(),
        )

        errors = validate_record(record)

        if errors:
            QMessageBox.warning(self, "Validation Error", "\n".join(errors))
            return

        try:
            if record.listed_in_directory:
                upsert_record(record, overwrite=self.overwrite.isChecked())

            profile_path = None
            if record.public_profile:
                profile_path = create_profile(
                    record,
                    overwrite=self.overwrite.isChecked(),
                    backup=self.backup_existing.isChecked(),
                )

            message = f"Updated data:\n{DATA_FILE}"

            if profile_path:
                message += f"\n\nCreated / updated page:\n{profile_path}"

            QMessageBox.information(self, "Startup Saved", message)

        except Exception as exc:
            QMessageBox.critical(self, "Error", str(exc))


def cli_create(args: argparse.Namespace) -> int:
    record = build_record(
        name=args.name,
        slug=args.slug or args.name,
        track=args.track,
        stage=args.stage,
        status=args.status,
        posture=args.posture,
        region=args.region,
        funding_status=args.funding_status,
        summary=args.summary,
        mission=args.mission,
        public_profile=not args.no_profile,
        listed_in_directory=not args.no_list,
    )

    errors = validate_record(record)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if record.listed_in_directory:
        upsert_record(record, overwrite=args.overwrite)

    if record.public_profile:
        profile = create_profile(record, overwrite=args.overwrite, backup=not args.no_backup)
        print(f"Profile written: {profile}")

    print(f"Data written: {DATA_FILE}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create or update ZZX-Labs incubation startup records and pages."
    )

    parser.add_argument("--gui", action="store_true", help="Launch the PyQt5 desktop GUI.")
    parser.add_argument("--name", help="Startup / company name.")
    parser.add_argument("--slug", default="", help="Optional slug. Defaults to slugified name.")
    parser.add_argument("--track", choices=TRACKS, default="Other")
    parser.add_argument("--stage", choices=STAGES, default="Concept")
    parser.add_argument("--status", choices=STATUSES, default="Placeholder")
    parser.add_argument("--posture", choices=POSTURES, default="Public")
    parser.add_argument("--region", default="Global")
    parser.add_argument("--funding-status", default="Internal / Unfunded")
    parser.add_argument("--summary", default="")
    parser.add_argument("--mission", default="")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--no-profile", action="store_true")
    parser.add_argument("--no-list", action="store_true")

    return parser


def run_gui() -> int:
    if QApplication is None:
        print("ERROR: PyQt5 is not installed. Install with: pip install PyQt5", file=sys.stderr)
        return 1

    app = QApplication([])
    window = StartupSubmitter()
    window.show()
    return app.exec_()


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.gui or not args.name:
        return run_gui()

    return cli_create(args)


if __name__ == "__main__":
    raise SystemExit(main())
