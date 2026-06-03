#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

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

APP_NAME = "bitnodes-gui.py"
APP_VERSION = "0.4.0"

BITNODES = TOOLS_DIR / "bitnodes.py"
CLI = TOOLS_DIR / "bitnodes-cli.py"
DAEMON = TOOLS_DIR / "bitnodesd.py"

SUBPROGRAMS: dict[str, Path] = {
    "original-crawler": TOOLS_DIR / "crawl.py",
    "zzx-crawler": TOOLS_DIR / "zzx_crawl.py",
    "crawler": TOOLS_DIR / "crawl.py",
    "enrich": TOOLS_DIR / "enrich.py",
    "maps": TOOLS_DIR / "maps.py",
    "geo-indexes": TOOLS_DIR / "build_geo_indexes.py",
    "push-ipdb": TOOLS_DIR / "push_ipdb.py",
    "asn": TOOLS_DIR / "asn.py",
    "isp": TOOLS_DIR / "isp.py",
    "provider": TOOLS_DIR / "provider.py",
    "organization": TOOLS_DIR / "organization.py",
    "government": TOOLS_DIR / "government.py",
    "military": TOOLS_DIR / "military.py",
    "datacenter": TOOLS_DIR / "datacenter.py",
    "aptattribution": TOOLS_DIR / "aptattribution.py",
    "tagattribution": TOOLS_DIR / "tagattribution.py",
    "knownmalactor": TOOLS_DIR / "knownmalactor.py",
}

API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

ZZX_DIR = API_DIR / "zzxbitnodes"
ORIGINAL_DIR = API_DIR / "originalbitnodes"
ENRICHED_DIR = API_DIR / "enriched"

ZZX_LATEST = ZZX_DIR / "latest.json"
ZZX_NODES = ZZX_DIR / "nodes.json"
ORIGINAL_LATEST = ORIGINAL_DIR / "latest.json"
ORIGINAL_NODES = ORIGINAL_DIR / "nodes.json"

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
            rows: list[dict[str, Any]] = []

            for address, data in value.items():
                if isinstance(data, dict):
                    row = {"address": address}
                    row.update(data)
                    rows.append(row)
                elif isinstance(data, list):
                    rows.append(
                        {
                            "address": address,
                            "status": data[0] if len(data) > 0 else None,
                            "protocol": data[1] if len(data) > 1 else None,
                            "agent": data[2] if len(data) > 2 else None,
                            "height": data[3] if len(data) > 3 else None,
                            "services": data[4] if len(data) > 4 else None,
                            "timestamp": data[5] if len(data) > 5 else None,
                        }
                    )
                else:
                    rows.append({"address": address, "value": data})

            return rows

    return []


def count_nodes(payload: Any) -> int:
    rows = extract_node_rows(payload)

    if rows:
        return len(rows)

    if isinstance(payload, list):
        return len(payload)

    if isinstance(payload, dict):
        return len(payload)

    return 0


def node_address(row: dict[str, Any]) -> str:
    return str(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("host")
        or ""
    ).lower()


def count_matching(rows: list[dict[str, Any]], predicate: Callable[[dict[str, Any]], bool]) -> int:
    return sum(1 for row in rows if predicate(row))


def truthy_status(row: dict[str, Any]) -> bool:
    status = row.get("status")
    reachable = row.get("reachable")

    return bool(
        reachable is True
        or status in {"reachable", "ok", "up", "online", 1, True}
    )


def falsey_status(row: dict[str, Any]) -> bool:
    status = row.get("status")
    reachable = row.get("reachable")

    return bool(
        reachable is False
        or status in {"unreachable", "fail", "down", "offline", 0, False}
    )


