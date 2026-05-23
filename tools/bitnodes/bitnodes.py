#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PyQt5.QtCore import QTimer
from PyQt5.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget
)


TOOLS_DIR = Path(__file__).resolve().parent
CLI = TOOLS_DIR / "bitnodes-cli.py"


class BitnodesWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()

        self.setWindowTitle("ZZX-Labs Bitnodes Controller")
        self.resize(980, 680)

        root = QWidget()
        layout = QVBoxLayout(root)

        self.status_label = QLabel("Bitnodes daemon controller")
        self.output = QTextEdit()
        self.output.setReadOnly(True)

        row = QHBoxLayout()

        buttons = [
            ("Status", ["status"]),
            ("Run Foreground", ["run"]),
            ("Stop", ["stop"]),
            ("Export Once", ["export-once"]),
            ("Clone Original", ["clone"]),
            ("Bootstrap Original", ["bootstrap-original"]),
            ("Start Original", ["start-original"])
        ]

        for label, command in buttons:
            button = QPushButton(label)
            button.clicked.connect(lambda _checked, c=command: self.run_cli(c))
            row.addWidget(button)

        layout.addWidget(self.status_label)
        layout.addLayout(row)
        layout.addWidget(self.output)

        self.setCentralWidget(root)

        self.timer = QTimer()
        self.timer.timeout.connect(lambda: self.run_cli(["status"], quiet=True))
        self.timer.start(15000)

        self.run_cli(["status"], quiet=True)

    def append(self, text: str) -> None:
        self.output.append(text.rstrip())

    def run_cli(self, args: list[str], quiet: bool = False) -> None:
        command = [sys.executable, str(CLI), *args]

        if not quiet:
            self.append(f"$ {' '.join(command)}")

        try:
            result = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=60
            )

            if result.stdout.strip():
                if not quiet:
                    self.append(result.stdout)
                self.status_label.setText(result.stdout.strip().splitlines()[-1])

            if result.stderr.strip() and not quiet:
                self.append(result.stderr)

        except Exception as exc:
            self.append(str(exc))


def main() -> int:
    app = QApplication(sys.argv)
    window = BitnodesWindow()
    window.show()
    return app.exec_()


if __name__ == "__main__":
    raise SystemExit(main())
