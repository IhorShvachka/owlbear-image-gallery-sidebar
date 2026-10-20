import OBR from "@owlbear-rodeo/sdk";
import { catalog, type GalleryImage } from "./catalog";
import { CHANNEL } from "./protocol";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
let selectedId = catalog[0]?.id ?? "";
let query = "";

app.innerHTML = `
  <header class="header">
    <div class="header-copy">
      <div class="eyebrow">ІНСТРУМЕНТИ МАЙСТРА</div>
      <h1>Галерея зображень</h1>
      <p class="subhead">Обери ілюстрацію та покажи її учасникам.</p>
    </div>
    <span class="header-icon" aria-hidden="true">▧</span>
  </header>

  <label class="search-wrap">
    <span aria-hidden="true">⌕</span>
    <input id="search" type="search" placeholder="Пошук назви або категорії…" autocomplete="off" />
  </label>

  <div class="section-row">
    <span>КАТАЛОГ</span>
    <span id="count" class="count"></span>
  </div>
  <div id="gallery" class="gallery"></div>
  <section id="preview" class="preview"></section>

  <div class="actions">
    <button id="show" class="primary">↗ Показати гравцям</button>
    <button id="hide" class="secondary">Приховати</button>
  </div>
  <div id="status" class="status" role="status">Очікування підключення до Owlbear Rodeo…</div>
  <footer>Зображення не додаються на ігрову карту.</footer>
`;

const gallery = document.querySelector<HTMLDivElement>("#gallery")!;
const preview = document.querySelector<HTMLElement>("#preview")!;
const searchInput = document.querySelector<HTMLInputElement>("#search")!;
const count = document.querySelector<HTMLSpanElement>("#count")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const showButton = document.querySelector<HTMLButtonElement>("#show")!;
const hideButton = document.querySelector<HTMLButtonElement>("#hide")!;

function getSelected(): GalleryImage | undefined {
  return catalog.find((image) => image.id === selectedId);
}

function getFiltered(): GalleryImage[] {
  const needle = query.trim().toLocaleLowerCase("uk");
  if (!needle) return catalog;
  return catalog.filter((image) =>
    `${image.title} ${image.category} ${image.description ?? ""}`
      .toLocaleLowerCase("uk")
      .includes(needle)
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]!);
}

function render(): void {
  const images = getFiltered();
  count.textContent = `${images.length}`;
  if (images.length && !images.some((image) => image.id === selectedId)) {
    selectedId = images[0].id;
  }

  gallery.innerHTML = images.length
    ? images.map((image) => `
      <button class="tile ${image.id === selectedId ? "selected" : ""}" data-id="${escapeHtml(image.id)}" aria-pressed="${image.id === selectedId}">
        <img src="${escapeHtml(image.url)}" alt="" loading="lazy" />
        <span class="tile-title">${escapeHtml(image.title)}</span>
        <span class="tile-category">${escapeHtml(image.category)}</span>
      </button>
    `).join("")
    : `<div class="empty">Нічого не знайдено. Спробуй інший запит.</div>`;

  const image = getSelected();
  preview.innerHTML = image
    ? `<img class="preview-image" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.title)}" />
       <div class="preview-copy"><span class="preview-label">ВИБРАНО</span><strong>${escapeHtml(image.title)}</strong><span>${escapeHtml(image.description ?? image.category)}</span></div>`
    : `<div class="empty">Обери зображення в каталозі.</div>`;

  showButton.disabled = !image;
}

gallery.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-id]");
  if (!button?.dataset.id) return;
  selectedId = button.dataset.id;
  render();
});

searchInput.addEventListener("input", () => {
  query = searchInput.value;
  render();
});

showButton.addEventListener("click", async () => {
  const image = getSelected();
  if (!image) return;

  showButton.disabled = true;
  status.textContent = "Надсилаю зображення учасникам…";
  try {
    await OBR.broadcast.sendMessage(CHANNEL, { type: "SHOW", image }, { destination: "ALL" });
    status.textContent = "Команду показу надіслано. Перевір вікна учасників.";
  } catch (error) {
    console.error("Image Gallery broadcast failed:", error);
    status.textContent = "Помилка надсилання. Переконайся, що розширення відкрите в кімнаті.";
  } finally {
    showButton.disabled = false;
  }
});

hideButton.addEventListener("click", async () => {
  hideButton.disabled = true;
  try {
    await OBR.broadcast.sendMessage(CHANNEL, { type: "HIDE" }, { destination: "ALL" });
    status.textContent = "Команду приховування надіслано учасникам.";
  } catch (error) {
    console.error("Image Gallery hide failed:", error);
    status.textContent = "Не вдалося приховати вікно. Перевір підключення.";
  } finally {
    hideButton.disabled = false;
  }
});

render();

OBR.onReady(() => {
  status.textContent = "Підключено до Owlbear Rodeo. Обери зображення.";
});
