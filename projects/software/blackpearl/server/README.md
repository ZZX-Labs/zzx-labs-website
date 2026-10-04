# BlackPearl native media sanitizer

Requires Python, Pillow, pikepdf, FFmpeg, and ClamAV.

```bash
python -m pip install -r requirements.txt
python sanitize.py -o ./sanitized /path/to/input.jpg
```

Production should keep antivirus mandatory and place the output directory outside any executable upload path.
