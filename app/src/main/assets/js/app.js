// Enchaînement : relie l'API, la mémoire et l'écran.
(function (racine) {
  'use strict';

  var MSG_RESEAU = 'Pas de connexion à Internet.';
  var MSG_SERVICE = 'Le service météo ne répond pas pour le moment.';
  var MSG_RECHERCHE_RESEAU = 'Recherche impossible : pas de connexion à Internet.';
  var MSG_RECHERCHE_SERVICE = 'Recherche impossible pour le moment.';

  // Cœur de l'appli, sans DOM : tout ce qui est affiché passe par
  // dep.afficher (écran principal) et dep.afficherRecherche (panneau).
  function creer(dep) {
    var api = dep.api;
    var stockage = dep.stockage;
    var meteo = dep.meteo;
    var afficherRecherche = dep.afficherRecherche || function () {};
    var maintenant = dep.maintenant || Date.now;

    var ville = stockage.lireVille();
    var dernier = null;
    // Numéros de tour : une réponse qui arrive après un nouvel appel est ignorée.
    var tour = 0;
    var tourRecherche = 0;

    function montrer(etat) {
      etat.favori = stockage.estFavori(etat.ville);
      dernier = etat;
      dep.afficher(etat);
    }

    function preparer(donnees) {
      try {
        return meteo.preparer(donnees);
      } catch (e) {
        return null;
      }
    }

    function charger(nouvelle) {
      var moi = ++tour;
      ville = nouvelle;
      stockage.ecrireVille(nouvelle);

      var memoire = stockage.lirePrevisions(nouvelle);
      var anciennes = memoire ? preparer(memoire.donnees) : null;
      if (anciennes) {
        montrer({ type: 'meteo', ville: nouvelle, previsions: anciennes, recuLe: memoire.recuLe, horsLigne: false, enCours: true });
      } else {
        montrer({ type: 'chargement', ville: nouvelle });
      }

      return api.chargerPrevisions(nouvelle.latitude, nouvelle.longitude).then(function (donnees) {
        if (moi !== tour) return;
        var previsions = preparer(donnees);
        if (!previsions) {
          var e = new Error('Réponse inexploitable');
          e.code = 'api';
          throw e;
        }
        var recuLe = maintenant();
        stockage.ecrirePrevisions(nouvelle, donnees, recuLe);
        montrer({ type: 'meteo', ville: nouvelle, previsions: previsions, recuLe: recuLe, horsLigne: false, enCours: false });
      }).catch(function (e) {
        if (moi !== tour) return;
        if (anciennes) {
          montrer({ type: 'meteo', ville: nouvelle, previsions: anciennes, recuLe: memoire.recuLe, horsLigne: true, enCours: false });
        } else {
          montrer({ type: 'erreur', ville: nouvelle, message: e && e.code === 'reseau' ? MSG_RESEAU : MSG_SERVICE });
        }
      });
    }

    function actualiser() {
      return charger(ville);
    }

    function reafficher() {
      if (dernier) montrer(dernier);
    }

    function basculerFavori() {
      stockage.basculerFavori(ville);
      reafficher();
    }

    function retirerFavori(v) {
      if (stockage.estFavori(v)) stockage.basculerFavori(v);
      afficherRecherche({ type: 'favoris', villes: stockage.lireFavoris() });
      reafficher();
    }

    function rechercher(texte) {
      var moi = ++tourRecherche;
      var propre = String(texte || '').trim();
      if (propre.length < 2) {
        afficherRecherche({ type: 'favoris', villes: stockage.lireFavoris() });
        return Promise.resolve();
      }
      afficherRecherche({ type: 'attente' });
      return api.chercherVilles(propre).then(function (villes) {
        if (moi !== tourRecherche) return;
        afficherRecherche({ type: 'resultats', villes: villes });
      }, function (e) {
        if (moi !== tourRecherche) return;
        afficherRecherche({
          type: 'erreur',
          message: e && e.code === 'reseau' ? MSG_RECHERCHE_RESEAU : MSG_RECHERCHE_SERVICE
        });
      });
    }

    return {
      charger: charger,
      actualiser: actualiser,
      basculerFavori: basculerFavori,
      retirerFavori: retirerFavori,
      rechercher: rechercher,
      villeCourante: function () { return ville; },
      etat: function () { return dernier; }
    };
  }

  // ---- Branchement sur la page ----

  var DELAI_FRAPPE_MS = 300;
  var FRAICHEUR_MS = 10 * 60 * 1000;
  var MOTIFS_POSITION = {
    refuse: 'Autorisation de position refusée.',
    desactivee: 'La localisation est désactivée sur le téléphone.',
    introuvable: 'Position introuvable.'
  };

  function demarrer(document) {
    var Api = racine.Api;
    var Stockage = racine.Stockage;
    var Meteo = racine.Meteo;
    var Vue = racine.Vue;

    var contenu = document.getElementById('contenu');
    var panneau = document.getElementById('recherche');
    var champ = document.getElementById('champ');
    var liste = document.getElementById('liste');
    var annonce = document.getElementById('annonce');

    var villesListees = [];
    var minuterieFrappe = null;
    var minuterieAnnonce = null;

    function magasinLocal() {
      try {
        return racine.localStorage;
      } catch (e) {
        return null;
      }
    }

    function annoncer(message) {
      annonce.textContent = message;
      annonce.hidden = false;
      clearTimeout(minuterieAnnonce);
      minuterieAnnonce = setTimeout(function () { annonce.hidden = true; }, 4000);
    }

    function afficher(etat) {
      // Le bandeau des heures garde sa position quand l'écran est redessiné.
      var bande = contenu.querySelector('.heures');
      var defilement = bande ? bande.scrollLeft : 0;

      if (etat.type === 'meteo') {
        contenu.innerHTML = Vue.rendreMeteo(etat.ville, etat.previsions, {
          recuLe: etat.recuLe,
          maintenant: Date.now(),
          horsLigne: etat.horsLigne,
          favori: etat.favori,
          enCours: etat.enCours
        });
      } else if (etat.type === 'erreur') {
        contenu.innerHTML = Vue.rendreErreur(etat.ville, etat.message);
      } else {
        contenu.innerHTML = Vue.rendreChargement(etat.ville);
      }

      var nouvelleBande = contenu.querySelector('.heures');
      if (nouvelleBande && defilement) nouvelleBande.scrollLeft = defilement;
      document.body.classList.toggle('en-cours', etat.type === 'chargement' || etat.enCours === true);
    }

    function afficherRecherche(etat) {
      villesListees = etat.villes || [];
      if (etat.type === 'favoris') {
        liste.innerHTML = '<h2>Favoris</h2>' + Vue.rendreVilles(etat.villes, {
          vide: 'Aucun favori. Touchez l’étoile à côté du nom d’une ville pour l’ajouter.',
          retirable: true
        });
      } else if (etat.type === 'resultats') {
        liste.innerHTML = Vue.rendreVilles(etat.villes, { vide: 'Aucune ville trouvée.' });
      } else if (etat.type === 'attente') {
        liste.innerHTML = '<p class="vide" role="status">Recherche…</p>';
      } else {
        liste.innerHTML = '<p class="vide" role="alert">' + Vue.echapper(etat.message) + '</p>';
      }
    }

    var app = creer({
      api: Api,
      stockage: Stockage.creer(magasinLocal()),
      meteo: Meteo,
      afficher: afficher,
      afficherRecherche: afficherRecherche,
      maintenant: Date.now
    });

    function ouvrirRecherche() {
      champ.value = '';
      app.rechercher('');
      if (!panneau.open) panneau.showModal();
      champ.focus();
    }

    function fermerRecherche() {
      clearTimeout(minuterieFrappe);
      if (panneau.open) panneau.close();
    }

    function demanderPosition() {
      if (racine.PontPosition && typeof racine.PontPosition.demander === 'function') {
        annoncer('Recherche de la position…');
        racine.PontPosition.demander();
      } else if (racine.navigator && racine.navigator.geolocation) {
        annoncer('Recherche de la position…');
        racine.navigator.geolocation.getCurrentPosition(function (p) {
          racine.surPosition(p.coords.latitude, p.coords.longitude, '');
        }, function (e) {
          racine.surEchecPosition(e && e.code === 1 ? 'refuse' : 'introuvable');
        }, { timeout: 15000, maximumAge: 300000 });
      } else {
        racine.surEchecPosition('introuvable');
      }
    }

    // Appelées par la coque Android (ou par le repli ci-dessus).
    racine.surPosition = function (latitude, longitude, nom) {
      if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
          !isFinite(latitude) || !isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        racine.surEchecPosition('introuvable');
        return;
      }
      annonce.hidden = true;
      fermerRecherche();
      // Arrondi à 0,01° (environ 1 km) : assez pour la météo, et rien de plus
      // précis n'est envoyé au service.
      app.charger({
        nom: typeof nom === 'string' && nom.trim() ? nom.trim() : 'Ma position',
        region: '',
        pays: '',
        latitude: Math.round(latitude * 100) / 100,
        longitude: Math.round(longitude * 100) / 100
      });
    };

    racine.surEchecPosition = function (motif) {
      annoncer(MOTIFS_POSITION[motif] || MOTIFS_POSITION.introuvable);
    };

    // Bouton retour d'Android : vrai si la page a traité le retour elle-même.
    racine.surRetour = function () {
      if (panneau.open) {
        fermerRecherche();
        return true;
      }
      return false;
    };

    var ACTIONS = {
      'ouvrir-recherche': ouvrirRecherche,
      'fermer-recherche': fermerRecherche,
      position: demanderPosition,
      actualiser: function () { app.actualiser(); },
      favori: function () { app.basculerFavori(); },
      choisir: function (cible) {
        var v = villesListees[Number(cible.getAttribute('data-index'))];
        if (!v) return;
        fermerRecherche();
        racine.scrollTo(0, 0);
        app.charger(v);
      },
      retirer: function (cible) {
        var v = villesListees[Number(cible.getAttribute('data-index'))];
        if (v) app.retirerFavori(v);
      }
    };

    document.addEventListener('click', function (evenement) {
      var cible = evenement.target.closest ? evenement.target.closest('[data-action]') : null;
      if (!cible) return;
      var action = ACTIONS[cible.getAttribute('data-action')];
      if (action) action(cible);
    });

    champ.addEventListener('input', function () {
      clearTimeout(minuterieFrappe);
      var texte = champ.value;
      if (texte.trim().length < 2) {
        app.rechercher(texte);
        return;
      }
      minuterieFrappe = setTimeout(function () { app.rechercher(texte); }, DELAI_FRAPPE_MS);
    });

    document.getElementById('formulaire').addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      clearTimeout(minuterieFrappe);
      app.rechercher(champ.value);
      champ.blur();
    });

    // Clic sur le fond assombri : ferme le panneau.
    panneau.addEventListener('click', function (evenement) {
      if (evenement.target === panneau) fermerRecherche();
    });

    function actualiserSiAncien() {
      var e = app.etat();
      if (!e || document.hidden) return;
      var ancien = e.type !== 'meteo' || e.horsLigne || Date.now() - e.recuLe > FRAICHEUR_MS;
      if (ancien && e.type !== 'chargement' && !e.enCours) app.actualiser();
    }

    document.addEventListener('visibilitychange', actualiserSiAncien);
    racine.addEventListener('online', actualiserSiAncien);

    app.charger(app.villeCourante());
  }

  var App = { creer: creer, demarrer: demarrer };

  racine.App = App;
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
  if (typeof document !== 'undefined') demarrer(document);
})(typeof self !== 'undefined' ? self : this);
