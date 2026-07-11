---
layout: note
title: About OK Motorcycles
description: What OK Motorcycles is, and how to get around.
status: complete
permalink: /about/
---

**OK Motorcycles** is a roadside notebook — a personal blog about motorcycles, the video
games I'm building and playing, and whatever else is running through my head about life and
the world. The name comes straight off the carpool-lane sign: **MOTORCYCLES OK**. It is not a
blog with a beginning and an end. It is a road network: notes get **surveyed**, then
**graded**, **paved**, and occasionally **re-patrolled** when the surface wears.

<!--more-->

## The signs

Every note wears one of three roadwork signs — the same worker figures you pass in a work
zone. There is no colour code; the figure alone tells you how finished the note is:

- {% include status.html s="in-progress" %} — the crew is still digging. Expect rough edges, holes, and changes.
- {% include status.html s="maintained" %} — finished, but kept current as things move. The flagman waves you through.
- {% include status.html s="complete" %} — done and standing on its own two feet. Go ahead and walk it off.

## The dashboard lights

Every card carries a category telltale in its corner — the same warning lights that stare back
at you from a motorcycle dashboard. Here's what each one flags:

<div class="signkey">
{% for cat in site.data.categories %}
<div class="signkey__row"><span class="signkey__icon">{% include dash-icon.html name=cat.icon h=54 %}</span><span class="signkey__text"><strong>{{ cat.label }}</strong> — {{ cat.sign_note }}</span></div>
{% endfor %}
</div>

## How to get around

Browse the grid on the home page — every card is one note, tagged with the dashboard light
that says what it is. If you want to know how the whole thing is put together, start with
[Rebuilding This Site in the Open](/notes/projects/site-rebuild/). Hover any link to another
note and a preview sign pops up — no need to leave the road you're on.

> Ride your own ride. The road will still be here when you get back.

## Colophon

Built with Jekyll and the [Highway Gothic](https://en.wikipedia.org/wiki/Highway_Gothic)
typeface (FHWA Series), hosted on GitHub Pages at **okmotorcycles.com**. Black and white,
with one coat of paint on top — and that one accent colour follows the light: **Caltrans
guide-sign green by day, highway-construction orange by night.** Flip the headlight toggle
up in the corner and the whole road crew changes shifts.
