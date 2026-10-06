// Appels à Open-Meteo. Ne touche ni à l'écran ni au stockage.
(function (racine) {
  'use strict';

  var URL_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
  var URL_RECHERCHE = 'https://geocoding-api.open-meteo.com/v1/search';
  var DELAI_MS = 12000;

  function erreur(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function urlPrevisions(latitude, longitude) {
    return URL_PREVISIONS +
      '?latitude=' + encodeURIComponent(latitude) +
      '&longitude=' + encodeURIComponent(longitude) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&timezone=auto&forecast_days=7&wind_speed_unit=kmh';
  }

  function urlRecherche(texte) {
    return URL_RECHERCHE + '?name=' + encodeURIComponent(texte) + '&count=8&language=fr&format=json';
  }

  // Renvoie le JSON de l'adresse, ou rejette avec une erreur « reseau » ou « api ».
  function lireJson(url, fetchFn) {
    var f = fetchFn || racine.fetch;
    var controleur = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var minuterie = controleur ? setTimeout(function () { controleur.abort(); }, DELAI_MS) : null;
    var options = controleur ? { signal: controleur.signal } : undefined;

    return Promise.resolve()
      .then(function () { return f(url, options); })
      .then(function (r) {
        if (!r.ok) throw erreur('api', 'Statut HTTP ' + r.status);
        return r.json().catch(function () { throw erreur('api', 'Réponse illisible'); });
      }, function () {
        throw erreur('reseau', 'Connexion impossible');
      })
      .finally(function () { if (minuterie) clearTimeout(minuterie); });
  }

  function chargerPrevisions(latitude, longitude, fetchFn) {
    return lireJson(urlPrevisions(latitude, longitude), fetchFn).then(function (d) {
      if (!d || !d.current || !d.hourly || !d.daily) throw erreur('api', 'Réponse incomplète');
      return d;
    });
  }

  function estNombre(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function chercherVilles(texte, fetchFn) {
    return lireJson(urlRecherche(texte), fetchFn).then(function (d) {
      var resultats = d && Array.isArray(d.results) ? d.results : [];
      return resultats
        .filter(function (r) { return r && estNombre(r.latitude) && estNombre(r.longitude); })
        .map(function (r) {
          return {
            nom: String(r.name || ''),
            region: String(r.admin1 || ''),
            pays: String(r.country || ''),
            latitude: r.latitude,
            longitude: r.longitude
          };
        });
    });
  }

  var Api = {
    urlPrevisions: urlPrevisions,
    urlRecherche: urlRecherche,
    chargerPrevisions: chargerPrevisions,
    chercherVilles: chercherVilles
  };

  racine.Api = Api;
  if (typeof module !== 'undefined' && module.exports) module.exports = Api;
})(typeof self !== 'undefined' ? self : this);
