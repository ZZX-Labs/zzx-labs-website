# MarVIS

`/projects/software/marvis/`

Marine Video Identification System (MarVIS) uses TensorFlow-based vision and audio models to identify marine life in low-light and high-turbidity conditions, providing robust tagging, recognition, and dataset curation pipelines.

## Browser workbench

The web companion provides:

- local marine image/video loading;
- frame capture;
- brightness/contrast/turbidity visualization;
- normalized bounding-box annotations;
- species/class labels and confidence;
- synthetic model-adapter result simulation;
- simple audio feature extraction when the browser can decode the track;
- SHA-256 source fingerprinting;
- dataset-record JSON export.

## Native model boundary

The manifest defines TensorFlow, OpenCV, NumPy, pandas, and FFmpeg. The browser does not pretend to ship trained MarVIS models. Production inference belongs in the native TensorFlow/OpenCV pipeline.

Version: `0.3.0-alpha`  
License: `MIT`
