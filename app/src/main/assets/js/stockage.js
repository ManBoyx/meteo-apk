// Seul module qui lit ou écrit la mémoire locale (localStorage).
(function (racine) {
  'use strict';

  var CLE_VILLE = 'meteo.ville';
  var CLE_FAVORIS = 'meteo.favoris';
  var CLE_PREVISIONS = 'meteo.previsions';

  var PARIS = { nom: 'Paris', region: 'Île-de-France', pays: 'France', latitude: 48.85, longitude: 2.35 };

  function estNombre(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Renvoie une ville propre, ou null si la valeur n'en est pas une.
  function versVille(v) {
    if (!v || typeof v !== 'object' || typeof v.nom !== 'string' || !v.nom) return null;
    if (!estNombre(v.latitude) || !estNombre(v.longitude)) return null;
    return {
      nom: v.nom,
      region: typeof v.region === 'string' ? v.region : '',
      pays: typeof v.pays === 'string' ? v.pays : '',
      latitude: v.latitude,
      longitude: v.longitude
    };
  }

  // Deux villes sont le même lieu si leurs coordonnées coïncident à 0,01° près.
  function memeLieu(a, b) {
    return Math.round(a.latitude * 100) === Math.round(b.latitude * 100) &&
      Math.round(a.longitude * 100) === Math.round(b.longitude * 100);
  }

  function creer(magasin) {
    function lire(cle) {
      try {
        return JSON.parse(magasin.getItem(cle));
      } catch (e) {
        return null;
      }
    }

    function ecrire(cle, valeur) {
      try {
        magasin.setItem(cle, JSON.stringify(valeur));
      } catch (e) {
        // Mémoire pleine ou indisponible : l'appli continue sans mémoriser.
      }
    }

    function lireVille() {
      return versVille(lire(CLE_VILLE)) || versVille(PARIS);
    }

    function ecrireVille(ville) {
      ecrire(CLE_VILLE, ville);
    }

    function lireFavoris() {
      var brut = lire(CLE_FAVORIS);
      if (!Array.isArray(brut)) return [];
      return brut.map(versVille).filter(Boolean);
    }

    function estFavori(ville) {
      return lireFavoris().some(function (f) { return memeLieu(f, ville); });
    }

    function basculerFavori(ville) {
      var favoris = lireFavoris();
      var sans = favoris.filter(function (f) { return !memeLieu(f, ville); });
      var ajoute = sans.length === favoris.length;
      if (ajoute) sans.push(versVille(ville));
      ecrire(CLE_FAVORIS, sans);
      return ajoute;
    }

    function lirePrevisions(ville) {
      var brut = lire(CLE_PREVISIONS);
      if (!brut || typeof brut !== 'object' || !brut.donnees || !estNombre(brut.recuLe)) return null;
      var lieu = versVille(brut.ville);
      if (!lieu || !memeLieu(lieu, ville)) return null;
      return { donnees: brut.donnees, recuLe: brut.recuLe };
    }

    function ecrirePrevisions(ville, donnees, recuLe) {
      ecrire(CLE_PREVISIONS, { ville: ville, donnees: donnees, recuLe: recuLe });
    }

    return {
      lireVille: lireVille,
      ecrireVille: ecrireVille,
      lireFavoris: lireFavoris,
      estFavori: estFavori,
      basculerFavori: basculerFavori,
      lirePrevisions: lirePrevisions,
      ecrirePrevisions: ecrirePrevisions
    };
  }

  var Stockage = { creer: creer };

  racine.Stockage = Stockage;
  if (typeof module !== 'undefined' && module.exports) module.exports = Stockage;
})(typeof self !== 'undefined' ? self : this);
