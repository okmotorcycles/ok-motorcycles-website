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

  /* ---------- home grid checkerboard (black/white faces by grid position) ---------- */
  var grid = document.querySelector(".sign-grid");
  if (grid) {
    var faces = [];
    grid.querySelectorAll(".sign-card").forEach(function (card) {
      faces.push(card.querySelector(".sign-card__face"));
    });
    var firstPass = true;
    var applyBoard = function () {
      // resolved column count (updates as the grid reflows on resize)
      var tracks = getComputedStyle(grid).gridTemplateColumns;
      var cols = tracks ? tracks.split(" ").filter(Boolean).length : 1;
      if (cols < 1) cols = 1;
      if (firstPass) grid.classList.add("no-face-anim"); // no color animation on first paint
      faces.forEach(function (face, i) {
        if (!face) return;
        var dark = ((Math.floor(i / cols) + (i % cols)) % 2) === 1;
        face.classList.toggle("sign-card__face--black", dark);
      });
      if (firstPass) {
        void grid.offsetHeight;            // flush styles before re-enabling transitions
        grid.classList.remove("no-face-anim");
        firstPass = false;
      }
    };
    applyBoard();
    var boardTimer;
    window.addEventListener("resize", function () {
      clearTimeout(boardTimer);
      boardTimer = setTimeout(applyBoard, 100);
    }, { passive: true });
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

      var spy = function () {
        var pos = window.scrollY + 120;
        var current = headings[0];
        headings.forEach(function (h) { if (h.offsetTop <= pos) current = h; });
        links.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + current.id);
        });
      };
      window.addEventListener("scroll", spy, { passive: true });
      spy();
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
