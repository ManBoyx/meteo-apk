package fr.manboyx.meteo;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

/**
 * Coque de l'application : un WebView qui affiche la page embarquée.
 * Toute la logique météo est dans assets/js.
 */
public class MainActivity extends Activity {

    private static final String PAGE = "file:///android_asset/index.html";

    private FrameLayout cadre;
    private WebView vue;
    private PontPosition pont;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);

        cadre = new FrameLayout(this);
        cadre.setBackgroundColor(getColor(R.color.fond));
        vue = new WebView(this);
        vue.setBackgroundColor(getColor(R.color.fond));
        cadre.addView(vue, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(cadre);
        gererMarges();

        WebSettings reglages = vue.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);
        // Les fichiers de assets/ restent lisibles ; le reste du téléphone ne l'est pas.
        reglages.setAllowFileAccess(false);
        reglages.setAllowContentAccess(false);
        reglages.setGeolocationEnabled(false);
        reglages.setSupportZoom(false);
        reglages.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        vue.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest demande) {
                Uri adresse = demande.getUrl();
                if (PAGE.equals(adresse.toString())) {
                    return false;
                }
                // Le WebView ne quitte jamais la page embarquée : les liens
                // (Open-Meteo) s'ouvrent dans le navigateur du téléphone.
                ouvrirDehors(adresse);
                return true;
            }
        });

        pont = new PontPosition(this, vue);
        vue.addJavascriptInterface(pont, "PontPosition");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::surRetour);
        }

        vue.loadUrl(PAGE);
    }

    /**
     * À partir d'Android 11, l'appli s'affiche bord à bord (imposé à partir
     * d'Android 15) : la place des barres système, de l'encoche et du clavier
     * est réservée ici, autour du WebView.
     */
    private void gererMarges() {
        if (Build.VERSION.SDK_INT < 30) {
            return;
        }
        getWindow().setDecorFitsSystemWindows(false);
        cadre.setOnApplyWindowInsetsListener((v, marges) -> {
            Insets m = marges.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout()
                    | WindowInsets.Type.ime());
            v.setPadding(m.left, m.top, m.right, m.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    private void ouvrirDehors(Uri adresse) {
        String protocole = adresse.getScheme();
        if (!"https".equals(protocole) && !"http".equals(protocole)) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, adresse));
        } catch (ActivityNotFoundException e) {
            // Aucun navigateur installé : le lien reste sans effet.
        }
    }

    /** La page ferme d'abord son panneau de recherche ; sinon on quitte. */
    private void surRetour() {
        vue.evaluateJavascript(
                "typeof window.surRetour === 'function' && window.surRetour() === true",
                resultat -> {
                    if (!"true".equals(resultat)) {
                        finish();
                    }
                });
    }

    // Avant Android 13, le bouton retour passe encore par ici ; à partir
    // d'Android 13, c'est le rappel enregistré dans onCreate() qui sert.
    @Override
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        surRetour();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] autorisations, int[] reponses) {
        super.onRequestPermissionsResult(code, autorisations, reponses);
        if (code == PontPosition.DEMANDE_AUTORISATION) {
            pont.surAutorisation(reponses.length > 0
                    && reponses[0] == PackageManager.PERMISSION_GRANTED);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        vue.onResume();
    }

    @Override
    protected void onPause() {
        vue.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        pont.detruire();
        cadre.removeView(vue);
        vue.destroy();
        super.onDestroy();
    }
}
