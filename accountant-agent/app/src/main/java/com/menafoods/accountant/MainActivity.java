package com.menafoods.accountant;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.graphics.Color;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String APP_URL = "file:///android_asset/index.html";
    private static final String AUTH_RETURN_HOST = "menafoodscustomermiddleware-809407193.development.catalystserverless.com";
    private static final String AUTH_RETURN_PATH = "/mf-api/health";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private boolean isAuthReturnUrl(Uri uri) {
        return "https".equals(uri.getScheme())
                && AUTH_RETURN_HOST.equals(uri.getHost())
                && AUTH_RETURN_PATH.equals(uri.getPath());
    }

    private void forceEnterApp() {
        if (webView == null || webView.getUrl() == null || !webView.getUrl().startsWith(APP_URL)) return;
        webView.evaluateJavascript("(function(){try{var s=document.getElementById('appSplash');if(s){s.classList.add('hide');s.style.pointerEvents='none';s.style.display='none'}document.documentElement.style.visibility='visible';document.body.style.visibility='visible'}catch(e){}})();", null);
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

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247,250,248));
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true); s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl(); String scheme=uri.getScheme();
                if (isAuthReturnUrl(uri)) return false;
                if ("http".equals(scheme)||"https".equals(scheme)) {
                    String host=uri.getHost()==null?"":uri.getHost();
                    if("https".equals(scheme)&&(AUTH_RETURN_HOST.equals(host)||host.equals("zoho.com")||host.endsWith(".zoho.com"))) return false;
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){} return true;
                }
                if("mailto".equals(scheme)||"tel".equals(scheme)||"whatsapp".equals(scheme)){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){} return true;}
                return false;
            }
            @Override public void onPageFinished(WebView view,String url){
                super.onPageFinished(view,url);
                if(url!=null&&isAuthReturnUrl(Uri.parse(url))){view.loadUrl(APP_URL);return;}
                if(url!=null&&url.contains("INVALID_URL_PATTERN")){view.loadUrl(APP_URL);return;}
                if(url!=null&&url.startsWith(APP_URL)){
                    view.evaluateJavascript("(function(){if(document.getElementById('mf-unified-css'))return;var l=document.createElement('link');l.id='mf-unified-css';l.rel='stylesheet';l.href='unified.css';document.head.appendChild(l);var s=document.createElement('script');s.src='unified.js';s.defer=true;document.body.appendChild(s)})();",null);
                }
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                super.onReceivedError(view,request,error);
                if(!request.isForMainFrame())return;
                String failedUrl=request.getUrl().toString();
                if(failedUrl.startsWith("file:///android_asset/"))forceEnterApp();
                else view.loadUrl(APP_URL);
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
        webView.loadUrl(APP_URL); mainHandler.postDelayed(()->forceEnterApp(),5000);
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
    @Override protected void onDestroy(){mainHandler.removeCallbacksAndMessages(null);if(webView!=null){webView.stopLoading();webView.destroy();}super.onDestroy();}
    @Override public void onBackPressed(){if(webView!=null){String u=webView.getUrl();if(u!=null&&!u.startsWith(APP_URL)){webView.loadUrl(APP_URL);return;}}super.onBackPressed();}
}