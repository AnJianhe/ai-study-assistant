package com.study.aiassistant;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JsPromptResult;
import android.webkit.PermissionRequest;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPInputStream;

/** 应用页面、私有文件和原生能力的唯一入口；不记录网络、配置或材料。 */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/assets/index.html";
    private static final String BRIDGE_PATH = "__study_native_bootstrap__.js";
    private static final String BRIDGE_MARKER = "__study_native_bridge_v1__";
    // 只在顶层页面暴露对象，不使用会向所有 iframe 注入的 addJavascriptInterface。
    private static final String BRIDGE_SCRIPT = "(function(){'use strict';"
            + "if(window!==window.top)return;var promptNative=window.prompt.bind(window);"
            + "function call(m,a){var r=promptNative('__study_native_bridge_v1__',"
            + "JSON.stringify({method:m,args:Array.prototype.slice.call(a)}));"
            + "if(r===null)throw new Error('原生接口不可用');var v=JSON.parse(r);"
            + "if(!v.ok)throw new Error('原生接口调用失败');return v.value;}"
            + "var api={};['readFile','writeFile','deleteFile','listFiles','readAsset',"
            + "'request','cancelRequest','openExternal','pickFiles'].forEach(function(m){"
            + "api[m]=function(){return call(m,arguments);};});"
            + "Object.defineProperty(window,'StudyNative',{value:Object.freeze(api),"
            + "writable:false,configurable:false});})();";
    private static final String CSP = "default-src 'none'; "
            + "script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data: blob:; font-src 'self' data:; "
            + "connect-src 'self'; frame-src 'none'; child-src 'none'; "
            + "worker-src 'none'; object-src 'none'; base-uri 'none'; "
            + "form-action 'none'; frame-ancestors 'none'";
    private static final int PICK_REQUEST = 1701;
    private static final int MAX_PICK_BYTES = 12 * 1024 * 1024;
    private static final int MAX_FILE_BYTES = 32 * 1024 * 1024;
    private static final int MAX_RESPONSE_CHARS = 16 * 1024 * 1024;
    private static final int MAX_REQUESTS = 8;
    private static final int MAX_PICK_COUNT = 20;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService networkPool = new ThreadPoolExecutor(MAX_REQUESTS, MAX_REQUESTS,
            0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(MAX_REQUESTS));
    private final ExecutorService pickerPool = Executors.newSingleThreadExecutor();
    private final ExecutorService bridgePool = Executors.newSingleThreadExecutor();
    private final NativeBridge bridge = new NativeBridge();
    private final Map<String, RequestState> requests = new ConcurrentHashMap<>();
    private final Object fileLock = new Object();
    private final Object pickerLock = new Object();
    private final List<String> pendingEvents = new ArrayList<>(); // 仅 UI 线程访问
    private WebView webView;
    private boolean pageReady;
    private volatile boolean destroyed;
    private String pickId;
    private String pickMode;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) {
            pickId = state.getString("pickId");
            pickMode = state.getString("pickMode");
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(Color.rgb(15, 23, 42));
        getWindow().setNavigationBarColor(Color.rgb(15, 23, 42));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }

        WebView.setWebContentsDebuggingEnabled(false);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(15, 23, 42));
        if (Build.VERSION.SDK_INT >= 30) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets padding = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
                return insets;
            });
        }
        setContentView(webView);
        configureWebView();
        webView.loadUrl(ENTRY);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // 拦截器提供虚拟 HTTPS 资产，实际网络只由下面的 HTTPS 原生客户端访问。
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 24) {
            android.webkit.ServiceWorkerWebSettings sw = ServiceWorkerController
                    .getInstance().getServiceWorkerWebSettings();
            sw.setAllowFileAccess(false);
            sw.setAllowContentAccess(false);
            sw.setBlockNetworkLoads(true);
        }
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                    String payload, JsPromptResult result) {
                // url 是发起对话框的 frame URL；顶层 URL 也必须是唯一入口。
                if (destroyed || !BRIDGE_MARKER.equals(message) || payload == null
                        || payload.length() > 2 * MAX_FILE_BYTES + 8192
                        || !isEntry(Uri.parse(url == null ? "" : url))
                        || !isEntry(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) {
                    result.cancel();
                    return true;
                }
                try {
                    // prompt 对 JS 保持同步，但较大的文件读写不占用 UI 线程。
                    bridgePool.execute(() -> {
                        String answer = dispatchBridge(payload);
                        ui.post(() -> {
                            if (destroyed || webView != view
                                    || !isEntry(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) {
                                result.cancel();
                            } else {
                                result.confirm(answer);
                            }
                        });
                    });
                } catch (RejectedExecutionException ignored) {
                    result.cancel();
                }
                return true;
            }
        });
        webView.setWebViewClient(new LocalClient());
    }

    private static boolean isAssetOrigin(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !HOST.equalsIgnoreCase(uri.getHost()) || uri.getUserInfo() != null) {
            return false;
        }
        String authority = uri.getEncodedAuthority();
        return authority != null && (HOST.equalsIgnoreCase(authority)
                || (HOST + ":443").equalsIgnoreCase(authority));
    }

    private static boolean isEntry(Uri uri) {
        return isAssetOrigin(uri) && "/assets/index.html".equals(uri.getEncodedPath())
                && uri.getQuery() == null;
    }

    private final class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return serveAsset(request.getUrl(), request.getMethod());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serveAsset(Uri.parse(url), "GET");
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (request.isForMainFrame() && isEntry(uri)) return false;
            if (request.isForMainFrame()) openExternalUri(uri);
            return true;
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (isEntry(uri)) return false;
            openExternalUri(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            pageReady = false;
            if (!isEntry(Uri.parse(url))) {
                // 纵深防御：绝不在此 WebView 加载其他顶层页面。
                view.stopLoading();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!destroyed && isEntry(Uri.parse(url))) {
                pageReady = true;
                List<String> queued = new ArrayList<>(pendingEvents);
                pendingEvents.clear();
                for (String event : queued) deliverEvent(event);
            }
        }
    }

    private WebResourceResponse serveAsset(Uri uri, String method) {
        // 不把其他主机映射成本地资产；WebView 网络加载已另外禁止。
        if (!isAssetOrigin(uri)) return null;
        if (!"GET".equalsIgnoreCase(method)) return response(405, "Method Not Allowed", null, null);
        String path = uri.getEncodedPath();
        if (path == null || !path.startsWith("/assets/") || path.indexOf('%') >= 0
                || path.indexOf('\\') >= 0) {
            return response(404, "Not Found", null, null);
        }
        String relative = path.substring("/assets/".length());
        if (!validPath(relative, false)) return response(404, "Not Found", null, null);
        if (BRIDGE_PATH.equals(relative)) {
            return response(200, "OK", "text/javascript", new ByteArrayInputStream(
                    BRIDGE_SCRIPT.getBytes(StandardCharsets.UTF_8)));
        }
        String type = mimeType(relative);
        if (type == null || (type.equals("text/html") && !relative.equals("index.html"))) {
            return response(404, "Not Found", null, null);
        }
        try {
            InputStream stream = getAssets().open(relative);
            if (relative.equals("index.html")) {
                String html;
                try (InputStream source = stream) { html = decodeUtf8(readBounded(source, 2 * 1024 * 1024)); }
                int headEnd = html.toLowerCase(Locale.ROOT).indexOf("</head>");
                if (headEnd < 0) return response(500, "Invalid Entry", null, null);
                String modified = html.substring(0, headEnd)
                        + "<script src=\"/assets/" + BRIDGE_PATH + "\"></script>\n"
                        + html.substring(headEnd);
                stream = new ByteArrayInputStream(modified.getBytes(StandardCharsets.UTF_8));
            }
            return response(200, "OK", type, stream);
        } catch (IOException ignored) {
            return response(404, "Not Found", null, null);
        }
    }

    private static WebResourceResponse response(int status, String reason, String type, InputStream in) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Security-Policy", CSP);
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Cache-Control", "no-store");
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("Cross-Origin-Resource-Policy", "same-origin");
        return new WebResourceResponse(type == null ? "text/plain" : type,
                type != null && (type.startsWith("text/") || type.equals("application/json"))
                        ? "UTF-8" : null,
                status, reason, headers, in == null ? new ByteArrayInputStream(new byte[0]) : in);
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return "text/plain";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".otf")) return "font/otf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".bmp")) return "image/bmp";
        return null;
    }

    private static boolean validPath(String path, boolean prefix) {
        if (path == null || path.length() > 512 || path.startsWith("/")
                || path.indexOf('\\') >= 0 || path.indexOf('%') >= 0) return false;
        if (path.isEmpty()) return prefix;
        String test = prefix && path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        if (test.isEmpty()) return false;
        for (int i = 0; i < test.length(); i++) {
            if (Character.isISOControl(test.charAt(i))) return false;
        }
        for (String part : test.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        }
        return true;
    }

    private File privateFile(String path) throws IOException {
        if (!validPath(path, false)) throw new IOException("invalid path");
        File root = getFilesDir().getCanonicalFile();
        File file = new File(root, path);
        String canonical = file.getCanonicalPath();
        if (!canonical.startsWith(root.getPath() + File.separator)
                || !canonical.equals(file.getAbsolutePath())) throw new IOException("invalid path");
        return file;
    }

    private static byte[] readBounded(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int length;
        int total = 0;
        while ((length = input.read(buffer)) != -1) {
            if (length > limit - total) throw new IOException("too large");
            output.write(buffer, 0, length);
            total += length;
        }
        return output.toByteArray();
    }

    private static String decodeUtf8(byte[] data) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(data)).toString();
    }

    private static String bridgeArgument(JSONArray args, int index, boolean nullable) throws JSONException {
        Object value = args.get(index);
        if (nullable && value == JSONObject.NULL) return null;
        if (!(value instanceof String)) throw new JSONException("invalid argument");
        return (String) value;
    }

    /** 同步 JS 接口的原生分发只接收固定白名单，不输出入参或异常。 */
    private String dispatchBridge(String payload) {
        JSONObject answer = new JSONObject();
        try {
            JSONObject call = new JSONObject(payload);
            String method = call.getString("method");
            JSONArray args = call.getJSONArray("args");
            Object value;
            switch (method) {
                case "readFile":
                    if (args.length() != 1) throw new JSONException("invalid arguments");
                    value = bridge.readFile(bridgeArgument(args, 0, true)); break;
                case "writeFile":
                    if (args.length() != 2) throw new JSONException("invalid arguments");
                    value = bridge.writeFile(bridgeArgument(args, 0, true), bridgeArgument(args, 1, true)); break;
                case "deleteFile":
                    if (args.length() != 1) throw new JSONException("invalid arguments");
                    value = bridge.deleteFile(bridgeArgument(args, 0, true)); break;
                case "listFiles":
                    if (args.length() == 0) value = bridge.listFiles(null);
                    else if (args.length() == 1) value = bridge.listFiles(bridgeArgument(args, 0, true));
                    else throw new JSONException("invalid arguments");
                    break;
                case "readAsset":
                    if (args.length() != 1) throw new JSONException("invalid arguments");
                    value = bridge.readAsset(bridgeArgument(args, 0, true)); break;
                case "request":
                    if (args.length() != 2) throw new JSONException("invalid arguments");
                    value = bridge.request(bridgeArgument(args, 0, true), bridgeArgument(args, 1, true)); break;
                case "cancelRequest":
                    if (args.length() != 1) throw new JSONException("invalid arguments");
                    value = bridge.cancelRequest(bridgeArgument(args, 0, true)); break;
                case "openExternal":
                    if (args.length() != 1) throw new JSONException("invalid arguments");
                    value = bridge.openExternal(bridgeArgument(args, 0, true)); break;
                case "pickFiles":
                    if (args.length() != 2) throw new JSONException("invalid arguments");
                    value = bridge.pickFiles(bridgeArgument(args, 0, true), bridgeArgument(args, 1, true)); break;
                default: throw new JSONException("unknown method");
            }
            put(answer, "ok", true);
            put(answer, "value", value == null ? JSONObject.NULL : value);
        } catch (Exception ignored) {
            put(answer, "ok", false);
        }
        return answer.toString();
    }

    public final class NativeBridge {
        public String readFile(String path) {
            synchronized (fileLock) {
                try {
                    File file = privateFile(path);
                    try {
                        Os.stat(file.getAbsolutePath());
                    } catch (ErrnoException ex) {
                        if (ex.errno == OsConstants.ENOENT) return null;
                        throw ex;
                    }
                    if (!file.isFile() || file.length() > MAX_FILE_BYTES) {
                        throw new IOException("private file unavailable or too large");
                    }
                    try (InputStream in = new FileInputStream(file)) {
                        return decodeUtf8(readBounded(in, MAX_FILE_BYTES));
                    }
                } catch (Exception ex) {
                    // 只有文件确实不存在才能返回 null；读取失败不能伪装成空数据并被覆盖。
                    throw new IllegalStateException("private file read failed", ex);
                }
            }
        }

        public boolean writeFile(String path, String text) {
            if (text == null) return false;
            synchronized (fileLock) {
                File temporary = null;
                try {
                    byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > MAX_FILE_BYTES) return false;
                    File file = privateFile(path);
                    File parent = file.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) return false;
                    // 再核验创建后的路径，拒绝符号链接。
                    file = privateFile(path);
                    if (file.isDirectory()) return false;
                    temporary = File.createTempFile(".study-write-", ".tmp", parent);
                    try (FileOutputStream out = new FileOutputStream(temporary)) {
                        out.write(bytes);
                        out.flush();
                        out.getFD().sync();
                    }
                    // 同一文件系统中原子替换；rename 失败时抛异常，不会误报成功。
                    Os.rename(temporary.getAbsolutePath(), file.getAbsolutePath());
                    temporary = null;
                    return true;
                } catch (Exception ignored) {
                    return false;
                } finally {
                    if (temporary != null) temporary.delete();
                }
            }
        }

        public boolean deleteFile(String path) {
            synchronized (fileLock) {
                try {
                    File file = privateFile(path);
                    return file.isFile() && file.delete();
                } catch (IOException ignored) {
                    return false;
                }
            }
        }

        /** 返回 JSON 数组字符串；非法路径返回 null。 */
        public String listFiles(String prefix) {
            String filter = prefix == null ? "" : prefix;
            if (!validPath(filter, true)) return null;
            synchronized (fileLock) {
                try {
                    File root = getFilesDir().getCanonicalFile();
                    ArrayDeque<File> directories = new ArrayDeque<>();
                    List<String> found = new ArrayList<>();
                    directories.add(root);
                    while (!directories.isEmpty()) {
                        File[] children = directories.removeFirst().listFiles();
                        if (children == null) continue;
                        for (File child : children) {
                            String absolute = child.getAbsolutePath();
                            String canonical = child.getCanonicalPath();
                            if (!canonical.equals(absolute)
                                    || !canonical.startsWith(root.getPath() + File.separator)) continue;
                            String relative = canonical.substring(root.getPath().length() + 1)
                                    .replace(File.separatorChar, '/');
                            if (child.isDirectory()) {
                                if (filter.isEmpty() || (relative + "/").startsWith(filter)
                                        || filter.startsWith(relative + "/")) directories.add(child);
                            } else if (child.isFile() && relative.startsWith(filter)) {
                                found.add(relative);
                            }
                            if (found.size() > 10000 || directories.size() > 10000) return null;
                        }
                    }
                    Collections.sort(found);
                    return new JSONArray(found).toString();
                } catch (IOException ignored) {
                    return null;
                }
            }
        }

        /** 返回打包的 UTF-8 资产内容；不存在、非法或过大时返回 null。 */
        public String readAsset(String path) {
            if (!validPath(path, false)) return null;
            try (InputStream in = getAssets().open(path)) {
                return decodeUtf8(readBounded(in, MAX_FILE_BYTES));
            } catch (Exception ignored) {
                return null;
            }
        }

        /** 成功入队返回 true；id 重复、非法或并发额度已满返回 false。 */
        public boolean request(String id, String json) {
            if (!validId(id) || json == null || json.length() > MAX_FILE_BYTES) return false;
            RequestState task = new RequestState(id, json);
            synchronized (requests) {
                if (destroyed || requests.containsKey(id) || requests.size() >= MAX_REQUESTS) return false;
                requests.put(id, task);
                try {
                    networkPool.execute(() -> runRequest(task));
                } catch (RejectedExecutionException ignored) {
                    requests.remove(id);
                    return false;
                }
            }
            return true;
        }

        public boolean cancelRequest(String id) {
            if (!validId(id)) return false;
            RequestState task = requests.get(id);
            if (task == null) return false;
            finishRequest(task, "请求已取消。");
            HttpURLConnection connection = task.connection;
            if (connection != null) connection.disconnect();
            return true;
        }

        /** true 表示已接受打开请求，不表示外部应用一定可用。 */
        public boolean openExternal(String url) {
            if (url == null) return false;
            Uri uri = Uri.parse(url);
            if (!isExternalUrl(uri)) return false;
            ui.post(() -> openExternalUri(uri));
            return true;
        }

        /** mode 为 material 或 images；true 表示已接受选择请求。 */
        public boolean pickFiles(String id, String mode) {
            if (!validId(id) || !("material".equals(mode) || "images".equals(mode))) return false;
            synchronized (pickerLock) {
                if (destroyed || pickId != null) return false;
                pickId = id;
                pickMode = mode;
            }
            ui.post(() -> launchPicker(id, mode));
            return true;
        }
    }

    private static boolean validId(String id) {
        if (id == null || id.isEmpty() || id.length() > 128) return false;
        for (int i = 0; i < id.length(); i++) if (Character.isISOControl(id.charAt(i))) return false;
        return true;
    }

    private static boolean isExternalUrl(Uri uri) {
        if (uri == null || uri.getHost() == null || uri.getHost().isEmpty() || uri.getUserInfo() != null) return false;
        String scheme = uri.getScheme();
        return "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
    }

    private boolean openExternalUri(Uri uri) {
        if (!isExternalUrl(uri)) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri.normalizeScheme());
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException ignored) {
            return false;
        }
    }

    private static final class RequestState {
        final String id;
        final String json;
        volatile HttpURLConnection connection;
        boolean finished;
        RequestState(String id, String json) { this.id = id; this.json = json; }
    }

    private void emitRequest(RequestState task, JSONObject event) {
        synchronized (task) {
            if (!task.finished) postEvent(event.toString());
        }
    }

    private void finishRequest(RequestState task, String error) {
        synchronized (task) {
            if (task.finished) return;
            task.finished = true;
            JSONObject event = event(error == null ? "end" : "error", task.id);
            if (error != null) put(event, "message", error);
            postEvent(event.toString());
        }
        synchronized (requests) {
            if (requests.get(task.id) == task) requests.remove(task.id);
        }
    }

    private static boolean requestFinished(RequestState task) {
        synchronized (task) { return task.finished; }
    }

    private void runRequest(RequestState task) {
        HttpURLConnection connection = null;
        try {
            JSONObject spec = new JSONObject(task.json);
            URL url = new URL(spec.getString("url"));
            if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getHost().isEmpty()
                    || url.getUserInfo() != null) {
                finishRequest(task, "仅允许不含用户信息的 HTTPS 请求地址。");
                return;
            }
            String method = spec.optString("method", "GET").toUpperCase(Locale.ROOT);
            if (!Arrays.asList("GET", "HEAD", "POST", "PUT", "DELETE").contains(method)) {
                finishRequest(task, "不支持该请求方法。");
                return;
            }
            int timeout = Math.max(1000, Math.min(600000, spec.optInt("timeoutMs", 120000)));
            Object bodyValue = spec.opt("body");
            if (bodyValue != null && bodyValue != JSONObject.NULL && !(bodyValue instanceof String)) {
                finishRequest(task, "请求体必须是字符串。");
                return;
            }
            byte[] body = bodyValue == null || bodyValue == JSONObject.NULL
                    ? null : ((String) bodyValue).getBytes(StandardCharsets.UTF_8);
            if (body != null && (body.length > MAX_FILE_BYTES || method.equals("GET") || method.equals("HEAD"))) {
                finishRequest(task, "请求体过大或请求方法不允许请求体。");
                return;
            }
            if (requestFinished(task)) return;
            connection = (HttpURLConnection) url.openConnection();
            task.connection = connection;
            if (requestFinished(task)) return;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(Math.min(timeout, 15000));
            connection.setReadTimeout(timeout);
            connection.setRequestMethod(method);
            JSONObject headers = spec.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    Object value = headers.get(name);
                    if (!(value instanceof String) || !validHeader(name, (String) value)) {
                        finishRequest(task, "请求头无效或不允许设置。");
                        return;
                    }
                    connection.setRequestProperty(name, (String) value);
                }
            }
            // 显式设置后自行解压，避免平台自动解压和重复解压的不一致。
            connection.setRequestProperty("Accept-Encoding", "gzip, identity");
            if (requestFinished(task)) return;
            if (body != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream out = connection.getOutputStream()) {
                    if (requestFinished(task)) return;
                    out.write(body);
                }
            }
            if (requestFinished(task)) return;
            int status = connection.getResponseCode();
            if (requestFinished(task)) return;
            JSONObject headerEvent = event("headers", task.id);
            put(headerEvent, "status", status);
            emitRequest(task, headerEvent);
            // 不自动跟随任何重定向，尤其避免把 Authorization 转发到别的主机。
            if (status >= 300 && status < 400) {
                finishRequest(task, "服务器返回重定向；为保护密钥，未自动跟随。");
                return;
            }
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (input != null) {
                String encoding = connection.getContentEncoding();
                if (encoding != null && !encoding.trim().isEmpty()
                        && !encoding.trim().equalsIgnoreCase("identity")) {
                    if (!encoding.trim().equalsIgnoreCase("gzip")) {
                        input.close();
                        finishRequest(task, "服务器返回了不支持的压缩格式。");
                        return;
                    }
                    input = new GZIPInputStream(input);
                }
                try (Reader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                    char[] buffer = new char[4096];
                    char pendingHigh = 0;
                    int count;
                    int total = 0;
                    while (!requestFinished(task) && (count = reader.read(buffer)) != -1) {
                        total += count;
                        if (total > MAX_RESPONSE_CHARS) {
                            finishRequest(task, "服务器响应过大。");
                            return;
                        }
                        String chunk = new String(buffer, 0, count);
                        if (pendingHigh != 0) { chunk = pendingHigh + chunk; pendingHigh = 0; }
                        if (!chunk.isEmpty() && Character.isHighSurrogate(chunk.charAt(chunk.length() - 1))) {
                            pendingHigh = chunk.charAt(chunk.length() - 1);
                            chunk = chunk.substring(0, chunk.length() - 1);
                        }
                        if (!chunk.isEmpty()) {
                            JSONObject chunkEvent = event("chunk", task.id);
                            put(chunkEvent, "text", chunk);
                            emitRequest(task, chunkEvent);
                        }
                    }
                    if (pendingHigh != 0 && !requestFinished(task)) {
                        JSONObject chunkEvent = event("chunk", task.id);
                        put(chunkEvent, "text", "\uFFFD");
                        emitRequest(task, chunkEvent);
                    }
                }
            }
            finishRequest(task, null);
        } catch (SocketTimeoutException ignored) {
            finishRequest(task, "网络请求超时。");
        } catch (Exception ignored) {
            finishRequest(task, "网络请求失败，请检查网络或服务配置。");
        } finally {
            if (connection != null) connection.disconnect();
            task.connection = null;
        }
    }

    private static boolean validHeader(String name, String value) {
        if (name == null || name.isEmpty() || name.length() > 128 || value.length() > 16384) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.equals("host") || lower.equals("connection") || lower.equals("content-length")
                || lower.equals("accept-encoding") || lower.equals("transfer-encoding")
                || lower.equals("cookie") || lower.equals("upgrade") || lower.startsWith("proxy-")) return false;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z')
                    && !(c >= '0' && c <= '9') && "!#$%&'*+-.^_`|~".indexOf(c) < 0) return false;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\r' || c == '\n' || c == 0 || c == 127) return false;
        }
        return true;
    }

    private static JSONObject event(String type, String id) {
        JSONObject result = new JSONObject();
        put(result, "type", type);
        put(result, "id", id);
        return result;
    }

    private static void put(JSONObject object, String key, Object value) {
        try { object.put(key, value); } catch (JSONException ignored) { /* 所有键均为固定字符串。 */ }
    }

    private void postEvent(String event) {
        ui.post(() -> {
            if (destroyed) return;
            if (!pageReady) pendingEvents.add(event);
            else deliverEvent(event);
        });
    }

    private void deliverEvent(String event) {
        if (destroyed || webView == null || !isEntry(Uri.parse(webView.getUrl() == null ? "" : webView.getUrl()))) return;
        String quoted = JSONObject.quote(event).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        webView.evaluateJavascript("(function(){if(typeof window.__nativeEvent==='function')"
                + "window.__nativeEvent(" + quoted + ");})()", null);
    }

    private void launchPicker(String id, String mode) {
        if (destroyed) return;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("images".equals(mode) ? "image/*" : "*/*");
            if ("images".equals(mode)) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, PICK_REQUEST);
        } catch (ActivityNotFoundException | SecurityException ignored) {
            synchronized (pickerLock) { if (id.equals(pickId)) { pickId = null; pickMode = null; } }
            JSONObject failure = event("error", id);
            put(failure, "message", "无法打开系统文件选择器。");
            postEvent(failure.toString());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_REQUEST) return;
        final String id;
        final String mode;
        synchronized (pickerLock) {
            id = pickId;
            mode = pickMode;
            pickId = null;
            pickMode = null;
        }
        if (id == null) return;
        List<Uri> uris = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    if (uri != null) uris.add(uri);
                }
            } else if (data.getData() != null) uris.add(data.getData());
        }
        if (uris.size() > MAX_PICK_COUNT || ("material".equals(mode) && uris.size() > 1)) {
            JSONObject failure = event("error", id);
            put(failure, "message", "选择的文件过多。");
            postEvent(failure.toString());
            return;
        }
        try {
            pickerPool.execute(() -> collectFiles(id, mode, uris));
        } catch (RejectedExecutionException ignored) {
            JSONObject failure = event("error", id);
            put(failure, "message", "无法处理所选文件。");
            postEvent(failure.toString());
        }
    }

    private void collectFiles(String id, String mode, List<Uri> uris) {
        JSONArray files = new JSONArray();
        int remaining = MAX_PICK_BYTES; // 一次选择的全部文件合计上限 12 MiB。
        for (Uri uri : uris) {
            FileInfo info = queryInfo(uri);
            JSONObject item = new JSONObject();
            put(item, "name", info.name);
            put(item, "size", Math.max(info.size, 0));
            if (uri == null || !ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(uri.getScheme())) {
                unsupported(item, "请选择系统文件选择器提供的文件。");
                files.put(item);
                continue;
            }
            String ext = extension(info.name);
            String imageMime = imageMime(ext);
            boolean text = ext.equals("txt") || ext.equals("md") || ext.equals("markdown")
                    || ext.equals("log") || ext.equals("csv") || ext.equals("json");
            boolean office = ext.equals("docx") || ext.equals("pptx") || ext.equals("xlsx");
            if (imageMime == null && ((!text && !office) || "images".equals(mode))) {
                unsupported(item, "不支持此格式；PDF 或旧版 Office 请转为文字或截图后上传。");
            } else if (info.size > remaining || info.size > MAX_PICK_BYTES) {
                unsupported(item, "单次选择的文件总大小不能超过 12 MB。");
            } else {
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("unavailable");
                    byte[] bytes = readBounded(input, remaining);
                    put(item, "size", bytes.length);
                    if (imageMime != null) {
                        if (!matchesImage(bytes, ext)) {
                            unsupported(item, "图片内容与扩展名不符或格式不受支持。");
                        } else {
                            put(item, "dataUrl", "data:" + imageMime + ";base64,"
                                    + Base64.encodeToString(bytes, Base64.NO_WRAP));
                            remaining -= bytes.length;
                        }
                    } else if (office) {
                        try {
                            put(item, "text", OfficeConverter.convert(bytes, info.name, ext));
                            put(item, "converted", true);
                            remaining -= bytes.length;
                        } catch (IllegalArgumentException ex) {
                            unsupported(item, "Office 文档转换失败：" + ex.getMessage());
                        }
                    } else {
                        try {
                            put(item, "text", decodeUtf8(bytes));
                            remaining -= bytes.length;
                        } catch (CharacterCodingException ignored) {
                            unsupported(item, "文本必须使用 UTF-8 编码，请转换后重试。");
                        }
                    }
                } catch (Exception ignored) {
                    unsupported(item, "无法读取文件，或单次选择的文件总大小超过 12 MB。");
                }
            }
            files.put(item);
        }
        JSONObject result = event("files", id);
        put(result, "files", files);
        postEvent(result.toString());
    }

    private static void unsupported(JSONObject item, String hint) {
        put(item, "unsupported", true);
        put(item, "hint", hint);
    }

    private static final class FileInfo {
        String name = "未命名";
        long size = -1;
    }

    private FileInfo queryInfo(Uri uri) {
        FileInfo info = new FileInfo();
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(uri.getScheme())) return info;
        try (Cursor cursor = getContentResolver().query(uri,
                new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                    String name = cursor.getString(nameIndex);
                    if (name != null && !name.isEmpty()) {
                        name = name.replaceAll("[\\p{Cntrl}]", "_");
                        info.name = name.length() > 255 ? name.substring(0, 255) : name;
                    }
                }
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) info.size = cursor.getLong(sizeIndex);
            }
        } catch (Exception ignored) { /* 仍可尝试读取，或返回不支持提示。 */ }
        return info;
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String imageMime(String ext) {
        switch (ext) {
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "bmp": return "image/bmp";
            default: return null;
        }
    }

    private static boolean matchesImage(byte[] b, String ext) {
        switch (ext) {
            case "png": return b.length >= 8 && (b[0] & 255) == 137 && b[1] == 80 && b[2] == 78
                    && b[3] == 71 && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10;
            case "jpg": case "jpeg": return b.length >= 3 && (b[0] & 255) == 255
                    && (b[1] & 255) == 216 && (b[2] & 255) == 255;
            case "gif": return b.length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F'
                    && b[3] == '8' && (b[4] == '7' || b[4] == '9') && b[5] == 'a';
            case "webp": return b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F'
                    && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
            case "bmp": return b.length >= 2 && b[0] == 'B' && b[1] == 'M';
            default: return false;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        synchronized (pickerLock) {
            outState.putString("pickId", pickId);
            outState.putString("pickMode", pickMode);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        // 先让页面关闭弹窗；弹窗不属于 WebView 历史，直接 goBack 会误退路由。
        webView.evaluateJavascript("(function(){var m=document.getElementById('modal-root');"
                + "if(m&&!m.hidden){document.dispatchEvent(new KeyboardEvent('keydown',"
                + "{key:'Escape',bubbles:true}));return true;}return false;})()", result -> {
            if (destroyed || webView == null || "true".equals(result)) return;
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setTitle("退出学习助手？")
                        .setMessage("正在生成的内容可能中断，未提交的答案可能丢失。")
                        .setNegativeButton("取消", null)
                        .setPositiveButton("退出", (dialog, which) -> finish())
                        .show();
            }
        });
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        for (RequestState task : requests.values()) {
            synchronized (task) { task.finished = true; }
            HttpURLConnection connection = task.connection;
            if (connection != null) connection.disconnect();
        }
        requests.clear();
        networkPool.shutdownNow();
        pickerPool.shutdownNow();
        bridgePool.shutdownNow();
        pendingEvents.clear();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
