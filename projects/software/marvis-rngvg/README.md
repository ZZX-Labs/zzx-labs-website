# MarVIS-RNGvG

`/projects/software/marvis-rngvg/`

MarVIS-RNGvG (Randomized Next-Gen Video Generator) produces synthetic marine video datasets through augmentation, noise modeling, and procedural clip generation for AI training and validation.

## Browser generator

The web companion is an actual procedural marine-scene generator with:

- deterministic seed;
- configurable resolution/FPS/duration;
- fish and jellyfish populations;
- current-driven motion;
- turbidity particles;
- sensor noise;
- low-light scene controls;
- normalized synthetic labels;
- PNG frame export;
- WebM canvas recording where the browser supports MediaRecorder;
- dataset-recipe JSON export.

All generated content is synthetic and explicitly marked as such.

The native manifest specifies TensorFlow, OpenCV, NumPy, Pillow and FFmpeg for larger offline dataset-generation pipelines.

Version: `0.2.0-alpha`  
License: `MIT`
