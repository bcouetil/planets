# planets

Three.js scene of [my articles](https://dev.to/bcouetil/all-my-articles-by-theme-463k): five series as planets, badges on a Saturn-like belt.

Live: <https://bcouetil.github.io/planets/>

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>. Not `file://` (CORS on badge textures).

Desktop-oriented. Three.js 0.170 via import map. Background solar system adapted from [N3rson/Solar-System-3D](https://github.com/N3rson/Solar-System-3D) (MIT, Karol Fryc); texture credits in `solar/NOTICE.txt`.
