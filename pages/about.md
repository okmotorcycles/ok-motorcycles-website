---
layout: note
title: About OK Motorcycles
description: What OK Motorcycles is, and how to get around.
status: open
permalink: /about/
---

**OK Motorcycles** is a roadside notebook — a slow-growing pile of notes about riding
motorcycles, keeping them alive, and the roads that make it all worth it. It is not a
blog with a beginning and an end. It is a road network: notes get **surveyed**, then
**graded**, **paved**, and occasionally **re-patrolled** when the surface wears.

<!--more-->

## The signs

Everything here is dressed in California freeway signage because that is the language of
the open road. Each note is a sign; each category is a route; the status tags borrow their
meaning from the real Manual on Uniform Traffic Control Devices:

- <span class="tag tag--open">Open Route</span> — done, maintained, ready to ride.
- <span class="tag tag--maintained">Maintained</span> — solid, kept current.
- <span class="tag tag--grading">Under Grading</span> — a work in progress; watch for cones.
- <span class="tag tag--planned">Planned</span> — on the map, not yet paved.

## The route markers

Every card carries a route sign in its corner. Each category flies a different piece of real
California / US highway signage — here's the key:

<div class="signkey">
{% for cat in site.data.categories %}
<div class="signkey__row"><span class="signkey__icon">{% include shield.html type=cat.shield.type h=54 %}</span><span class="signkey__text"><strong>{{ cat.label }}</strong> — {{ cat.sign_note }}</span></div>
{% endfor %}
</div>

## How to get around

Browse the grid on the home page, or start from
[The 600-Mile Chain Ritual](/notes/maintenance/chain-ritual/) if you like to get your
hands dirty, or [Pacific Coast Highway, End to End](/notes/routes/pch/) if you'd rather
just ride. Hover any link to another note and a preview sign pops up — no need to leave
the road you're on.

> Ride your own ride. The road will still be here when you get back.

## Colophon

Built with Jekyll and the [Highway Gothic](https://en.wikipedia.org/wiki/Highway_Gothic)
typeface (FHWA Series), hosted on GitHub Pages at **okmotorcycles.com**. Black and white,
with one coat of paint on top — and that one accent colour follows the light: **Caltrans
guide-sign green by day, highway-construction orange by night.** Flip the headlight toggle
up in the corner and the whole road crew changes shifts.
