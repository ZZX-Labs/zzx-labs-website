#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PyQt5.QtCore import QProcess, Qt, QTimer
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import (
    QApplication,
    QCheckBox,
    QFileDialog,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


TOOLS_DIR = Path(__file__).resolve().parent
APP_ROOT = TOOLS_DIR.parents[1]

CLI = TOOLS_DIR / "bitnodes-cli.py"
CRAWLER = TOOLS_DIR / "crawl.py"
ENRICH = TOOLS_DIR / "enrich.py"
MAPS = TOOLS_DIR / "maps.py"
BUILD_GEO_INDEXES = TOOLS_DIR / "build_geo_indexes.py"

API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

ZZX_LATEST = API_DIR / "zzxbitnodes" / "latest.json"
ZZX_NODES = API_DIR / "zzxbitnodes" / "nodes.json"
ORIGINAL_LATEST = API_DIR / "originalbitnodes" / "latest.json"
ORIGINAL_NODES = API_DIR / "originalbitnodes" / "nodes.json"

ENRICHED_DIR = API_DIR / "enriched"
ENRICHED_LATEST = ENRICHED_DIR / "latest.json"
ENRICHMENT_REPORT = ENRICHED_DIR / "enrichment-report.json"

MAP_REPORT = MAP_DIR / "data" / "map-build-report.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def count_nodes(payload: Any) -> int:
    if isinstance(payload, list):
        return len(payload)

    if not isinstance(payload, dict):
        return 0

    for key in (
        "nodes",
        "results",
        "rows",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return len(value)

        if isinstance(value, dict):
            return len(value)

    return 0


def extract_node_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]

    if not isinstance(payload, dict):
        return []

    for key in (
        "nodes",
        "results",
        "rows",
        "data",
        "reachable",
        "unreachable",
        "node_records",
        "peers",
    ):
        value = payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

        if isinstance(value, dict):
            rows = []

            for address, data in value.items():
                if isinstance(data, dict):
                    rows.append({"address": address, **data})
                elif isinstance(data, list):
                    rows.append({
                        "address": address,
                        "status": data[0] if len(data) > 0 else None,
                        "protocol": data[1] if len(data) > 1 else None,
                        "agent": data[2] if len(data) > 2 else None,
                        "height": data[3] if len(data) > 3 else None,
                        "services": data[4] if len(data) > 4 else None,
                        "timestamp": data[5] if len(data) > 5 else None,
                    })
                else:
                    rows.append({"address": address, "value": data})

            return rows

    return []


def node_address(row: dict[str, Any]) -> str:
    return str(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("host")
        or ""
    ).lower()


def count_matching(rows: list[dict[str, Any]], predicate) -> int:
    return sum(1 for row in rows if predicate(row))


def summarize_payload(path: Path) -> dict[str, int]:
    payload = read_json(path, fallback={})
    rows = extract_node_rows(payload)

    return {
        "total": len(rows) or count_nodes(payload),
        "reachable": count_matching(rows, lambda row: bool(row.get("reachable") is True or row.get("status") in {"reachable", "ok", 1, True})),
        "unreachable": count_matching(rows, lambda row: bool(row.get("reachable") is False or row.get("status") in {"unreachable", "fail", 0, False})),
        "ipv4": count_matching(rows, lambda row: bool(row.get("is_ipv4") or (node_address(row).count(".") == 3 and ":" not in node_address(row)))),
        "ipv6": count_matching(rows, lambda row: bool(row.get("is_ipv6") or (":" in node_address(row) and ".onion" not in node_address(row) and ".i2p" not in node_address(row)))),
        "tor": count_matching(rows, lambda row: bool(row.get("is_tor") or ".onion" in node_address(row))),
        "i2p": count_matching(rows, lambda row: bool(row.get("is_i2p") or ".i2p" in node_address(row))),
        "vpn": count_matching(rows, lambda row: bool(row.get("is_vpn") or row.get("vpn", {}).get("is_vpn"))),
        "proxy": count_matching(rows, lambda row: bool(row.get("is_proxy") or row.get("proxy", {}).get("is_proxy"))),
        "policy_restricted": count_matching(rows, lambda row: bool(row.get("is_policy_restricted_node"))),
    }


class BitnodesWindow(QMainWindow):

    def __init__(self) -> None:
        super().__init__()

        self.process: QProcess | None = None

        self.setWindowTitle("ZZX-Labs Bitnodes Controller")
        self.resize(1320, 880)

        self.setup_ui()

        self.timer = QTimer()
        self.timer.timeout.connect(self.refresh_status)
        self.timer.start(15000)

        self.refresh_status()

    def setup_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)

        layout = QVBoxLayout(root)

        self.status_label = QLabel("ZZX-Labs Bitnodes daemon controller")
        self.status_label.setAlignment(Qt.AlignLeft)
        self.status_label.setStyleSheet(
            """
            font-size: 18px;
            font-weight: bold;
            padding: 8px;
            color: #c0d674;
            """
        )
        layout.addWidget(self.status_label)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        self.setup_control_tab()
        self.setup_stats_tab()
        self.setup_output_tab()

    def setup_control_tab(self) -> None:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        crawl_group = QGroupBox("Crawler")
        crawl_layout = QGridLayout(crawl_group)

        self.limit_spin = QSpinBox()
        self.limit_spin.setRange(1, 500000)
        self.limit_spin.setValue(5000)

        self.interval_spin = QSpinBox()
        self.interval_spin.setRange(10, 86400)
        self.interval_spin.setValue(900)

        self.workers_spin = QSpinBox()
        self.workers_spin.setRange(1, 2048)
        self.workers_spin.setValue(256)

        self.git_push_checkbox = QCheckBox("Git Push")
        self.git_push_checkbox.setChecked(True)

        crawl_layout.addWidget(QLabel("Nodes"), 0, 0)
        crawl_layout.addWidget(self.limit_spin, 0, 1)
        crawl_layout.addWidget(QLabel("Workers"), 0, 2)
        crawl_layout.addWidget(self.workers_spin, 0, 3)
        crawl_layout.addWidget(QLabel("Interval"), 0, 4)
        crawl_layout.addWidget(self.interval_spin, 0, 5)
        crawl_layout.addWidget(self.git_push_checkbox, 0, 6)

        layout.addWidget(crawl_group)

        map_group = QGroupBox("Map / Enrichment")
        map_layout = QGridLayout(map_group)

        self.enrich_w3w_checkbox = QCheckBox("Enable W3W Fallback")
        self.enrich_w3w_checkbox.setChecked(True)

        self.enrich_geohash_checkbox = QCheckBox("Enable GeoHashID")
        self.enrich_geohash_checkbox.setChecked(True)

        self.enrich_policy_checkbox = QCheckBox("Enable Policy Classification")
        self.enrich_policy_checkbox.setChecked(True)

        self.map_theme_label = QLabel("Theme: zzx_dark_olive")
        self.map_settings_label = QLabel("Settings: default")

        map_layout.addWidget(self.enrich_w3w_checkbox, 0, 0)
        map_layout.addWidget(self.enrich_geohash_checkbox, 0, 1)
        map_layout.addWidget(self.enrich_policy_checkbox, 0, 2)
        map_layout.addWidget(self.map_theme_label, 1, 0)
        map_layout.addWidget(self.map_settings_label, 1, 1)

        layout.addWidget(map_group)

        buttons = QHBoxLayout()

        self.start_button = QPushButton("Start Daemon")
        self.stop_button = QPushButton("Stop Daemon")
        self.once_button = QPushButton("Run Crawl Once")
        self.enrich_button = QPushButton("Enrich Latest")
        self.maps_button = QPushButton("Build Maps")
        self.geo_button = QPushButton("Build Geo Indexes")
        self.status_button = QPushButton("Refresh Status")
        self.clone_button = QPushButton("Clone Original")
        self.export_button = QPushButton("Export Once")
        self.open_api_button = QPushButton("Open API Folder")
        self.open_maps_button = QPushButton("Open Maps Folder")
        self.clear_button = QPushButton("Clear Log")

        self.start_button.clicked.connect(self.start_daemon)
        self.stop_button.clicked.connect(self.stop_daemon)
        self.once_button.clicked.connect(self.run_once)
        self.enrich_button.clicked.connect(self.enrich_latest)
        self.maps_button.clicked.connect(self.build_maps)
        self.geo_button.clicked.connect(self.build_geo_indexes)
        self.status_button.clicked.connect(self.refresh_status)
        self.clone_button.clicked.connect(lambda: self.run_cli(["clone"]))
        self.export_button.clicked.connect(lambda: self.run_cli(["export-once"]))
        self.open_api_button.clicked.connect(lambda: self.open_folder(API_DIR))
        self.open_maps_button.clicked.connect(lambda: self.open_folder(MAP_DIR))
        self.clear_button.clicked.connect(self.output.clear)

        for button in (
            self.start_button,
            self.stop_button,
            self.once_button,
            self.enrich_button,
            self.maps_button,
            self.geo_button,
            self.status_button,
            self.clone_button,
            self.export_button,
            self.open_api_button,
            self.open_maps_button,
            self.clear_button,
        ):
            buttons.addWidget(button)

        layout.addLayout(buttons)
        layout.addStretch()

        self.tabs.addTab(tab, "Control")

    def setup_stats_tab(self) -> None:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        self.stats_text = QTextEdit()
        self.stats_text.setReadOnly(True)
        self.stats_text.setFont(QFont("IBM Plex Mono", 10))

        layout.addWidget(self.stats_text)

        self.tabs.addTab(tab, "Stats")

    def setup_output_tab(self) -> None:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setFont(QFont("IBM Plex Mono", 10))

        layout.addWidget(self.output)

        self.tabs.addTab(tab, "Log")

    def append(self, text: str) -> None:
        self.output.append(text.rstrip())

    def command_line(self, command: list[str]) -> str:
        return " ".join(str(item) for item in command)

    def build_daemon_command(self) -> list[str]:
        command = [
            sys.executable,
            str(CRAWLER),
            "--daemon",
            "--limit",
            str(self.limit_spin.value()),
            "--workers",
            str(self.workers_spin.value()),
            "--interval",
            str(self.interval_spin.value()),
        ]

        if self.git_push_checkbox.isChecked():
            command.append("--git-push")

        return command

    def start_daemon(self) -> None:
        if self.process:
            QMessageBox.information(self, "Already Running", "Daemon is already running.")
            return

        command = self.build_daemon_command()

        self.append("$ " + self.command_line(command))

        self.process = QProcess(self)
        self.process.setProgram(command[0])
        self.process.setArguments(command[1:])
        self.process.readyReadStandardOutput.connect(self.read_stdout)
        self.process.readyReadStandardError.connect(self.read_stderr)
        self.process.finished.connect(self.process_finished)
        self.process.start()

        self.status_label.setText("Daemon running...")

    def stop_daemon(self) -> None:
        if not self.process:
            return

        self.process.kill()
        self.process.waitForFinished(5000)
        self.process = None

        self.status_label.setText("Daemon stopped.")
        self.append("[daemon stopped]")

    def run_command(self, command: list[str], timeout: int = 3600) -> subprocess.CompletedProcess[str] | None:
        self.append("$ " + self.command_line(command))

        try:
            result = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )

            if result.stdout:
                self.append(result.stdout)

            if result.stderr:
                self.append(result.stderr)

            if result.returncode != 0:
                self.append(f"[exit code {result.returncode}]")

            return result

        except Exception as exc:
            self.append(str(exc))
            return None

    def run_once(self) -> None:
        command = [
            sys.executable,
            str(CRAWLER),
            "--limit",
            str(self.limit_spin.value()),
            "--workers",
            str(self.workers_spin.value()),
        ]

        self.run_command(command, timeout=3600)
        self.refresh_status()

    def run_cli(self, args: list[str]) -> None:
        command = [
            sys.executable,
            str(CLI),
            *args,
        ]

        self.run_command(command, timeout=3600)
        self.refresh_status()

    def latest_input_path(self) -> Path:
        for path in (
            ZZX_LATEST,
            ZZX_NODES,
            ORIGINAL_LATEST,
            ORIGINAL_NODES,
            STATE_DIR / "latest.json",
            STATE_DIR / "nodes.json",
        ):
            if path.exists():
                return path

        return ZZX_LATEST

    def enrich_latest(self) -> None:
        input_path = self.latest_input_path()

        ENRICHED_DIR.mkdir(parents=True, exist_ok=True)

        modules = [
            "ip_db",
            "ipv4",
            "ipv6",
            "tor",
            "i2p",
            "proxy",
            "vpn",
            "geoloc",
            "continent",
            "region",
            "country",
            "territory",
            "county",
            "city",
            "zip",
            "timezone",
            "isp",
        ]

        if self.enrich_w3w_checkbox.isChecked():
            modules.append("w3w_lookup")

        if self.enrich_geohash_checkbox.isChecked():
            modules.append("geohashid_lookup")

        if self.enrich_policy_checkbox.isChecked():
            modules.append("sanctioned_nodes")

        modules.extend([
            "peers",
            "peer_index",
            "peer_health",
            "dns_seeder_health",
        ])

        command = [
            sys.executable,
            str(ENRICH),
            "--input",
            str(input_path),
            "--output",
            str(ENRICHED_LATEST),
            "--report",
            str(ENRICHMENT_REPORT),
            "--source",
            "zzxbitnodes",
            "--api-dir",
            str(API_DIR),
            "--state-dir",
            str(STATE_DIR),
            "--modules",
            ",".join(modules),
        ]

        self.run_command(command, timeout=7200)
        self.refresh_status()

    def build_maps(self) -> None:
        input_path = ENRICHED_LATEST if ENRICHED_LATEST.exists() else self.latest_input_path()

        command = [
            sys.executable,
            str(MAPS),
            "--input",
            str(input_path),
            "--api-dir",
            str(API_DIR),
            "--state-dir",
            str(STATE_DIR),
            "--map-dir",
            str(MAP_DIR),
            "--live-map-dir",
            str(LIVE_MAP_DIR),
            "--source",
            "zzxbitnodes",
            "--theme",
            "zzx_dark_olive",
            "--settings",
            "default",
            "--tile-provider",
            "cartodb_dark",
        ]

        self.run_command(command, timeout=3600)
        self.refresh_status()

    def build_geo_indexes(self) -> None:
        command = [
            sys.executable,
            str(BUILD_GEO_INDEXES),
            "--download",
        ]

        self.run_command(command, timeout=7200)
        self.refresh_status()

    def refresh_status(self) -> None:
        if self.process:
            self.status_label.setText("Daemon running...")
        else:
            self.status_label.setText("Daemon stopped.")

        z_summary = summarize_payload(ZZX_LATEST if ZZX_LATEST.exists() else ZZX_NODES)
        e_summary = summarize_payload(ENRICHED_LATEST)
        map_report = read_json(MAP_REPORT, fallback={})
        enrich_report = read_json(ENRICHMENT_REPORT, fallback={})

        lines = [
            f"Updated: {utc_now()}",
            "",
            "ZZX Bitnodes Source",
            f"  total:             {z_summary['total']:,}",
            f"  reachable:         {z_summary['reachable']:,}",
            f"  unreachable:       {z_summary['unreachable']:,}",
            f"  ipv4:              {z_summary['ipv4']:,}",
            f"  ipv6:              {z_summary['ipv6']:,}",
            f"  tor:               {z_summary['tor']:,}",
            f"  i2p:               {z_summary['i2p']:,}",
            "",
            "Enriched Latest",
            f"  total:             {e_summary['total']:,}",
            f"  reachable:         {e_summary['reachable']:,}",
            f"  unreachable:       {e_summary['unreachable']:,}",
            f"  ipv4:              {e_summary['ipv4']:,}",
            f"  ipv6:              {e_summary['ipv6']:,}",
            f"  tor:               {e_summary['tor']:,}",
            f"  i2p:               {e_summary['i2p']:,}",
            f"  vpn:               {e_summary['vpn']:,}",
            f"  proxy:             {e_summary['proxy']:,}",
            f"  policy restricted: {e_summary['policy_restricted']:,}",
            "",
            "Map Build",
            f"  map points:        {int(map_report.get('point_count', 0) or 0):,}",
            f"  selected theme:    {map_report.get('selected_theme', '—')}",
            f"  selected settings: {map_report.get('selected_settings', '—')}",
            f"  map dir:           {map_report.get('map_dir', str(MAP_DIR))}",
            f"  live map dir:      {map_report.get('live_map_dir', str(LIVE_MAP_DIR))}",
            "",
            "Enrichment Report",
            f"  schema:            {enrich_report.get('schema', '—')}",
            f"  node count:        {int(enrich_report.get('node_count', 0) or 0):,}",
            f"  generated:         {enrich_report.get('generated_at', '—')}",
            "",
            "Paths",
            f"  api:               {API_DIR}",
            f"  state:             {STATE_DIR}",
            f"  enriched latest:   {ENRICHED_LATEST}",
            f"  maps:              {MAP_DIR}",
            f"  live-map:          {LIVE_MAP_DIR}",
        ]

        self.stats_text.setPlainText("\n".join(lines))

    def open_folder(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

        QFileDialog.getOpenFileName(
            self,
            "Open Folder",
            str(path),
        )

    def read_stdout(self) -> None:
        if not self.process:
            return

        data = bytes(
            self.process.readAllStandardOutput()
        ).decode(
            "utf-8",
            errors="ignore",
        )

        self.append(data)

    def read_stderr(self) -> None:
        if not self.process:
            return

        data = bytes(
            self.process.readAllStandardError()
        ).decode(
            "utf-8",
            errors="ignore",
        )

        self.append(data)

    def process_finished(self) -> None:
        self.append("[daemon exited]")
        self.process = None
        self.status_label.setText("Daemon stopped.")
        self.refresh_status()


def main() -> int:
    app = QApplication(sys.argv)

    app.setStyleSheet(
        """
        QMainWindow, QWidget {
            background: #050705;
            color: #ccd8b6;
            font-family: IBM Plex Mono;
        }

        QGroupBox {
            border: 1px solid rgba(192, 214, 116, 0.22);
            border-radius: 10px;
            margin-top: 10px;
            padding: 10px;
            color: #c0d674;
            font-weight: bold;
        }

        QGroupBox::title {
            subcontrol-origin: margin;
            left: 12px;
            padding: 0 5px;
        }

        QPushButton {
            background: #10140d;
            border: 1px solid rgba(192, 214, 116, 0.22);
            border-radius: 8px;
            color: #c0d674;
            padding: 8px 10px;
            font-weight: bold;
        }

        QPushButton:hover {
            background: #182010;
            border-color: rgba(192, 214, 116, 0.42);
            color: #edf7b9;
        }

        QTextEdit, QSpinBox {
            background: #020402;
            border: 1px solid rgba(192, 214, 116, 0.16);
            color: #edf7b9;
            selection-background-color: #617039;
        }

        QTabWidget::pane {
            border: 1px solid rgba(192, 214, 116, 0.16);
        }

        QTabBar::tab {
            background: #10140d;
            color: #c0d674;
            padding: 8px 14px;
            border: 1px solid rgba(192, 214, 116, 0.16);
        }

        QTabBar::tab:selected {
            background: #182010;
            color: #edf7b9;
        }

        QLabel {
            color: #ccd8b6;
        }

        QCheckBox {
            color: #ccd8b6;
        }
        """
    )

    window = BitnodesWindow()
    window.show()

    return app.exec_()


if __name__ == "__main__":
    raise SystemExit(main())
