#!/usr/bin/env python3
from __future__ import annotations
import os, sys, requests
from PyQt5 import QtCore, QtGui, QtWidgets

URL=os.environ.get("VLC_STATUS_URL","http://127.0.0.1:8080/requests/status.json")
PWD=os.environ.get("VLC_HTTP_PASSWORD","")
INTERVAL=max(200,int(os.environ.get("VLC_TICKER_MS","500")))

class Ticker(QtWidgets.QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(QtCore.Qt.FramelessWindowHint|QtCore.Qt.WindowStaysOnTopHint|QtCore.Qt.Tool)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)
        self.text="VLC Ticker";self.xpos=0
        self.resize(1000,70)
        self.timer=QtCore.QTimer(self);self.timer.timeout.connect(self.tick);self.timer.start(30)
        self.poll=QtCore.QTimer(self);self.poll.timeout.connect(self.fetch);self.poll.start(INTERVAL)
    def fetch(self):
        try:
            j=requests.get(URL,auth=("",PWD),timeout=2).json()
            meta=((j.get("information") or {}).get("category") or {}).get("meta") or {}
            parts=[meta.get("title") or meta.get("filename") or "VLC",meta.get("artist") or "",meta.get("album") or "",j.get("state") or ""]
            self.text="  •  ".join(x for x in parts if x)
        except Exception:
            pass
    def tick(self):
        self.xpos-=2
        fm=QtGui.QFontMetrics(self.font())
        if self.xpos < -fm.horizontalAdvance(self.text): self.xpos=self.width()
        self.update()
    def paintEvent(self,e):
        p=QtGui.QPainter(self);p.fillRect(self.rect(),QtGui.QColor(0,0,0,220));p.setPen(QtGui.QColor("#c0d674"));f=self.font();f.setPointSize(22);f.setBold(True);p.setFont(f);p.drawText(self.xpos,46,self.text)

app=QtWidgets.QApplication(sys.argv);w=Ticker();w.show();sys.exit(app.exec_())
