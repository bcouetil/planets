# planets

Three.js atlas of [my articles](https://dev.to/bcouetil/all-my-articles-by-theme-463k): five series as planets.

Live: <https://bcouetil.github.io/planets/>

The experiment is **zero-click** desktop browsing, two gestures and no click until you want an article: **[scrub](https://en.wikipedia.org/wiki/Scrubbing_(audio))** — pointer X rolls the belt, same mapping as a [YouTube seek bar](https://blog.youtube/news-and-events/looking-ahead-in-youtube-player/); **[hover-intent](https://briancherne.github.io/jquery-hoverIntent/)** — linger near a docked planet and it comes to the center.

![Desktop: five article planets, badges on a Saturn-like belt](readme-desktop.jpg)

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>. Not `file://` (CORS on badge textures).

Three.js 0.170 via import map. Background solar system adapted from [N3rson/Solar-System-3D](https://github.com/N3rson/Solar-System-3D) (MIT, Karol Fryc); texture credits in `solar/NOTICE.txt`.

---

**Phone** — no hover, so no zero-click. Swipe the stacked covers, tap one to open. Section titles sit at mid-screen at the start of the list. The live page picks this layout on coarse pointers; `?mobile=1` forces it.

![Mobile: vertical swipe through article covers over the solar system](readme-mobile.jpg)
