import { SERIES } from "./articles.js";

window.__THREE_READY__ = false;

const root = document.createElement("div");
root.id = "mobile";
root.innerHTML = `<div id="mobile-rail"></div>`;
document.body.appendChild(root);

const rail = root.querySelector("#mobile-rail");

for (const serie of SERIES) {
  const block = document.createElement("section");
  block.className = "mobile-block";

  const intro = document.createElement("div");
  intro.className = "mobile-chapter";
  const disk = document.createElement("div");
  disk.className = "mobile-chapter-disk";
  disk.style.backgroundImage = `url("./textures/planet-${serie.id}.png")`;
  const tag = document.createElement("div");
  tag.className = "mobile-chapter-tag";
  tag.textContent = serie.title;
  intro.append(disk, tag);
  block.appendChild(intro);

  const stack = document.createElement("div");
  stack.className = "mobile-badges";
  for (const article of serie.articles) {
    const link = document.createElement("a");
    link.className = "mobile-badge";
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = article.badge;
    img.alt = article.title;
    link.appendChild(img);
    stack.appendChild(link);
  }
  block.appendChild(stack);
  rail.appendChild(block);
}

let pending = 0;
for (const img of rail.querySelectorAll("img")) {
  if (!img.complete) {
    pending++;
    img.addEventListener(
      "load",
      () => {
        pending--;
        if (pending <= 0) window.__THREE_READY__ = true;
      },
      { once: true },
    );
    img.addEventListener(
      "error",
      () => {
        pending--;
        if (pending <= 0) window.__THREE_READY__ = true;
      },
      { once: true },
    );
  }
}
if (pending === 0) window.__THREE_READY__ = true;
