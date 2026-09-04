/* Promobot — UX: animações Motion, auto-refresh, timeago, loading states */
(function () {
  "use strict";

  // ---------- animações de entrada (Motion) ----------
  function setupMotion() {
    if (!window.Motion) return;
    var M = window.Motion;
    var items = document.querySelectorAll("[data-animate]");
    if (!items.length) return;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // respeita quem prefere menos animação

    items.forEach(function (el, i) {
      // cards já podem vir com --stagger do template (posição no grid)
      var delay = Math.min((parseInt(el.style.getPropertyValue("--stagger") || i, 10) % 12) * 0.045, 0.55);
      M.animate(
        el,
        { opacity: [0, 1], transform: ["translateY(14px) scale(.985)", "translateY(0) scale(1)"] },
        { duration: 0.42, delay: delay, easing: [0.22, 1, 0.36, 1], fill: "backwards" }
      );
    });

    // count-up nos números dos KPIs
    document.querySelectorAll("[data-countup]").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-countup"), 10);
      if (isNaN(target) || target === 0) return;
      var node = M.animate(0, target, {
        duration: 0.8,
        easing: "ease-out",
        onUpdate: function (v) { el.textContent = Math.round(v); },
      });
    });

    // micro-interação: hover dos cards com leve "spring"
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("mouseenter", function () {
        M.animate(card, { scale: 1.012 }, { duration: 0.18, easing: "ease-out" });
      });
      card.addEventListener("mouseleave", function () {
        M.animate(card, { scale: 1 }, { duration: 0.25, easing: [0.22, 1, 0.36, 1] });
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupMotion);
  } else {
    setupMotion();
  }

  // ---------- timeago ao vivo ----------
  function fmtDelta(mins) {
    if (mins < 1) return "agora";
    if (mins < 60) return "há " + mins + " min";
    var h = Math.floor(mins / 60);
    if (h < 24) return "há " + h + " h";
    return "há " + Math.floor(h / 24) + " d";
  }
  function refreshTimes() {
    document.querySelectorAll("[data-ts]").forEach(function (el) {
      var ts = new Date(el.getAttribute("data-ts"));
      if (isNaN(ts)) return;
      el.textContent = fmtDelta(Math.floor((Date.now() - ts.getTime()) / 60000));
    });
  }
  refreshTimes();
  setInterval(refreshTimes, 30000);

  // ---------- auto-refresh (pausa em aba oculta ou digitando) ----------
  var REFRESH_MS = 90000;
  var lastLoad = Date.now();
  function typing() {
    var el = document.activeElement;
    return el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
  }
  setInterval(function () {
    if (document.hidden || typing() || window.__pbCycleRunning) {
      lastLoad = Date.now(); // adia o reload
      return;
    }
    if (Date.now() - lastLoad >= REFRESH_MS) location.reload();
  }, 5000);
  var info = document.getElementById("refresh-info");
  if (info) {
    setInterval(function () {
      var secs = Math.max(0, Math.round((REFRESH_MS - (Date.now() - lastLoad)) / 1000));
      info.textContent = "↻ atualiza em " + secs + "s";
    }, 1000);
  }

  // ---------- botão "Buscar agora" com loading ----------
  var form = document.getElementById("crawl-form");
  if (form) {
    form.addEventListener("submit", function () {
      var btn = document.getElementById("crawl-btn");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "⏳ Coletando…";
      window.__pbCycleRunning = true;
      // o ciclo leva ~1-2 min; recarrega quando terminar (poll)
      var poll = setInterval(function () {
        fetch("/api/cycle-status")
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d.running) {
              clearInterval(poll);
              location.reload();
            }
          })
          .catch(function () {});
      }, 8000);
      // fallback: recarrega em 4 min mesmo se o poll falhar
      setTimeout(function () { location.reload(); }, 240000);
    });
  }
})();
