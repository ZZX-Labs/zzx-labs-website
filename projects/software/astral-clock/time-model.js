(() => {
  "use strict";

  const G = 6.67430e-11;
  const C = 299792458;
  const C_KM_S = C / 1000;
  const EPOCH_MS = Date.parse("2026-01-01T00:00:00.000Z");

  function rotationVelocityKmS(body) {
    const radiusM = Number(body.radiusKm) * 1000;
    const periodS = Number(body.rotationHours) * 3600;
    if (!(radiusM > 0) || !(periodS > 0)) return 0;
    return (2 * Math.PI * radiusM / periodS) / 1000;
  }

  function rateComponents(body) {
    const mass = Number(body.massKg);
    const radiusM = Number(body.radiusKm) * 1000;
    const rotKmS = rotationVelocityKmS(body);
    const extKmS = Number(body.externalVelocityKmS) || 0;

    const gravityTerm = mass > 0 && radiusM > 0
      ? (G * mass) / (radiusM * C * C)
      : 0;

    const vM = Math.hypot(rotKmS, extKmS) * 1000;
    const velocityTerm = (vM * vM) / (2 * C * C);
    const rate = 1 - gravityTerm - velocityTerm;

    return {
      gravityTerm,
      velocityTerm,
      rate,
      rotationVelocityKmS: rotKmS,
      modeledVelocityKmS: vM / 1000
    };
  }

  function earthRate() {
    return rateComponents(AstralBodies.bodies.earth).rate;
  }

  function relativeRate(body) {
    return rateComponents(body).rate / earthRate();
  }

  function earthMsToBodyMs(earthMs, body) {
    const elapsed = Number(earthMs) - EPOCH_MS;
    return EPOCH_MS + elapsed * relativeRate(body);
  }

  function bodyMsToEarthMs(bodyMs, body) {
    const elapsed = Number(bodyMs) - EPOCH_MS;
    return EPOCH_MS + elapsed / relativeRate(body);
  }

  function convertMs(ms, fromBody, toBody) {
    const earthMs = fromBody.id === "earth"
      ? Number(ms)
      : bodyMsToEarthMs(ms, fromBody);

    return toBody.id === "earth"
      ? earthMs
      : earthMsToBodyMs(earthMs, toBody);
  }

  function offsetVsEarthSeconds(earthMs, body) {
    return (earthMsToBodyMs(earthMs, body) - earthMs) / 1000;
  }

  function driftSeconds(bodyA, bodyB, durationSeconds) {
    const rateA = relativeRate(bodyA);
    const rateB = relativeRate(bodyB);
    return (rateA - rateB) * Number(durationSeconds);
  }

  function lightTimeSeconds(distanceKm) {
    return Number(distanceKm) / C_KM_S;
  }

  function formatDuration(seconds) {
    const s = Number(seconds);
    const abs = Math.abs(s);
    const sign = s < 0 ? "-" : "";

    if (abs < 1e-6) return `${sign}${(abs * 1e9).toFixed(3)} ns`;
    if (abs < 1e-3) return `${sign}${(abs * 1e6).toFixed(3)} µs`;
    if (abs < 1) return `${sign}${(abs * 1e3).toFixed(3)} ms`;
    if (abs < 60) return `${sign}${abs.toFixed(6)} s`;
    if (abs < 3600) return `${sign}${Math.floor(abs/60)}m ${(abs%60).toFixed(3)}s`;
    if (abs < 86400) return `${sign}${Math.floor(abs/3600)}h ${Math.floor((abs%3600)/60)}m ${(abs%60).toFixed(2)}s`;
    return `${sign}${(abs/86400).toFixed(6)} days`;
  }

  function iso(ms) {
    return new Date(ms).toISOString();
  }

  window.AstralTimeModel = Object.freeze({
    G, C, C_KM_S, EPOCH_MS,
    rotationVelocityKmS,
    rateComponents,
    relativeRate,
    earthMsToBodyMs,
    bodyMsToEarthMs,
    convertMs,
    offsetVsEarthSeconds,
    driftSeconds,
    lightTimeSeconds,
    formatDuration,
    iso
  });
})();
