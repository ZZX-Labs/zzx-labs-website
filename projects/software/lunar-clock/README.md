# Lunar Clock

`/projects/software/lunar-clock/`

Lunar Clock is a high-precision lunar phase and age clock that tracks eclipses, standstills, nodal cycles, and synodic timing for astronomical and ritual synchronization.

## Browser workbench

The web page implements a deterministic lunar timing model with:

- synodic age;
- phase fraction and phase name;
- approximate illumination;
- Julian date;
- lunation index;
- next new moon estimate;
- next quarter point;
- approximate 18.6-year nodal/standstill cycle position;
- approximate eclipse-season proximity;
- cycle visualization;
- JSON snapshot export.

## Precision boundary

The browser implementation is intentionally dependency-free and uses a standard reference new moon plus mean synodic-period mathematics. That is appropriate for visualization and timing exploration, but should not be described as a precision ephemeris.

The manifest specifies `ephem`, NumPy and Matplotlib for the native project. A native PyEphem-based build should be used for higher-precision astronomical timing.

Version: `0.1.0`  
License: `MIT`
