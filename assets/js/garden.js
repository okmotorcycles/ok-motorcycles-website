/* OK MOTORCYCLES — highway garden interactions
   - collapsible ROUTE INDEX tree
   - mobile rail drawer
   - auto table-of-contents + scroll-spy
   - inline note hover previews
*/
(function () {
  "use strict";

  /* ---------- light / dark theme toggle ---------- */
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (dark) {
        document.documentElement.removeAttribute("data-theme");
        try { localStorage.setItem("theme", "light"); } catch (e) {}
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        try { localStorage.setItem("theme", "dark"); } catch (e) {}
      }
    });
  }

  /* ---------- mobile rail drawer ---------- */
  var rail = document.getElementById("rail");
  var scrim = document.getElementById("rail-scrim");
  var toggle = document.getElementById("rail-toggle");
  function closeRail() { rail && rail.classList.remove("is-open"); scrim && scrim.classList.remove("is-open"); }
  if (toggle && rail) {
    toggle.addEventListener("click", function () {
      rail.classList.toggle("is-open");
      scrim && scrim.classList.toggle("is-open");
    });
  }
  scrim && scrim.addEventListener("click", closeRail);

  /* ---------- collapsible category tree ---------- */
  var cats = document.querySelectorAll(".nav-tree__cat");
  cats.forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.closest(".nav-tree__group").classList.toggle("is-open");
    });
  });
  // open the first group by default if none is marked current
  if (!document.querySelector(".nav-tree__group.is-open")) {
    var first = document.querySelector(".nav-tree__group");
    first && first.classList.add("is-open");
  }

  /* ---------- table of contents + scroll-spy ---------- */
  var prose = document.getElementById("note-prose");
  var toc = document.getElementById("toc");
  if (prose && toc) {
    var headings = prose.querySelectorAll("h2, h3");
    var tocList = toc.querySelector("ul");
    var inline = document.getElementById("toc-inline");
    var inlineList = inline ? inline.querySelector("ul") : null;

    if (headings.length >= 2) {
      var links = [];
      headings.forEach(function (h, i) {
        if (!h.id) {
          h.id = (h.textContent || "section").toLowerCase()
            .replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "section-" + i;
        }
        var level = h.tagName === "H3" ? "toc--h3" : "toc--h2";
        var itemHTML = '<li class="' + level + '"><a href="#' + h.id + '">' + h.textContent + "</a></li>";
        tocList.insertAdjacentHTML("beforeend", itemHTML);
        if (inlineList) inlineList.insertAdjacentHTML("beforeend", itemHTML);
      });
      toc.classList.remove("is-empty");
      if (inline) inline.hidden = false;

      var anchors = toc.querySelectorAll("a");
      anchors.forEach(function (a) { links.push(a); });

      // The scroll position at which each heading becomes the active one — its
      // top reaches a reading line near the top of the viewport. Headings crammed
      // into the un-scrollable tail of the page can never reach that line, so
      // short trailing sections (e.g. the About page's "How to get around" /
      // "Colophon") are redistributed evenly across whatever scroll remains: the
      // last one activates exactly at the bottom, the ones before it in turn.
      var threshold = 120;
      var activationPositions = function () {
        var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        var acts = [];
        headings.forEach(function (h) {
          acts.push(h.getBoundingClientRect().top + window.scrollY - threshold);
        });
        if (maxScroll > 0) {
          var firstTail = -1;
          for (var i = 0; i < acts.length; i++) {
            if (acts[i] > maxScroll) { firstTail = i; break; }
          }
          if (firstTail !== -1) {
            var startScroll = firstTail > 0 ? Math.min(acts[firstTail - 1], maxScroll) : 0;
            var count = headings.length - firstTail;
            for (var j = firstTail; j < headings.length; j++) {
              acts[j] = startScroll + (maxScroll - startScroll) * (j - firstTail + 1) / count;
            }
          }
        }
        return acts;
      };

      var spy = function () {
        var scrollY = window.scrollY;
        var acts = activationPositions();
        var current = 0;
        for (var k = 0; k < acts.length; k++) {
          if (scrollY >= acts[k] - 1) current = k;
        }
        links.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + headings[current].id);
        });
      };
      window.addEventListener("scroll", spy, { passive: true });
      window.addEventListener("resize", spy, { passive: true });
      spy();

      // Clicking a TOC entry jumps to the exact position that activates that
      // section, so its heading sits at the reading line and it (not a later
      // trailing section) is what highlights. Native anchor jumps would clamp
      // tail sections to the page bottom and mis-highlight.
      [toc, inline].forEach(function (container) {
        if (!container) return;
        container.querySelectorAll("a").forEach(function (a, i) {
          a.addEventListener("click", function (e) {
            e.preventDefault();
            var acts = activationPositions();
            window.scrollTo(0, Math.max(0, Math.round(acts[i])));
            if (window.history && history.replaceState) {
              history.replaceState(null, "", a.getAttribute("href"));
            }
            spy();
          });
        });
      });
    }
  }

  /* ---------- inline note hover previews ---------- */
  var preview = document.getElementById("note-preview");
  var raw = document.getElementById("notes-index");
  if (preview && raw) {
    var notes = {};
    try {
      JSON.parse(raw.textContent).forEach(function (n) {
        notes[n.url.replace(/\/$/, "")] = n;
      });
    } catch (e) { /* ignore */ }

    var hideTimer;
    function show(link, note) {
      clearTimeout(hideTimer);
      preview.hidden = false;
      preview.innerHTML =
        '<div class="note-preview__strip note-preview__strip--' + (note.color || "green") + '"></div>' +
        '<div class="note-preview__body">' +
          '<div class="note-preview__cat">' + esc(note.cat) + "</div>" +
          '<div class="note-preview__title">' + esc(note.title) + "</div>" +
          '<p class="note-preview__desc">' + esc(note.desc) + "</p>" +
        "</div>";
      var r = link.getBoundingClientRect();
      var top = r.bottom + window.scrollY + 8;
      var left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 316);
      preview.style.top = top + "px";
      preview.style.left = Math.max(8, left) + "px";
      requestAnimationFrame(function () { preview.classList.add("is-visible"); });
    }
    function hide() {
      preview.classList.remove("is-visible");
      hideTimer = setTimeout(function () { preview.hidden = true; }, 160);
    }
    function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

    // only inline links inside note text — cards / trail-map already show the summary
    document.querySelectorAll('.prose a[href^="/"]').forEach(function (link) {
      var key = link.getAttribute("href").split("#")[0].replace(/\/$/, "");
      var note = notes[key];
      if (!note) return;
      link.classList.add("note-link");
      link.addEventListener("mouseenter", function () { show(link, note); });
      link.addEventListener("mouseleave", hide);
      link.addEventListener("focus", function () { show(link, note); });
      link.addEventListener("blur", hide);
    });
  }
})();
