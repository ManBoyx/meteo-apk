package fr.manboyx.meteo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Pont entre la page et la position du téléphone.
 *
 * La page appelle PontPosition.demander(). La réponse revient par
 * window.surPosition(latitude, longitude, nom) ou par
 * window.surEchecPosition(motif), avec motif parmi « refuse »,
 * « desactivee » et « introuvable ».
 */
final class PontPosition {

    static final int DEMANDE_AUTORISATION = 41;

    private static final long DELAI_MS = 15_000;
    private static final long FRAICHEUR_MS = 5 * 60 * 1000;
    private static final long DELAI_NOM_MS = 4_000;

    private final Activity activite;
    private final WebView vue;
    private final Handler principal = new Handler(Looper.getMainLooper());
    private final ExecutorService arrierePlan = Executors.newSingleThreadExecutor();

    private boolean actif = true;
    private boolean enCours;
    private CancellationSignal annulation;
    private LocationListener ecouteur;
    private Runnable echeance;

    PontPosition(Activity activite, WebView vue) {
        this.activite = activite;
        this.vue = vue;
    }

    /** Appelée par la page, sur un fil qui n'est pas le fil principal. */
    @JavascriptInterface
    public void demander() {
        principal.post(this::commencer);
    }

    private void commencer() {
        if (!actif || enCours) {
            return;
        }
        if (activite.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            enCours = true;
            activite.requestPermissions(
                    new String[] {Manifest.permission.ACCESS_COARSE_LOCATION},
                    DEMANDE_AUTORISATION);
            return;
        }
        localiser();
    }

    /** Réponse de l'utilisateur à la demande d'autorisation. */
    void surAutorisation(boolean accordee) {
        enCours = false;
        if (accordee) {
            localiser();
        } else {
            echec("refuse");
        }
    }

    private void localiser() {
        LocationManager gestionnaire =
                (LocationManager) activite.getSystemService(Context.LOCATION_SERVICE);
        List<String> fournisseurs = fournisseursUtilisables(gestionnaire);
        if (fournisseurs.isEmpty()) {
            echec("desactivee");
            return;
        }

        try {
            Location recente = derniereConnue(gestionnaire, fournisseurs);
            if (recente != null) {
                reussite(recente);
                return;
            }

            enCours = true;
            echeance = () -> {
                arreter();
                echec("introuvable");
            };
            principal.postDelayed(echeance, DELAI_MS);

            String fournisseur = fournisseurs.get(0);
            if (Build.VERSION.SDK_INT >= 30) {
                annulation = new CancellationSignal();
                gestionnaire.getCurrentLocation(fournisseur, annulation,
                        activite.getMainExecutor(), this::surPosition);
            } else {
                ecouteur = new LocationListener() {
                    @Override
                    public void onLocationChanged(Location position) {
                        surPosition(position);
                    }

                    // Sans corps par défaut avant Android 11.
                    @Override
                    public void onStatusChanged(String f, int statut, Bundle extras) {
                    }

                    @Override
                    public void onProviderEnabled(String f) {
                    }

                    @Override
                    public void onProviderDisabled(String f) {
                    }
                };
                demanderUneFois(gestionnaire, fournisseur);
            }
        } catch (SecurityException | IllegalArgumentException e) {
            arreter();
            echec("introuvable");
        }
    }

    // L'autorisation est vérifiée dans commencer(), et localiser() rattrape
    // une SecurityException si elle a été retirée entre-temps.
    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private void demanderUneFois(LocationManager gestionnaire, String fournisseur) {
        gestionnaire.requestSingleUpdate(fournisseur, ecouteur, Looper.getMainLooper());
    }

    private void surPosition(Location position) {
        if (!enCours) {
            return;
        }
        arreter();
        if (position == null) {
            echec("introuvable");
        } else {
            reussite(position);
        }
    }

    /**
     * Avec la seule autorisation de position approximative, le GPS n'est
     * accessible qu'à partir d'Android 12, comme le fournisseur « fused ».
     */
    private static List<String> fournisseursUtilisables(LocationManager gestionnaire) {
        List<String> candidats = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            candidats.add(LocationManager.FUSED_PROVIDER);
        }
        candidats.add(LocationManager.NETWORK_PROVIDER);
        if (Build.VERSION.SDK_INT >= 31) {
            candidats.add(LocationManager.GPS_PROVIDER);
        }

