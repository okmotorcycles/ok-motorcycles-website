---
layout: note
title: Tip Jar
description: Toss a few bucks in the toll booth
permalink: /tip/
sitemap: false
---

If something here made your day a little better, you can toss a few bucks in the toll booth.
Totally optional, always appreciated. Payment is handled by Stripe; nothing about it is shown
publicly. Thank you!

<p class="tipjar__error" id="tip-error" hidden></p>

<form class="tipjar" method="post" action="{{ site.tip_worker }}/checkout">
  <fieldset class="tipjar__amounts">
    <legend class="visually-hidden">Amount</legend>
    {%- assign tips = "3:ca,5:ca,10:ca,20:ca" | split: "," -%}
    {%- for t in tips -%}
    {%- assign parts = t | split: ":" -%}
    {%- assign amt = parts[0] -%}
    {%- assign shape = parts[1] %}
    <label class="tipjar__sign">
      <input type="radio" name="amount" value="{{ amt }}" required{% if amt == "5" %} checked{% endif %}>
      {% include tip-shield.html type=shape amount=amt %}
      <span class="visually-hidden">${{ amt }}</span>
    </label>
    {%- endfor %}
  </fieldset>
  <label class="tipjar__field"><span>Name</span>
    <input type="text" name="name" maxlength="50" autocomplete="name">
  </label>
  <label class="tipjar__field"><span>Note <small class="tipjar__count" id="tip-count">0 / 500</small></span>
    <textarea name="message" maxlength="500" rows="4"></textarea>
  </label>
  {%- comment -%} Honeypot: hidden from people, filled in by bots; the Worker drops those. {%- endcomment %}
  <label class="tipjar__trap" aria-hidden="true">Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
  <button class="copy-btn tipjar__go" type="submit">Pay the toll</button>
</form>

<script>
  (function () {
    var box = document.getElementById("tip-error");
    function show(msg) { box.textContent = msg; box.hidden = !msg; }
    show(new URLSearchParams(location.search).get("error") || "");

    var form = document.querySelector(".tipjar");
    var btn = form.querySelector(".tipjar__go");
    var note = form.elements.message, count = document.getElementById("tip-count");
    function tally() { count.textContent = note.value.length + " / 500"; }
    note.addEventListener("input", tally); tally();

    // Same rules as parseTip() in the tips Worker, which enforces them regardless.
    var LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ru|xyz|info|biz|app|dev|me|ly)\b)/i;
    function clean(v) { return v.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim(); }
    function problem(text, label, max) {
      if ([...text].length > max) return label + " can be at most " + max + " characters.";
      if (/[<>]/.test(text)) return label + " can't contain < or >.";
      if (LINK.test(text)) return label + " can't contain links.";
      if (/(.)\1{10,}/u.test(text)) return label + " has too many repeated characters.";
      return "";
    }
    form.addEventListener("submit", function (ev) {
      var name = clean(form.elements.name.value), msg = clean(note.value);
      var err = problem(name, "Name", 50) ||
        (name && !/^[\p{L}\p{M}\p{N} .,'’&-]+$/u.test(name) ? "Name can only use letters, numbers and basic punctuation." : "") ||
        (name && !/\p{L}/u.test(name) ? "Name needs at least one letter." : "") ||
        problem(msg, "Note", 500);
      if (!form.querySelector('input[name="amount"]:checked')) err = "Pick an amount.";
      if (err) { ev.preventDefault(); show(err); box.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      // One press = one checkout; a double-click shouldn't open two.
      btn.disabled = true; btn.textContent = "Heading to Stripe…";
    });
    // Coming back from Stripe with the Back button restores the page from cache; re-arm it.
    addEventListener("pageshow", function () { btn.disabled = false; btn.textContent = "Pay the toll"; });
  })();
</script>
