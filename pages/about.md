---
layout: note
title: About OK Motorcycles
description: The motorcycles are OK, and so are you
permalink: /about/
---

OK Motorcycles is a collection of thoughts, games, opinions, feelings, and a broad range of
ideas that I think are neat. Love riding motorcycles? Me too. Enjoy playing video games? Same.
Food and cocktails? Match made in heaven. Making video games? You know it! Reading some
strangers ramblings online? Only if they conform with my view of the world.

The name comes from the carpool lane sign: OK MOTORCYCLES. Many people see the more common
MOTORCYCLES OK, but there are still a few places on the road where they felt like switching it
up. I like mixing things up a bit.

<!--more-->

## The signs

Every post has a road sign, the usual stick person that you see in work zones or around town.
The figure will tell you the state of the post:

<div class="signlist">
<div class="signlist__row">{% include status.html s="in-progress" %}<span class="signlist__note">Cones and potholes everywhere, looks like a mess, but it’ll get better</span></div>
<div class="signlist__row">{% include status.html s="maintained" %}<span class="signlist__note">A live on-going construction of thoughts, expect updates, check it out.</span></div>
<div class="signlist__row">{% include status.html s="complete" %}<span class="signlist__note">All done and ready for everyone, no more changes planned.</span></div>
</div>

## The signals

The classic dashboard icons, they can mean all sorts of things from the mundane to the
annoying. Posts will be categorized by ’em:

<div class="signkey">
{% for cat in site.data.categories %}
<div class="signkey__row"><span class="signkey__icon">{% include dash-icon.html name=cat.icon h=54 %}</span><span class="signkey__text"><strong>{{ cat.label }}</strong> — {{ cat.sign_note }}</span></div>
{% endfor %}
</div>

## How to get around

Browse the grid on the home page, every card is a post, tagged with the dashboard signal that
says what it is. If you want to know how the whole thing is put together, start with
[Rebuilding This Site in the Open](/notes/projects/site-rebuild/).

## Colophon

Built with Jekyll and the [Highway Gothic](https://en.wikipedia.org/wiki/Highway_Gothic)
typeface (FHWA Series), hosted on GitHub Pages. Black and white, and Caltrans guide-sign green
(or highway-construction orange) all over. Flip the headlight toggle up in the corner and the
highway crew changes shifts.
