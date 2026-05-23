#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PyQt5.QtCore import (
    QProcess,
    Qt,
    QTimer
)

from PyQt5.QtGui import (
    QFont
)

from PyQt5.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
    QFileDialog,
    QMessageBox,
    QSpinBox,
    QCheckBox
)


TOOLS_DIR = Path(__file__).resolve().parent

CLI = TOOLS_DIR / "bitnodes-cli.py"

CRAWLER = TOOLS_DIR / "crawl.py"


class BitnodesWindow(QMainWindow):

    def __init__(self) -> None:
        super().__init__()

        self.process: QProcess | None = None

        self.setWindowTitle(
            "ZZX-Labs Bitnodes Controller"
        )

        self.resize(1200, 800)

        self.setup_ui()

        self.timer = QTimer()

        self.timer.timeout.connect(
            self.refresh_status
        )

        self.timer.start(15000)

        self.refresh_status()

    def setup_ui(self) -> None:

        root = QWidget()

        self.setCentralWidget(root)

        layout = QVBoxLayout(root)

        self.status_label = QLabel(
            "Bitnodes daemon controller"
        )

        self.status_label.setAlignment(
            Qt.AlignLeft
        )

        self.status_label.setStyleSheet(
            """
            font-size: 18px;
            font-weight: bold;
            padding: 8px;
            """
        )

        layout.addWidget(
            self.status_label
        )

        controls = QHBoxLayout()

        self.limit_spin = QSpinBox()
        self.limit_spin.setRange(1, 500000)
        self.limit_spin.setValue(5000)

        self.interval_spin = QSpinBox()
        self.interval_spin.setRange(10, 86400)
        self.interval_spin.setValue(900)

        self.workers_spin = QSpinBox()
        self.workers_spin.setRange(1, 2048)
        self.workers_spin.setValue(256)

        self.git_push_checkbox = QCheckBox(
            "Git Push"
        )

        self.git_push_checkbox.setChecked(
            True
        )

        controls.addWidget(
            QLabel("Nodes")
        )

        controls.addWidget(
            self.limit_spin
        )

        controls.addWidget(
            QLabel("Workers")
        )

        controls.addWidget(
            self.workers_spin
        )

        controls.addWidget(
            QLabel("Interval")
        )

        controls.addWidget(
            self.interval_spin
        )

        controls.addWidget(
            self.git_push_checkbox
        )

        controls.addStretch()

        layout.addLayout(
            controls
        )

        buttons = QHBoxLayout()

        self.start_button = QPushButton(
            "Start Daemon"
        )

        self.stop_button = QPushButton(
            "Stop Daemon"
        )

        self.once_button = QPushButton(
            "Run Once"
        )

        self.status_button = QPushButton(
            "Status"
        )

        self.clone_button = QPushButton(
            "Clone Original"
        )

        self.export_button = QPushButton(
            "Export Once"
        )

        self.clear_button = QPushButton(
            "Clear Log"
        )

        self.open_api_button = QPushButton(
            "Open API Folder"
        )

        self.start_button.clicked.connect(
            self.start_daemon
        )

        self.stop_button.clicked.connect(
            self.stop_daemon
        )

        self.once_button.clicked.connect(
            self.run_once
        )

        self.status_button.clicked.connect(
            self.refresh_status
        )

        self.clone_button.clicked.connect(
            lambda: self.run_cli(
                ["clone"]
            )
        )

        self.export_button.clicked.connect(
            lambda: self.run_cli(
                ["export-once"]
            )
        )

        self.clear_button.clicked.connect(
            self.output.clear
        )

        self.open_api_button.clicked.connect(
            self.open_api_dir
        )

        buttons.addWidget(
            self.start_button
        )

        buttons.addWidget(
            self.stop_button
        )

        buttons.addWidget(
            self.once_button
        )

        buttons.addWidget(
            self.status_button
        )

        buttons.addWidget(
            self.clone_button
        )

        buttons.addWidget(
            self.export_button
        )

        buttons.addWidget(
            self.clear_button
        )

        buttons.addWidget(
            self.open_api_button
        )

        layout.addLayout(
            buttons
        )

        self.output = QTextEdit()

        self.output.setReadOnly(True)

        self.output.setFont(
            QFont(
                "IBM Plex Mono",
                10
            )
        )

        layout.addWidget(
            self.output
        )

    def append(
        self,
        text: str
    ) -> None:

        self.output.append(
            text.rstrip()
        )

    def build_daemon_command(
        self
    ) -> list[str]:

        command = [
            sys.executable,
            str(CRAWLER),
            "--daemon",
            "--limit",
            str(
                self.limit_spin.value()
            ),
            "--workers",
            str(
                self.workers_spin.value()
            ),
            "--interval",
            str(
                self.interval_spin.value()
            )
        ]

        if self.git_push_checkbox.isChecked():

            command.append(
                "--git-push"
            )

        return command

    def start_daemon(self) -> None:

        if self.process:

            QMessageBox.information(
                self,
                "Already Running",
                "Daemon is already running."
            )

            return

        command = self.build_daemon_command()

        self.append(
            "$ " + " ".join(command)
        )

        self.process = QProcess(self)

        self.process.setProgram(
            command[0]
        )

        self.process.setArguments(
            command[1:]
        )

        self.process.readyReadStandardOutput.connect(
            self.read_stdout
        )

        self.process.readyReadStandardError.connect(
            self.read_stderr
        )

        self.process.finished.connect(
            self.process_finished
        )

        self.process.start()

        self.status_label.setText(
            "Daemon running..."
        )

    def stop_daemon(self) -> None:

        if not self.process:
            return

        self.process.kill()

        self.process.waitForFinished(
            5000
        )

        self.process = None

        self.status_label.setText(
            "Daemon stopped."
        )

        self.append(
            "[daemon stopped]"
        )

    def run_once(self) -> None:

        command = [
            sys.executable,
            str(CRAWLER),
            "--limit",
            str(
                self.limit_spin.value()
            ),
            "--workers",
            str(
                self.workers_spin.value()
            )
        ]

        self.append(
            "$ " + " ".join(command)
        )

        try:

            result = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3600
            )

            if result.stdout:
                self.append(
                    result.stdout
                )

            if result.stderr:
                self.append(
                    result.stderr
                )

        except Exception as exc:
            self.append(str(exc))

    def run_cli(
        self,
        args: list[str]
    ) -> None:

        command = [
            sys.executable,
            str(CLI),
            *args
        ]

        self.append(
            "$ " + " ".join(command)
        )

        try:

            result = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3600
            )

            if result.stdout:
                self.append(
                    result.stdout
                )

            if result.stderr:
                self.append(
                    result.stderr
                )

        except Exception as exc:
            self.append(str(exc))

    def refresh_status(self) -> None:

        if self.process:

            self.status_label.setText(
                "Daemon running..."
            )

        else:

            self.status_label.setText(
                "Daemon stopped."
            )

    def open_api_dir(self) -> None:

        path = (
            Path.cwd()
            / "bitcoin"
            / "bitnodes"
            / "api"
        )

        path.mkdir(
            parents=True,
            exist_ok=True
        )

        QFileDialog.getOpenFileName(
            self,
            "Bitnodes API Directory",
            str(path)
        )

    def read_stdout(self) -> None:

        if not self.process:
            return

        data = bytes(
            self.process.readAllStandardOutput()
        ).decode(
            "utf-8",
            errors="ignore"
        )

        self.append(data)

    def read_stderr(self) -> None:

        if not self.process:
            return

        data = bytes(
            self.process.readAllStandardError()
        ).decode(
            "utf-8",
            errors="ignore"
        )

        self.append(data)

    def process_finished(self) -> None:

        self.append(
            "[daemon exited]"
        )

        self.process = None

        self.status_label.setText(
            "Daemon stopped."
        )


def main() -> int:

    app = QApplication(sys.argv)

    window = BitnodesWindow()

    window.show()

    return app.exec_()


if __name__ == "__main__":
    raise SystemExit(main())
