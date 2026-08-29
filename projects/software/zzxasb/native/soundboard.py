#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import vlc
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import QApplication,QFileDialog,QGridLayout,QMainWindow,QPushButton,QSlider,QVBoxLayout,QWidget

class Board(QMainWindow):
    def __init__(self):
        super().__init__(); self.setWindowTitle("ZZX-ASB"); self.resize(900,650)
        self.players=[None]*12; self.paths=[None]*12
        root=QWidget(); layout=QVBoxLayout(root); grid=QGridLayout(); layout.addLayout(grid)
        for i in range(12):
            b=QPushButton(f"Pad {i+1}\n(empty)");b.setMinimumHeight(90);b.clicked.connect(lambda _,n=i:self.trigger(n));b.setContextMenuPolicy(Qt.CustomContextMenu);b.customContextMenuRequested.connect(lambda _,n=i:self.assign(n));grid.addWidget(b,i//4,i%4);setattr(self,f"pad{i}",b)
        self.master=QSlider(Qt.Horizontal);self.master.setRange(0,100);self.master.setValue(85);layout.addWidget(self.master)
        self.setCentralWidget(root)
    def assign(self,i):
        p,_=QFileDialog.getOpenFileName(self,"Assign audio","","Audio (*.wav *.mp3 *.flac *.ogg *.m4a *.aac *.opus);;All files (*)")
        if p:self.paths[i]=p;getattr(self,f"pad{i}").setText(Path(p).stem)
    def trigger(self,i):
        p=self.paths[i]
        if not p:return
        if self.players[i]: self.players[i].stop()
        pl=vlc.MediaPlayer(p);pl.audio_set_volume(self.master.value());pl.play();self.players[i]=pl

def main():
    app=QApplication(sys.argv);w=Board();w.show();sys.exit(app.exec_())
if __name__=="__main__":main()
