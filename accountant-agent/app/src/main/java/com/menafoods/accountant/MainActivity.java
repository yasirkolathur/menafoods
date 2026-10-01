package com.menafoods.accountant;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.Manifest;
import android.graphics.Color;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int RECORD_AUDIO_REQUEST = 1002;
    private static final String APP_URL = "file:///android_asset/index.html";
    private static final String APP_SCHEME = "mfapp";
    private static final String MIDDLEWARE_HOST = "menafoodscustomermiddleware-809407193.development.catalystserverless.com";
    private static final String AUTH_LOGIN_PATH = "/__catalyst/auth/login";
    private static final String PREFS_NAME = "accountant_auth";
    private static final String SIGNED_OUT_KEY = "signed_out";
    private static final String AUTH_IN_PROGRESS_KEY = "auth_in_progress";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean authInProgress;
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech tts;
    private String pendingListenLocale;

    /** Native bridge for Accountant Drive Mode: speech-to-text input and text-to-speech output only. */
    private final class DriveModeBridge {
        @JavascriptInterface
        public boolean isSupported() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }
        @JavascriptInterface
        public void startListening(final String locale) {
            mainHandler.post(() -> beginListening(locale));
        }
        @JavascriptInterface
        public void stopListening() {
            mainHandler.post(MainActivity.this::stopListeningInternal);
        }
        @JavascriptInterface
        public void speak(final String text, final String locale) {
            mainHandler.post(() -> speakText(text, locale));
        }
        @JavascriptInterface
        public void stopSpeaking() {
            mainHandler.post(() -> { if (tts != null) tts.stop(); });
        }
    }

    private void beginListening(String locale) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingListenLocale = locale;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
            return;
        }
        startRecognizer(locale);
    }

    private void startRecognizer(String locale) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            dispatchDriveEvent("error", "unsupported");
            return;
        }
        stopListeningInternal();
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { dispatchDriveEvent("listening", ""); }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { dispatchDriveEvent("processing", ""); }
            @Override public void onError(int error) { dispatchDriveEvent("error", String.valueOf(error)); }
            @Override public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                dispatchDriveEvent("result", (matches != null && !matches.isEmpty()) ? matches.get(0) : "");
            }
            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                if (!text.isEmpty()) dispatchDriveEvent("partial", text);
            }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if (locale != null && !locale.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        try {
            speechRecognizer.startListening(intent);
        } catch (Exception e) {
            dispatchDriveEvent("error", "start_failed");
        }
    }

    private void stopListeningInternal() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
    }

    private void speakText(String text, String locale) {
        if (tts == null || text == null || text.isEmpty()) return;
        if (locale != null && !locale.isEmpty()) {
            try { tts.setLanguage(Locale.forLanguageTag(locale.replace('_', '-'))); } catch (Exception ignored) {}
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mf-drive-" + System.currentTimeMillis());
    }

    private void dispatchDriveEvent(String type, String value) {
        if (webView == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("type", type);
            o.put("value", value == null ? "" : value);
            String js = "window.__mfDriveEvent&&window.__mfDriveEvent(" + o.toString() + ");";
            mainHandler.post(() -> { if (webView != null) webView.evaluateJavascript(js, null); });
        } catch (JSONException ignored) {}
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RECORD_AUDIO_REQUEST) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            String locale = pendingListenLocale;
            pendingListenLocale = null;
            if (granted) startRecognizer(locale);
            else dispatchDriveEvent("error", "permission_denied");
        }
    }

    private Intent cameraIntent() {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(getPackageManager()) == null) return null;
        try {
            File dir = new File(getCacheDir(), "captures");
            if (!dir.exists()) dir.mkdirs();
            File photo = File.createTempFile("mf_doc_", ".jpg", dir);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return camera;
        } catch (IOException e) {
            cameraUri = null;
            return null;
        }
    }

    private boolean isMiddlewareHost(String host) {
        return host != null && (host.equals(MIDDLEWARE_HOST)
                || host.equals("catalystserverless.com")
                || host.endsWith(".catalystserverless.com")
                || host.equals("zoho.com")
                || host.endsWith(".zoho.com"));
    }

    private boolean isAuthReturn(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
                && MIDDLEWARE_HOST.equals(uri.getHost())
                && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()));
    }

    private void finishAuthReturn(WebView view) {
        authInProgress = false;
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                .putBoolean(SIGNED_OUT_KEY, false)
                .putBoolean(AUTH_IN_PROGRESS_KEY, false)
                .apply();
        view.clearHistory();
        view.loadUrl(APP_URL);
    }

    private void finishSignOut() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                .putBoolean(SIGNED_OUT_KEY, true)
                .putBoolean(AUTH_IN_PROGRESS_KEY, false)
                .apply();
        authInProgress = false;
        if (webView == null) return;
        webView.stopLoading();
        webView.clearCache(true);
        webView.clearHistory();
        webView.clearFormData();
        webView.clearSslPreferences();
        CookieManager.getInstance().removeAllCookies(removed -> mainHandler.post(() -> {
            CookieManager.getInstance().flush();
            if (webView != null) webView.loadUrl(APP_URL + "?signed_out=1");
        }));
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        authInProgress = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getBoolean(AUTH_IN_PROGRESS_KEY, false);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247,250,248));
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true); s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new DriveModeBridge(), "MFDriveMode");
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) dispatchDriveEvent("tts_ready", "");
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) { dispatchDriveEvent("speaking", "start"); }
            @Override public void onDone(String utteranceId) { dispatchDriveEvent("speaking", "done"); }
            @Override public void onError(String utteranceId) { dispatchDriveEvent("speaking", "error"); }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
                super.onPageStarted(view,url,favicon);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl(); String scheme=uri.getScheme();
                if (APP_SCHEME.equals(scheme)) {
                    if ("signout".equals(uri.getHost())) finishSignOut();
                    return true;
                }
                if ("http".equals(scheme)||"https".equals(scheme)) {
                    String host=uri.getHost();
                    if (MIDDLEWARE_HOST.equals(host) && AUTH_LOGIN_PATH.equals(uri.getPath())) {
                        authInProgress = true;
                        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                                .putBoolean(AUTH_IN_PROGRESS_KEY, true)
                                .apply();
                    }
                    if (authInProgress && isAuthReturn(uri)) {
                        finishAuthReturn(view);
                        return true;
                    }
                    if(isMiddlewareHost(host)) return false;
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){} return true;
                }
                if("mailto".equals(scheme)||"tel".equals(scheme)||"whatsapp".equals(scheme)){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){} return true;}
                return false;
            }
            @Override public void onPageFinished(WebView view,String url){
                super.onPageFinished(view,url);
                if (authInProgress && url != null) {
                    try {
                        Uri uri = Uri.parse(url);
                        if (isAuthReturn(uri)) {
                            finishAuthReturn(view);
                            return;
                        }
                    } catch (Exception ignored) {}
                }
                if(url!=null&&url.startsWith(APP_URL)){
                    view.evaluateJavascript("(function(){if(document.getElementById('mf-unified-css'))return;var l=document.createElement('link');l.id='mf-unified-css';l.rel='stylesheet';l.href='unified.css';document.head.appendChild(l);var s=document.createElement('script');s.src='unified.js';s.defer=true;document.body.appendChild(s)})();",null);
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null); fileCallback=callback;
                Intent files=new Intent(Intent.ACTION_OPEN_DOCUMENT); files.addCategory(Intent.CATEGORY_OPENABLE); files.setType("*/*"); files.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","application/pdf"});
                Intent chooser=Intent.createChooser(files,"Choose document");
                Intent camera=cameraIntent(); if(camera!=null)chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});
                try{startActivityForResult(chooser,FILE_CHOOSER_REQUEST);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}
                return true;
            }
        });
        webView.setDownloadListener((url,userAgent,contentDisposition,mimetype,contentLength)->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}});
        boolean signedOut = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getBoolean(SIGNED_OUT_KEY, false);
        webView.loadUrl(signedOut ? APP_URL + "?signed_out=1" : APP_URL);
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        if(requestCode==FILE_CHOOSER_REQUEST){
            Uri[] results=null;
            if(resultCode==RESULT_OK){
                if(data!=null&&data.getClipData()!=null){int n=data.getClipData().getItemCount();results=new Uri[n];for(int i=0;i<n;i++)results[i]=data.getClipData().getItemAt(i).getUri();}
                else if(data!=null&&data.getData()!=null)results=new Uri[]{data.getData()};
                else if(cameraUri!=null)results=new Uri[]{cameraUri};
            }
            if(fileCallback!=null)fileCallback.onReceiveValue(results);fileCallback=null;cameraUri=null;return;
        }
        super.onActivityResult(requestCode,resultCode,data);
    }
    @Override protected void onDestroy(){mainHandler.removeCallbacksAndMessages(null);stopListeningInternal();if(tts!=null){tts.stop();tts.shutdown();tts=null;}if(webView!=null){webView.stopLoading();webView.destroy();}super.onDestroy();}
    @Override protected void onPause(){stopListeningInternal();super.onPause();}
    @Override public void onBackPressed(){if(webView!=null){String u=webView.getUrl();if(u!=null&&!u.startsWith(APP_URL)){webView.loadUrl(APP_URL);return;}if(webView.canGoBack()){webView.goBack();return;}}super.onBackPressed();}
}