def summarize_payload(path: Path) -> dict[str, int]:
    payload = read_json(path, fallback={})
    rows = extract_node_rows(payload)

    return {
        "total": len(rows) or count_nodes(payload),
        "reachable": count_matching(rows, truthy_status),
        "unreachable": count_matching(rows, falsey_status),
        "ipv4": count_matching(
            rows,
            lambda row: bool(
                row.get("is_ipv4")
                or (
                    node_address(row).count(".") == 3
                    and ":" not in node_address(row)
                )
            ),
        ),
        "ipv6": count_matching(
            rows,
            lambda row: bool(
                row.get("is_ipv6")
                or (
                    ":" in node_address(row)
                    and ".onion" not in node_address(row)
                    and ".i2p" not in node_address(row)
                )
            ),
        ),
        "tor": count_matching(
            rows,
            lambda row: bool(row.get("is_tor") or ".onion" in node_address(row)),
        ),
        "i2p": count_matching(
            rows,
            lambda row: bool(row.get("is_i2p") or ".i2p" in node_address(row)),
        ),
        "vpn": count_matching(
            rows,
            lambda row: bool(row.get("is_vpn") or row.get("vpn", {}).get("is_vpn")),
        ),
        "proxy": count_matching(
            rows,
            lambda row: bool(row.get("is_proxy") or row.get("proxy", {}).get("is_proxy")),
        ),
        "policy_restricted": count_matching(
            rows,
            lambda row: bool(row.get("is_policy_restricted_node")),
        ),
    }


class BitnodesWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()

        self.daemon_process: QProcess | None = None

        self.setWindowTitle("ZZX-Labs Bitnodes GUI Controller")
        self.resize(1420, 920)

        self.setup_ui()

        self.timer = QTimer()
        self.timer.timeout.connect(self.refresh_status)
        self.timer.start(15000)

        self.refresh_status()

    def setup_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)

        layout = QVBoxLayout(root)

        self.status_label = QLabel("ZZX-Labs Bitnodes controller")
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
        self.setup_intel_tab()
        self.setup_stats_tab()
        self.setup_output_tab()

    def setup_control_tab(self) -> None:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        crawler_group = QGroupBox("Crawler Engines")
        crawler_layout = QGridLayout(crawler_group)

        self.limit_spin = QSpinBox()
        self.limit_spin.setRange(1, 1_000_000)
        self.limit_spin.setValue(5000)

        self.interval_spin = QSpinBox()
        self.interval_spin.setRange(10, 86400)
        self.interval_spin.setValue(900)

        self.workers_spin = QSpinBox()
        self.workers_spin.setRange(1, 4096)
        self.workers_spin.setValue(256)

        self.git_push_checkbox = QCheckBox("Git Push")
        self.git_push_checkbox.setChecked(True)

        self.use_zzx_checkbox = QCheckBox("Prefer ZZX Crawler")
        self.use_zzx_checkbox.setChecked(True)

        crawler_layout.addWidget(QLabel("Node Limit"), 0, 0)
        crawler_layout.addWidget(self.limit_spin, 0, 1)
        crawler_layout.addWidget(QLabel("Workers"), 0, 2)
        crawler_layout.addWidget(self.workers_spin, 0, 3)
        crawler_layout.addWidget(QLabel("Interval Seconds"), 0, 4)
        crawler_layout.addWidget(self.interval_spin, 0, 5)
        crawler_layout.addWidget(self.git_push_checkbox, 0, 6)
        crawler_layout.addWidget(self.use_zzx_checkbox, 0, 7)

        layout.addWidget(crawler_group)

        enrich_group = QGroupBox("Enrichment / Mapping")
        enrich_layout = QGridLayout(enrich_group)

        self.enrich_w3w_checkbox = QCheckBox("W3W Fallback")
        self.enrich_w3w_checkbox.setChecked(True)

        self.enrich_geohash_checkbox = QCheckBox("GeoHashID")
        self.enrich_geohash_checkbox.setChecked(True)

        self.enrich_policy_checkbox = QCheckBox("Policy Classification")
        self.enrich_policy_checkbox.setChecked(True)

        self.enrich_threat_checkbox = QCheckBox("Threat Attribution")
        self.enrich_threat_checkbox.setChecked(True)

        self.map_theme_label = QLabel("Theme: zzx_dark_olive")
        self.map_settings_label = QLabel("Settings: default")

        enrich_layout.addWidget(self.enrich_w3w_checkbox, 0, 0)
        enrich_layout.addWidget(self.enrich_geohash_checkbox, 0, 1)
        enrich_layout.addWidget(self.enrich_policy_checkbox, 0, 2)
        enrich_layout.addWidget(self.enrich_threat_checkbox, 0, 3)
        enrich_layout.addWidget(self.map_theme_label, 1, 0)
        enrich_layout.addWidget(self.map_settings_label, 1, 1)

        layout.addWidget(enrich_group)

        buttons = QHBoxLayout()

        button_specs = (
            ("Start Daemon", self.start_daemon),
            ("Stop Daemon", self.stop_daemon),
            ("Run Crawl Once", self.run_once),
            ("Run ZZX Crawl Once", self.run_zzx_once),
            ("Clone Original", lambda: self.run_cli(["clone"])),
            ("Export Once", lambda: self.run_cli(["export-once"])),
            ("Enrich Latest", self.enrich_latest),
            ("Build Maps", self.build_maps),
            ("Build Geo Indexes", self.build_geo_indexes),
            ("Push IPDB", self.push_ipdb),
            ("Refresh Status", self.refresh_status),
            ("Open API Folder", lambda: self.open_folder(API_DIR)),
            ("Open Maps Folder", lambda: self.open_folder(MAP_DIR)),
            ("Clear Log", self.clear_log),
        )

        for label, callback in button_specs:
            button = QPushButton(label)
            button.clicked.connect(callback)
            buttons.addWidget(button)

        layout.addLayout(buttons)
        layout.addStretch()

        self.tabs.addTab(tab, "Control")

    def setup_intel_tab(self) -> None:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        group = QGroupBox("IP Intelligence / Attribution Subprograms")
        grid = QGridLayout(group)

        specs = (
            ("ASN", "asn"),
            ("ISP", "isp"),
            ("Provider", "provider"),
            ("Organization", "organization"),
            ("Government", "government"),
            ("Military", "military"),
            ("Datacenter", "datacenter"),
            ("APT Attribution", "aptattribution"),
            ("Threat Actor Tags", "tagattribution"),
            ("Known Malactor", "knownmalactor"),
        )

        for index, (label, key) in enumerate(specs):
            button = QPushButton(label)
            button.clicked.connect(lambda checked=False, mode=key: self.run_tool(mode))
            grid.addWidget(button, index // 3, index % 3)

        layout.addWidget(group)
        layout.addStretch()

        self.tabs.addTab(tab, "Intel")

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

    def clear_log(self) -> None:
        self.output.clear()

    def command_line(self, command: list[str]) -> str:
        return " ".join(str(item) for item in command)

    def script_for_crawl(self) -> Path:
        zzx = SUBPROGRAMS["zzx-crawler"]

        if self.use_zzx_checkbox.isChecked() and zzx.exists():
            return zzx

        return SUBPROGRAMS["original-crawler"]

    def build_daemon_command(self) -> list[str]:
        command = [
            sys.executable,
            str(DAEMON),
            "start",
            "--limit",
            str(self.limit_spin.value()),
            "--workers",
            str(self.workers_spin.value()),
            "--interval",
            str(self.interval_spin.value()),
        ]

        if self.use_zzx_checkbox.isChecked():
            command.append("--zzx")

        if self.git_push_checkbox.isChecked():
            command.append("--git-push")

        return command

    def run_subprocess(
        self,
        command: list[str],
        timeout: int = 3600,
        refresh: bool = True,
    ) -> subprocess.CompletedProcess[str] | None:
        self.append("$ " + self.command_line(command))

        try:
            result = subprocess.run(
                command,
                cwd=str(TOOLS_DIR),
                env=os.environ.copy(),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
        except Exception as exc:
            self.append(f"[error] {exc}")
            return None

        if result.stdout:
            self.append(result.stdout)

        if result.stderr:
            self.append(result.stderr)

        if result.returncode != 0:
            self.append(f"[exit code {result.returncode}]")

        if refresh:
            self.refresh_status()

        return result

    def run_python_script(
        self,
        script: Path,
        args: list[str] | None = None,
        timeout: int = 3600,
    ) -> subprocess.CompletedProcess[str] | None:
        if args is None:
            args = []

        if not script.exists():
            self.append(f"[missing] {script}")
            return None

        return self.run_subprocess(
            [
                sys.executable,
                str(script),
                *args,
            ],
            timeout=timeout,
        )

    def run_cli(self, args: list[str]) -> None:
        self.run_python_script(CLI, args, timeout=3600)

    def run_tool(self, key: str, args: list[str] | None = None) -> None:
        script = SUBPROGRAMS.get(key)

        if script is None:
            self.append(f"[unknown tool] {key}")
            return

        self.run_python_script(script, args or [], timeout=7200)

    def start_daemon(self) -> None:
        if self.daemon_process is not None:
            QMessageBox.information(self, "Already Running", "Daemon is already running.")
            return

        if not DAEMON.exists():
            QMessageBox.critical(self, "Missing Daemon", f"Missing file:\n{DAEMON}")
            return

        command = self.build_daemon_command()

        self.append("$ " + self.command_line(command))

        self.daemon_process = QProcess(self)
        self.daemon_process.setProgram(command[0])
        self.daemon_process.setArguments(command[1:])
        self.daemon_process.setWorkingDirectory(str(TOOLS_DIR))
        self.daemon_process.readyReadStandardOutput.connect(self.read_daemon_stdout)
        self.daemon_process.readyReadStandardError.connect(self.read_daemon_stderr)
        self.daemon_process.finished.connect(self.daemon_finished)
        self.daemon_process.start()

        self.status_label.setText("Daemon running...")

    def stop_daemon(self) -> None:
        if self.daemon_process is None:
            self.run_python_script(DAEMON, ["stop"], timeout=60)
            self.status_label.setText("Daemon stopped.")
            return

        self.daemon_process.terminate()

        if not self.daemon_process.waitForFinished(5000):
            self.daemon_process.kill()
            self.daemon_process.waitForFinished(5000)

        self.daemon_process = None

        self.status_label.setText("Daemon stopped.")
        self.append("[daemon stopped]")

    def run_once(self) -> None:
        script = SUBPROGRAMS["original-crawler"]

        args = [
            "--limit",
            str(self.limit_spin.value()),
            "--workers",
            str(self.workers_spin.value()),
        ]

        if self.git_push_checkbox.isChecked():
            args.append("--git-push")

        self.run_python_script(script, args, timeout=7200)

    def run_zzx_once(self) -> None:
        script = self.script_for_crawl()

        args = [
            "--limit",
            str(self.limit_spin.value()),
            "--workers",
            str(self.workers_spin.value()),
        ]

        if self.git_push_checkbox.isChecked():
            args.append("--git-push")

        self.run_python_script(script, args, timeout=7200)

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

    def enrichment_modules(self) -> list[str]:
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
            "asn",
            "isp",
            "provider",
            "organization",
            "datacenter",
            "government",
            "military",
        ]

        if self.enrich_w3w_checkbox.isChecked():
            modules.append("w3w_lookup")

        if self.enrich_geohash_checkbox.isChecked():
            modules.append("geohashid_lookup")

        if self.enrich_policy_checkbox.isChecked():
            modules.append("sanctioned_nodes")

        if self.enrich_threat_checkbox.isChecked():
            modules.extend(
                [
                    "aptattribution",
                    "tagattribution",
                    "knownmalactor",
                ]
            )

        modules.extend(
            [
                "peers",
                "peer_index",
                "peer_health",
                "dns_seeder_health",
            ]
        )

        return modules

    def enrich_latest(self) -> None:
        input_path = self.latest_input_path()
        ENRICHED_DIR.mkdir(parents=True, exist_ok=True)

        command = [
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
            ",".join(self.enrichment_modules()),
        ]

        self.run_tool("enrich", command)

    def build_maps(self) -> None:
        input_path = ENRICHED_LATEST if ENRICHED_LATEST.exists() else self.latest_input_path()

        args = [
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

        self.run_tool("maps", args)

    def build_geo_indexes(self) -> None:
        self.run_tool("geo-indexes", ["--download"])

    def push_ipdb(self) -> None:
        self.run_tool("push-ipdb")

    def refresh_status(self) -> None:
        if self.daemon_process:
            self.status_label.setText("Daemon running...")
        else:
            self.status_label.setText("Daemon stopped.")

        original_summary = summarize_payload(
            ORIGINAL_LATEST if ORIGINAL_LATEST.exists() else ORIGINAL_NODES
        )
        zzx_summary = summarize_payload(
            ZZX_LATEST if ZZX_LATEST.exists() else ZZX_NODES
        )
        enriched_summary = summarize_payload(ENRICHED_LATEST)

        map_report = read_json(MAP_REPORT, fallback={})
        enrich_report = read_json(ENRICHMENT_REPORT, fallback={})

        missing = [
            name
            for name, path in {
                "bitnodes.py": BITNODES,
                "bitnodes-cli.py": CLI,
                "bitnodesd.py": DAEMON,
                **{key: value for key, value in SUBPROGRAMS.items()},
            }.items()
            if not path.exists()
        ]

        lines = [
            f"{APP_NAME} {APP_VERSION}",
            f"Updated: {utc_now()}",
            "",
            "Wrapper Control Surface",
            f"  app root:          {APP_ROOT}",
            f"  tools dir:         {TOOLS_DIR}",
            f"  python:            {sys.executable}",
            f"  daemon running:    {'yes' if self.daemon_process else 'no'}",
            "",
            "Original Bitnodes Source",
            f"  total:             {original_summary['total']:,}",
            f"  reachable:         {original_summary['reachable']:,}",
            f"  unreachable:       {original_summary['unreachable']:,}",
            f"  ipv4:              {original_summary['ipv4']:,}",
            f"  ipv6:              {original_summary['ipv6']:,}",
            f"  tor:               {original_summary['tor']:,}",
            f"  i2p:               {original_summary['i2p']:,}",
            "",
            "ZZX Bitnodes Source",
            f"  total:             {zzx_summary['total']:,}",
            f"  reachable:         {zzx_summary['reachable']:,}",
            f"  unreachable:       {zzx_summary['unreachable']:,}",
            f"  ipv4:              {zzx_summary['ipv4']:,}",
            f"  ipv6:              {zzx_summary['ipv6']:,}",
            f"  tor:               {zzx_summary['tor']:,}",
            f"  i2p:               {zzx_summary['i2p']:,}",
            "",
            "Enriched Latest",
            f"  total:             {enriched_summary['total']:,}",
            f"  reachable:         {enriched_summary['reachable']:,}",
            f"  unreachable:       {enriched_summary['unreachable']:,}",
            f"  ipv4:              {enriched_summary['ipv4']:,}",
            f"  ipv6:              {enriched_summary['ipv6']:,}",
            f"  tor:               {enriched_summary['tor']:,}",
            f"  i2p:               {enriched_summary['i2p']:,}",
            f"  vpn:               {enriched_summary['vpn']:,}",
            f"  proxy:             {enriched_summary['proxy']:,}",
            f"  policy restricted: {enriched_summary['policy_restricted']:,}",
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
            f"  original latest:   {ORIGINAL_LATEST}",
            f"  zzx latest:        {ZZX_LATEST}",
            f"  enriched latest:   {ENRICHED_LATEST}",
            f"  maps:              {MAP_DIR}",
            f"  live-map:          {LIVE_MAP_DIR}",
            "",
            "Subsystem Check",
        ]

        if missing:
            lines.extend([f"  missing:           {item}" for item in sorted(missing)])
        else:
            lines.append("  all expected files found")

        self.stats_text.setPlainText("\n".join(lines))

    def open_folder(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

        QFileDialog.getOpenFileName(
            self,
            "Open Folder",
            str(path),
        )

    def read_daemon_stdout(self) -> None:
        if not self.daemon_process:
            return

        data = bytes(
            self.daemon_process.readAllStandardOutput()
        ).decode(
            "utf-8",
            errors="ignore",
        )

        self.append(data)

    def read_daemon_stderr(self) -> None:
        if not self.daemon_process:
            return

        data = bytes(
            self.daemon_process.readAllStandardError()
        ).decode(
            "utf-8",
            errors="ignore",
        )

        self.append(data)

    def daemon_finished(self) -> None:
        self.append("[daemon exited]")
        self.daemon_process = None
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

        QTextEdit,
        QSpinBox {
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

        QLabel,
        QCheckBox {
            color: #ccd8b6;
        }
        """
    )

    window = BitnodesWindow()
    window.show()

    return int(app.exec_())


if __name__ == "__main__":
    raise SystemExit(main())
