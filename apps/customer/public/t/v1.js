/*
 * Brandbasket site analytics, version 1.
 * Add to a page: <script defer src="https://app.brandbasket.in/t/v1.js" data-key="bbk_..."></script>
 * Optional attributes: data-endpoint (where to send, default the script's own host + /api/t) and data-bb-forms="server"
 * (the site counts its own form sends, so this script must not).
 *
 * It uses no cookie and no storage, and it sends no identifier, no form content and no text typed anywhere. A page view
 * sends the path, the referring site's origin and the campaign words in the address. A tap on a call, email, WhatsApp,
 * directions, social, download or other outside link sends its kind. It stops at once for a visitor who asked not to be
 * tracked and for an automated browser. window.bb("name") sends an event of the site's own.
 */
(function () {
  "use strict";
  var w = window;
  var d = document;
  var n = navigator;
  var script = d.currentScript || d.querySelector("script[data-key]");
  var key = script && script.getAttribute("data-key");
  if (!key) return;
  if (n.doNotTrack === "1" || w.doNotTrack === "1" || n.globalPrivacyControl === true || n.webdriver) return;

  var endpoint = script.getAttribute("data-endpoint");
  if (!endpoint) {
    try {
      endpoint = new URL("/api/t", new URL(script.getAttribute("src") || "", location.href)).href;
    } catch {
      return;
    }
  }
  var serverForms = script.getAttribute("data-bb-forms") === "server";
  var curPath = location.pathname;
  var viewed = false;
  var shownAt = d.visibilityState === "visible" ? Date.now() : 0;
  var engaged = 0;
  var maxScroll = 0;
  var last = { id: "", at: 0 };

  function send(kind, extra) {
    var message = { key: key, kind: kind, path: curPath.slice(0, 200) };
    for (var field in extra) message[field] = extra[field];
    var body = JSON.stringify(message);
    if (body.length > 1000) return;
    try {
      if (typeof fetch === "function") {
        // keepalive lets it finish as the page closes; credentials are omitted so no cookie is ever sent.
        fetch(endpoint, { method: "POST", body: body, keepalive: true, credentials: "omit", mode: "cors", headers: { "Content-Type": "text/plain" } }).catch(function () {});
      } else if (n.sendBeacon) {
        n.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
      }
    } catch {}
  }

  /** Counts a repeat of the same tap within a second once: a double click is one tap. */
  function fresh(id) {
    var now = Date.now();
    if (id === last.id && now - last.at < 1000) return false;
    last.id = id;
    last.at = now;
    return true;
  }

  function tapped(kind, label) {
    if (!fresh(kind + ":" + (label || ""))) return;
    send(kind, label ? { label: label } : {});
  }

  function custom(name) {
    var label = String(name || "").toLowerCase();
    if (/^[a-z0-9_-]{1,40}$/.test(label)) tapped("custom", label);
  }

  function view(first) {
    viewed = true;
    var extra = {};
    if (first && d.referrer) {
      try {
        var from = new URL(d.referrer);
        if (from.host !== location.host) extra.ref = from.origin;
      } catch {}
    }
    var query = new URLSearchParams(location.search);
    var names = ["source", "medium", "campaign"];
    for (var i = 0; i < names.length; i++) {
      var value = query.get("utm_" + names[i]);
      if (value) extra[names[i]] = value.slice(0, 100);
    }
    send("pageview", extra);
  }

  function settle(now) {
    if (shownAt) {
      engaged += now - shownAt;
      shownAt = now;
    }
  }

  function flush() {
    if (engaged < 500) return;
    var extra = { engagedMs: Math.min(engaged, 1800000) };
    if (maxScroll > 0) extra.scrollPct = maxScroll;
    engaged = 0;
    send("engagement", extra);
  }

  function navigated() {
    if (location.pathname === curPath) return;
    settle(Date.now());
    flush();
    curPath = location.pathname;
    maxScroll = 0;
    view(false);
  }

  var ownHost = location.hostname.toLowerCase().replace(/^www\./, "");
  var SOCIAL = ["instagram.com", "facebook.com", "linkedin.com", "youtube.com", "youtu.be", "x.com", "twitter.com"];
  var WHATSAPP = ["wa.me", "api.whatsapp.com", "web.whatsapp.com", "chat.whatsapp.com", "whatsapp.com"];

  function isHost(host, domain) {
    return host === domain || host.slice(-(domain.length + 1)) === "." + domain;
  }

  function anyHost(host, list) {
    for (var i = 0; i < list.length; i++) if (isHost(host, list[i])) return list[i];
    return "";
  }

  /** What a link is, as [kind, label], or null for an ordinary link inside the site. */
  function classify(link) {
    var raw = link.getAttribute("href") || "";
    if (/^tel:/i.test(raw)) return ["call"];
    if (/^mailto:/i.test(raw)) return ["email"];
    if (/^whatsapp:/i.test(raw)) return ["whatsapp"];
    var url;
    try {
      url = new URL(link.href);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    var host = url.hostname.toLowerCase().replace(/^www\./, "");
    var path = url.pathname.toLowerCase();
    if (anyHost(host, WHATSAPP)) return ["whatsapp"];
    if (host === "maps.app.goo.gl" || host === "maps.google.com" || (/^google\.[a-z.]+$/.test(host) && path.indexOf("/maps") === 0)) return ["directions"];
    var file = /\.(pdf|docx?|xlsx?|pptx?|zip|csv)$/.exec(path);
    if (file) return ["download", file[1]];
    if (isHost(host, ownHost)) return null;
    var social = anyHost(host, SOCIAL);
    return social ? ["social", social] : ["outbound", host];
  }

  d.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var marked = target.closest("[data-bb-event]");
      if (marked) {
        custom(marked.getAttribute("data-bb-event"));
        return;
      }
      var link = target.closest("a[href]");
      var tap = link && classify(link);
      if (tap) tapped(tap[0], tap[1]);
    },
    true,
  );

  if (!serverForms) {
    d.addEventListener("submit", function () {
      tapped("form");
    }, true);
  }

  w.addEventListener(
    "scroll",
    function () {
      var height = d.documentElement.scrollHeight;
      if (!(height > 0)) return;
      var percent = Math.round((100 * ((w.scrollY || 0) + (w.innerHeight || 0))) / height);
      if (percent > maxScroll) maxScroll = Math.min(100, percent);
    },
    { passive: true },
  );

  d.addEventListener("visibilitychange", function () {
    var now = Date.now();
    if (d.visibilityState === "visible") {
      shownAt = now;
      if (!viewed) view(true);
    } else {
      settle(now);
      shownAt = 0;
      flush();
    }
  });
  w.addEventListener("pagehide", function () {
    settle(Date.now());
    flush();
  });

  var methods = ["pushState", "replaceState"];
  methods.forEach(function (method) {
    var original = w.history[method];
    w.history[method] = function () {
      var result = original.apply(this, arguments);
      navigated();
      return result;
    };
  });
  w.addEventListener("popstate", navigated);

  w.bb = custom;
  if (d.visibilityState !== "prerender") view(true);
})();