        List<String> existants = gestionnaire.getAllProviders();
        List<String> utilisables = new ArrayList<>();
        for (String f : candidats) {
            try {
                if (existants.contains(f) && gestionnaire.isProviderEnabled(f)) {
                    utilisables.add(f);
                }
            } catch (SecurityException | IllegalArgumentException e) {
                // Fournisseur inutilisable sur cet appareil : on passe au suivant.
            }
        }
        return utilisables;
    }

    // Même garantie que pour demanderUneFois().
    @SuppressLint("MissingPermission")
    private static Location derniereConnue(LocationManager gestionnaire, List<String> fournisseurs) {
        Location meilleure = null;
        long maintenant = SystemClock.elapsedRealtimeNanos();
        for (String f : fournisseurs) {
            Location l = gestionnaire.getLastKnownLocation(f);
            if (l == null) {
                continue;
            }
            long ageMs = (maintenant - l.getElapsedRealtimeNanos()) / 1_000_000;
            if (ageMs <= FRAICHEUR_MS
                    && (meilleure == null
                    || l.getElapsedRealtimeNanos() > meilleure.getElapsedRealtimeNanos())) {
                meilleure = l;
            }
        }
        return meilleure;
    }

    private void reussite(Location position) {
        final double latitude = position.getLatitude();
        final double longitude = position.getLongitude();
        if (Double.isNaN(latitude) || Double.isNaN(longitude)
                || Double.isInfinite(latitude) || Double.isInfinite(longitude)) {
            echec("introuvable");
            return;
        }
        // Le nom du lieu demande un appel réseau : jamais sur le fil principal,
        // et sans retarder la météo au-delà de quelques secondes.
        final Future<String> nom = arrierePlan.submit(() -> nomDuLieu(latitude, longitude));
        new Thread(() -> {
            String lieu = "";
            try {
                lieu = nom.get(DELAI_NOM_MS, TimeUnit.MILLISECONDS);
            } catch (Exception e) {
                nom.cancel(true);
            }
            final String script = "window.surPosition(" + latitude + "," + longitude + ","
                    + JSONObject.quote(lieu) + ")";
            principal.post(() -> envoyer(script));
        }, "nom-du-lieu").start();
    }

    @SuppressWarnings("deprecation")
    private String nomDuLieu(double latitude, double longitude) {
        if (!Geocoder.isPresent()) {
            return "";
        }
        try {
            List<Address> adresses = new Geocoder(activite, Locale.FRENCH)
                    .getFromLocation(latitude, longitude, 1);
            if (adresses == null || adresses.isEmpty()) {
                return "";
            }
            Address a = adresses.get(0);
            for (String nom : new String[] {a.getLocality(), a.getSubAdminArea(), a.getAdminArea()}) {
                if (nom != null && !nom.trim().isEmpty()) {
                    return nom.trim();
                }
            }
            return "";
        } catch (Exception e) {
            // Pas de réseau ou service absent : la page affichera « Ma position ».
            return "";
        }
    }

    private void echec(String motif) {
        envoyer("window.surEchecPosition(" + JSONObject.quote(motif) + ")");
    }

    private void envoyer(String script) {
        if (actif) {
            vue.evaluateJavascript(script, null);
        }
    }

    private void arreter() {
        enCours = false;
        if (echeance != null) {
            principal.removeCallbacks(echeance);
            echeance = null;
        }
        if (annulation != null) {
            annulation.cancel();
            annulation = null;
        }
        if (ecouteur != null) {
            LocationManager gestionnaire =
                    (LocationManager) activite.getSystemService(Context.LOCATION_SERVICE);
            gestionnaire.removeUpdates(ecouteur);
            ecouteur = null;
        }
    }

    /** À appeler quand l'écran est détruit : plus rien n'est envoyé à la page. */
    void detruire() {
        actif = false;
        arreter();
        arrierePlan.shutdownNow();
    }
}
