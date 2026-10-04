(() => {
  "use strict";

  const bodies = {
    earth: {
      id: "earth",
      name: "Earth",
      massKg: 5.9722e24,
      radiusKm: 6378.137,
      rotationHours: 23.9344696,
      externalVelocityKmS: 29.78,
      representativeDistanceKm: 0,
      parent: "Sun"
    },
    moon: {
      id: "moon",
      name: "Moon",
      massKg: 7.342e22,
      radiusKm: 1737.4,
      rotationHours: 655.728,
      externalVelocityKmS: 30.802,
      representativeDistanceKm: 384400,
      parent: "Earth"
    },
    mars: {
      id: "mars",
      name: "Mars",
      massKg: 6.4171e23,
      radiusKm: 3389.5,
      rotationHours: 24.622962,
      externalVelocityKmS: 24.077,
      representativeDistanceKm: 225000000,
      parent: "Sun"
    },
    ganymede: {
      id: "ganymede",
      name: "Ganymede",
      massKg: 1.4819e23,
      radiusKm: 2634.1,
      rotationHours: 171.709,
      externalVelocityKmS: 24.8,
      representativeDistanceKm: 628300000,
      parent: "Jupiter"
    }
  };

  const pairDistancesKm = {
    "earth:moon": 384400,
    "earth:mars": 225000000,
    "earth:ganymede": 628300000,
    "moon:mars": 225384400,
    "moon:ganymede": 628684400,
    "mars:ganymede": 550000000
  };

  function pairKey(a,b) {
    return [a,b].sort().join(":");
  }

  function representativeDistance(a,b) {
    if (a === b) return 0;
    return pairDistancesKm[pairKey(a,b)] ?? Math.abs(
      (bodies[a]?.representativeDistanceKm || 0) -
      (bodies[b]?.representativeDistanceKm || 0)
    );
  }

  window.AstralBodies = {
    bodies,
    pairDistancesKm,
    pairKey,
    representativeDistance
  };
})();
