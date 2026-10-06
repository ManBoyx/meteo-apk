// Fonctions pures : interprétation et mise en forme des données Open-Meteo.
(function (racine) {
  'use strict';

  var ABSENT = '–';

  // Codes météo OMM renvoyés par Open-Meteo. [libellé, icône de jour, icône de nuit]
  var CODES = {
    0: ['Ciel dégagé', 'soleil', 'lune'],
    1: ['Peu nuageux', 'eclaircies', 'eclaircies-nuit'],
    2: ['Partiellement nuageux', 'eclaircies', 'eclaircies-nuit'],
    3: ['Couvert', 'nuage'],
    45: ['Brouillard', 'brouillard'],
    48: ['Brouillard givrant', 'brouillard'],
    51: ['Bruine légère', 'bruine'],
    53: ['Bruine', 'bruine'],
    55: ['Bruine forte', 'bruine'],
    56: ['Bruine verglaçante', 'bruine'],
    57: ['Bruine verglaçante', 'bruine'],
    61: ['Pluie faible', 'pluie'],
    63: ['Pluie', 'pluie'],
    65: ['Pluie forte', 'pluie'],
    66: ['Pluie verglaçante', 'pluie'],
    67: ['Pluie verglaçante', 'pluie'],
    71: ['Neige faible', 'neige'],
    73: ['Neige', 'neige'],
    75: ['Neige forte', 'neige'],
    77: ['Grains de neige', 'neige'],
    80: ['Averses faibles', 'averses'],
    81: ['Averses', 'averses'],
    82: ['Averses violentes', 'averses'],
    85: ['Averses de neige', 'neige'],
    86: ['Averses de neige', 'neige'],
    95: ['Orage', 'orage'],
    96: ['Orage avec grêle', 'orage'],
    99: ['Orage avec grêle', 'orage']
  };

  var DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  function estNombre(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function decrireCode(code, estJour) {
    var c = CODES[code];
    if (!c) return { libelle: 'Inconnu', icone: 'nuage' };
    return { libelle: c[0], icone: estJour || !c[2] ? c[1] : c[2] };
  }

  function directionCardinale(degres) {
    if (!estNombre(degres)) return ABSENT;
    return DIRECTIONS[Math.round((((degres % 360) + 360) % 360) / 45) % 8];
  }

  function formaterTemp(v) {
    if (!estNombre(v)) return ABSENT;
    // « + 0 » ramène -0 à 0 pour ne jamais afficher « -0° ».
    return (Math.round(v) + 0) + '°';
  }

  function formaterPourcent(v) {
    return estNombre(v) ? Math.round(v) + ' %' : ABSENT;
  }

  function formaterVent(v) {
    return estNombre(v) ? Math.round(v) + ' km/h' : ABSENT;
  }

  function heureDe(iso) {
    var m = typeof iso === 'string' ? /T(\d{2}:\d{2})/.exec(iso) : null;
    return m ? m[1] : ABSENT;
  }

  // Les dates de l'API sont celles du lieu : on ne compare que des jours
  // calendaires, en UTC, pour ne dépendre d'aucun fuseau.
  function versJourUtc(dateIso) {
    var p = String(dateIso).slice(0, 10).split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function nomJour(dateIso, aujourdhuiIso) {
    var jour = versJourUtc(dateIso);
    var ecart = Math.round((jour - versJourUtc(aujourdhuiIso)) / 86400000);
    if (ecart === 0) return "Aujourd'hui";
    if (ecart === 1) return 'Demain';
    return JOURS[new Date(jour).getUTCDay()];
  }

  function ouNull(v) {
    return v === undefined ? null : v;
  }

  function valeur(tableau, i) {
    return ouNull(tableau ? tableau[i] : null);
  }

  function preparer(reponse) {
    var c = reponse.current;
    var h = reponse.hourly;
    var d = reponse.daily;

    // Comparaison de chaînes ISO tronquées à l'heure : heure du lieu.
    var heureCourante = String(c.time).slice(0, 13);
    var debut = 0;
    while (debut < h.time.length && String(h.time[debut]).slice(0, 13) < heureCourante) debut++;

    var heures = [];
    for (var i = debut; i < h.time.length && heures.length < 24; i++) {
      heures.push({
        heure: h.time[i],
        temp: valeur(h.temperature_2m, i),
        code: valeur(h.weather_code, i),
        pluie: valeur(h.precipitation_probability, i),
        jour: valeur(h.is_day, i) === 1
      });
    }

    var jours = [];
    for (var j = 0; j < d.time.length && jours.length < 7; j++) {
      jours.push({
        date: d.time[j],
        code: valeur(d.weather_code, j),
        max: valeur(d.temperature_2m_max, j),
        min: valeur(d.temperature_2m_min, j),
        pluie: valeur(d.precipitation_probability_max, j)
      });
    }

    return {
      fuseau: reponse.timezone || null,
      actuel: {
        heure: c.time,
        temp: ouNull(c.temperature_2m),
        ressenti: ouNull(c.apparent_temperature),
        humidite: ouNull(c.relative_humidity_2m),
        vent: ouNull(c.wind_speed_10m),
        direction: ouNull(c.wind_direction_10m),
        code: ouNull(c.weather_code),
        jour: c.is_day === 1,
        pluieJour: valeur(d.precipitation_probability_max, 0),
        lever: valeur(d.sunrise, 0),
        coucher: valeur(d.sunset, 0)
      },
      heures: heures,
      jours: jours
    };
  }

  var Meteo = {
    decrireCode: decrireCode,
    directionCardinale: directionCardinale,
    formaterTemp: formaterTemp,
    formaterPourcent: formaterPourcent,
    formaterVent: formaterVent,
    heureDe: heureDe,
    nomJour: nomJour,
    preparer: preparer
  };

  racine.Meteo = Meteo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Meteo;
})(typeof self !== 'undefined' ? self : this);
