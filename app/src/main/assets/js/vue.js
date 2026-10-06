// Rendu : reçoit des données prêtes et produit du HTML. Aucun appel réseau.
// Tout texte venu de l'extérieur passe par echapper().
(function (racine) {
  'use strict';

  var Meteo = racine.Meteo || require('./meteo.js');

  var ABSENT = '–';

  function echapper(texte) {
    if (texte === null || texte === undefined) return '';
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- Icônes météo (repère 48 × 48) ----

  var FORME_NUAGE = 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z';
  var FORME_LUNE = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

  function nuage(transformation) {
    return '<path class="i-nuage" transform="' + transformation + '" d="' + FORME_NUAGE + '"/>';
  }

  var NUAGE_HAUT = nuage('translate(4 -2) scale(1.667)');
  var NUAGE_BAS = nuage('translate(10 14) scale(1.5)');

  var ICONES = {
    soleil: '<circle class="i-soleil" cx="24" cy="24" r="9"/>' +
      '<path class="i-rayons" d="M38 24h4M24 38v4M6 24h4M24 6v4M33.9 33.9l2.8 2.8M14.1 33.9l-2.8 2.8M14.1 14.1l-2.8-2.8M33.9 14.1l2.8-2.8"/>',
    lune: '<path class="i-lune" transform="translate(4 4) scale(1.667)" d="' + FORME_LUNE + '"/>',
    eclaircies: '<circle class="i-soleil" cx="16" cy="16" r="6"/>' +
      '<path class="i-rayons" d="M16 3.5v3M3.5 16h3M9.3 9.3L7.2 7.2M22.7 9.3l2.1-2.1M9.3 22.7l-2.1 2.1M25.5 16h3"/>' +
      NUAGE_BAS,
    'eclaircies-nuit': '<path class="i-lune" transform="translate(3 1) scale(0.95)" d="' + FORME_LUNE + '"/>' + NUAGE_BAS,
    nuage: nuage('translate(4 4) scale(1.667)'),
    brouillard: NUAGE_HAUT + '<path class="i-brume" d="M10 37h28M15 43h18"/>',
    bruine: NUAGE_HAUT + '<path class="i-pluie" d="M16 36v2M24 36v2M32 36v2M20 42v2M28 42v2"/>',
    pluie: NUAGE_HAUT + '<path class="i-pluie" d="M17 35l-3 8M25 35l-3 8M33 35l-3 8"/>',
    averses: NUAGE_HAUT + '<path class="i-pluie" d="M15 35l-2 5M22 35l-4 10M29 35l-2 5M36 35l-4 10"/>',
    neige: NUAGE_HAUT + '<g class="i-neige"><circle cx="16" cy="38" r="2.3"/><circle cx="24" cy="43" r="2.3"/><circle cx="32" cy="38" r="2.3"/></g>',
    orage: NUAGE_HAUT + '<path class="i-eclair" d="M26 29l-8 10h5.5l-3 8L31 35.5h-5.5l3-6.5z"/>'
  };

  function icone(nom, libelle) {
    var corps = ICONES[nom] || ICONES.nuage;
    var acces = libelle
      ? ' role="img" aria-label="' + echapper(libelle) + '"'
      : ' aria-hidden="true"';
    return '<svg class="ic" viewBox="0 0 48 48" focusable="false"' + acces + '>' + corps + '</svg>';
  }

  // ---- Pictogrammes d'interface (repère 24 × 24, au trait) ----

  var PICTOS = {
    etoile: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    vent: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
    goutte: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    parapluie: '<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>',
    lever: '<path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4"/>',
    fermer: '<path d="M18 6L6 18M6 6l12 12"/>',
    actualiser: '<path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    horsligne: '<path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>'
  };

  function picto(nom) {
    return '<svg class="picto" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + PICTOS[nom] + '</svg>';
  }

  // ---- Aides de mise en forme ----

  var NOMS_DIRECTIONS = {
    N: 'Nord', NE: 'Nord-est', E: 'Est', SE: 'Sud-est',
    S: 'Sud', SO: 'Sud-ouest', O: 'Ouest', NO: 'Nord-ouest'
  };

  // Fond de la carte principale selon l'état du ciel.
  var CIELS = {
    soleil: 'jour', eclaircies: 'jour',
    lune: 'nuit', 'eclaircies-nuit': 'nuit',
    nuage: 'gris', brouillard: 'gris',
    bruine: 'pluie', pluie: 'pluie', averses: 'pluie',
    neige: 'neige', orage: 'orage'
  };

  function deuxChiffres(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // Heure de réception, selon l'horloge du téléphone.
  function formaterRecu(recuLe, maintenant) {
    var d = new Date(recuLe);
    var m = new Date(maintenant);
    var heure = deuxChiffres(d.getHours()) + ':' + deuxChiffres(d.getMinutes());
    var memeJour = d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth() && d.getDate() === m.getDate();
    if (memeJour) return heure;
    return 'le ' + deuxChiffres(d.getDate()) + '/' + deuxChiffres(d.getMonth() + 1) + ' à ' + heure;
  }

  function lieuDe(ville) {
    return [ville.region, ville.pays].filter(Boolean).join(', ');
  }

  function heureCourte(iso) {
    var h = Meteo.heureDe(iso);
    return h === ABSENT ? ABSENT : h.slice(0, 2) + ' h';
  }

  function estNombre(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // ---- Blocs de l'écran ----

  function enTete(ville, favori) {
    var lieu = lieuDe(ville);
    return '<div class="lieu">' +
      '<div class="lieu-texte"><h1>' + echapper(ville.nom) + '</h1>' +
      (lieu ? '<p class="region">' + echapper(lieu) + '</p>' : '') + '</div>' +
      '<button type="button" class="rond etoile" data-action="favori" aria-pressed="' + (favori ? 'true' : 'false') +
      '" aria-label="Favori">' + picto('etoile') + '</button>' +
      '</div>';
  }

  function tuile(nomPicto, nom, valeur, sous) {
    return '<div class="tuile"><span class="t-picto">' + picto(nomPicto) + '</span>' +
      '<span class="t-nom">' + nom + '</span>' +
      '<span class="t-val">' + echapper(valeur) + '</span>' +
      '<span class="t-sous">' + echapper(sous) + '</span></div>';
  }

  function blocHeures(heures) {
    if (!heures.length) return '';
    var cases = heures.map(function (h) {
      var d = Meteo.decrireCode(h.code, h.jour);
      return '<li class="heure"><span class="h-heure">' + heureCourte(h.heure) + '</span>' +
        icone(d.icone, d.libelle) +
        '<span class="h-temp">' + Meteo.formaterTemp(h.temp) + '</span>' +
        '<span class="h-pluie">' + Meteo.formaterPourcent(h.pluie) + '</span></li>';
    }).join('');
    return '<section class="carte"><h2>Prochaines heures</h2><ol class="heures">' + cases + '</ol></section>';
  }

  function blocJours(jours, aujourdhui) {
    if (!jours.length) return '';
    var mins = jours.map(function (j) { return j.min; }).filter(estNombre);
    var maxs = jours.map(function (j) { return j.max; }).filter(estNombre);
    var bas = mins.length ? Math.min.apply(null, mins) : 0;
    var haut = maxs.length ? Math.max.apply(null, maxs) : 0;
    var etendue = haut - bas || 1;

    var lignes = jours.map(function (j) {
      var d = Meteo.decrireCode(j.code, true);
      var barre = '';
      if (estNombre(j.min) && estNombre(j.max)) {
        var gauche = Math.round(((j.min - bas) / etendue) * 100);
        var largeur = Math.max(6, Math.round(((j.max - j.min) / etendue) * 100));
        if (gauche + largeur > 100) gauche = 100 - largeur;
        barre = '<i style="left:' + gauche + '%;width:' + largeur + '%"></i>';
      }
      return '<li class="jour"><span class="j-nom">' + echapper(Meteo.nomJour(j.date, aujourdhui)) + '</span>' +
        '<span class="j-icone">' + icone(d.icone, d.libelle) + '</span>' +
        '<span class="j-pluie">' + Meteo.formaterPourcent(j.pluie) + '</span>' +
        '<span class="j-min">' + Meteo.formaterTemp(j.min) + '</span>' +
        '<span class="j-barre">' + barre + '</span>' +
        '<span class="j-max">' + Meteo.formaterTemp(j.max) + '</span></li>';
    }).join('');
    return '<section class="carte"><h2>Prochains jours</h2><ol class="jours">' + lignes + '</ol></section>';
  }

  function rendreMeteo(ville, previsions, options) {
    var a = previsions.actuel;
    var d = Meteo.decrireCode(a.code, a.jour);
    var cardinal = Meteo.directionCardinale(a.direction);
    var recu = formaterRecu(options.recuLe, options.maintenant);

    var bandeau = options.horsLigne
      ? '<p class="bandeau" role="status">' + picto('horsligne') +
        '<span>Hors connexion — données de ' + echapper(recu) + '</span></p>'
      : '';

    return bandeau +
      '<section class="ciel ciel-' + (CIELS[d.icone] || 'gris') + '">' +
      enTete(ville, options.favori) +
      '<div class="actuel">' + icone(d.icone) +
      '<p class="temp">' + Meteo.formaterTemp(a.temp) + '</p></div>' +
      '<p class="etat">' + echapper(d.libelle) + '</p>' +
      '<p class="ressenti">Ressenti ' + Meteo.formaterTemp(a.ressenti) + '</p>' +
      '</section>' +
      '<section class="tuiles">' +
      tuile('vent', 'Vent', Meteo.formaterVent(a.vent), NOMS_DIRECTIONS[cardinal] || ABSENT) +
      tuile('goutte', 'Humidité', Meteo.formaterPourcent(a.humidite), 'de l’air') +
      tuile('parapluie', 'Risque de pluie', Meteo.formaterPourcent(a.pluieJour), 'aujourd’hui') +
      tuile('lever', 'Lever du soleil', Meteo.heureDe(a.lever), 'Coucher ' + Meteo.heureDe(a.coucher)) +
      '</section>' +
      blocHeures(previsions.heures) +
      blocJours(previsions.jours, a.heure) +
      '<footer class="pied">Données météo : <a href="https://open-meteo.com/">Open-Meteo.com</a>' +
      '<span class="pied-maj">Mis à jour ' + (recu.indexOf('le ') === 0 ? '' : 'à ') + echapper(recu) + '</span></footer>';
  }

  function rendreChargement(ville) {
    return '<section class="ciel ciel-gris attente">' + enTete(ville, false) +
      '<p class="etat" role="status">Chargement…</p></section>';
  }

  function rendreErreur(ville, message) {
    return '<section class="carte erreur"><h1>' + echapper(ville.nom) + '</h1>' +
      '<p role="alert">' + echapper(message) + '</p>' +
      '<button type="button" class="bouton" data-action="actualiser">Réessayer</button></section>';
  }

  function rendreVilles(villes, options) {
    if (!villes.length) return '<p class="vide">' + echapper(options.vide) + '</p>';
    return '<ul class="villes">' + villes.map(function (v, i) {
      var lieu = lieuDe(v);
      return '<li><button type="button" class="ville" data-action="choisir" data-index="' + i + '">' +
        '<span class="v-nom">' + echapper(v.nom) + '</span>' +
        (lieu ? '<span class="v-lieu">' + echapper(lieu) + '</span>' : '') + '</button>' +
        (options.retirable
          ? '<button type="button" class="rond" data-action="retirer" data-index="' + i +
            '" aria-label="Retirer ' + echapper(v.nom) + ' des favoris">' + picto('fermer') + '</button>'
          : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  var Vue = {
    echapper: echapper,
    icone: icone,
    formaterRecu: formaterRecu,
    rendreMeteo: rendreMeteo,
    rendreChargement: rendreChargement,
    rendreErreur: rendreErreur,
    rendreVilles: rendreVilles
  };

  racine.Vue = Vue;
  if (typeof module !== 'undefined' && module.exports) module.exports = Vue;
})(typeof self !== 'undefined' ? self : this);
