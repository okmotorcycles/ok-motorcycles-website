---
layout: note
title: Rebuilding This Site in the Open
description: Why okmotorcycles.com is a California highway sign now — and how the dashboard lights ended up running the place.
category: projects
status: grading
exit: 101
tended: "Jul 2026"
audience: anyone curious how the sausage gets made
tags: [meta, web, jekyll, design]
permalink: /notes/projects/site-rebuild/
---

This site got torn down to the frame and built back up. Not because the old one was broken —
because I wanted it to *feel* like something. This is the log of what changed and why.

<!--more-->

## The idea

I wanted two things that don't obviously go together: the calm, browse-at-your-own-pace feel
of a [digital garden](https://garden.bradwoods.io/), and the visual language of California
road signage — black on white, fat Highway Gothic letters, the stuff you read at 70 mph
without thinking. So the home page isn't a feed. It's a grid of signs. Every card is one note.
Nothing is "latest," nothing is "trending." It's just the network, and you pick a road.

## The dashboard lights

Each category used to fly a highway shield — an interstate marker, a route spade, a stop-sign
octagon. They looked sharp but they didn't *mean* anything. So I swapped them for the warning
lights off a motorcycle dashboard, and let each one carry a category by association instead of
decoration:

- The **battery** (a plus terminal and a minus terminal) runs **Pros & Cons**.
- The **coolant-temp** light, always running hot, runs **Hot Takes**.
- The **oil** light — the good stuff that keeps things smooth — runs **Cocktails**.
- The **check-engine** light runs **Projects**, like this one.
- The **turn signals** — left or right — run **Bologna**, where the local-politics stuff lives.
- The **low-fuel** light runs **Food for Thought**: reviews and things worth your time.

The one detail I'm proud of: the icons are normalized by *visual area*, not by their bounding
box. A wide icon like the oil can and a tall one like the fuel pump used to look wildly
different sizes sitting next to each other. Now they all read at the same optical weight, aspect
ratios untouched. Small thing. Bugged me for a week.

## Day and night

There's a headlight toggle up in the corner. Flip it and the whole site changes shifts —
black-and-white either way, but the single accent colour follows the light: **Caltrans
guide-sign green by day, highway-construction orange by night.** No other colour gets a vote.
The scrollbar, the link hovers, the note-preview signs that pop up when you hover a link — all
of it runs on that one rule.

## What's still on the bench

It's under grading, not paved — the status tag on this note says as much. There's real writing
to fill in behind every one of those dashboard lights. But the road's open. Pull off wherever a
sign looks interesting.

> Build the garage first. The bikes show up later.
