import OBR from "@owlbear-rodeo/sdk";
import { catalog as initialCatalog, type GalleryImage } from "./catalog";
import { CHANNEL } from "./protocol";
import "./style.css";

const STORAGE_KEY = "com.ihorshvachka.imagegallery.catalog.v1";
const FOLDERS_KEY = "com.ihorshvachka.imagegallery.folders.v1";

type Recipient = { id: string; name: string; role: string; connectionId: string };

const app = document.querySelector<HTMLDivElement>("#app")!;
let catalog: GalleryImage[] = [...initialCatalog];
let selectedId = catalog[0]?.id ?? "";
let query = "";
let selectedFolder = "Усі папки";
let folders: string[] = [];
let players: Recipient[] = [];
let selectedRecipients = new Set<string>();
let editingId: string | null = null;
let ready = false;

app.innerHTML = `
  <header class="header">
    <div class="header-copy">
      <div class="eyebrow">ІНСТРУМЕНТИ МАЙСТРА</div>
      <h1>Галерея зображень</h1>
      <p class="subhead">Каталог ілюстрацій для твоєї пригоди.</p>
    </div>
    <span class="header-version">v0.3.2</span><span class="header-icon" aria-hidden="true">▧</span>
  </header>

  <label class="search-wrap">
    <span aria-hidden="true">⌕</span>
    <input id="search" type="search" placeholder="Пошук назви, опису або категорії…" autocomplete="off" />
  </label>

  <div class="folder-controls">
    <select id="folder-filter" aria-label="Фільтр папок"><option>Усі папки</option></select>
    <input id="new-folder" maxlength="60" placeholder="Назва нової папки">
    <button id="create-folder" class="secondary">Створити</button>
  </div>
  <div class="section-row"><span>КАТАЛОГ</span><span id="count" class="count"></span></div>
  <div id="gallery" class="gallery"></div>
  <section id="preview" class="preview"></section>

  <section class="editor">
    <div class="section-row"><span id="editor-heading">ДОДАТИ ЗОБРАЖЕННЯ</span></div>
    <label class="field-label">Назва<input id="title-input" maxlength="100" placeholder="Наприклад, Таємничий храм"></label>
    <label class="field-label">URL зображення<input id="url-input" type="url" placeholder="https://…"></label>
    <label class="field-label">Опис (необов’язково)<textarea id="description-input" rows="2" maxlength="500" placeholder="Короткий опис"></textarea></label>
    <label class="field-label">Папка<select id="image-folder"><option value="">Без папки</option></select></label>
    <div class="actions">
      <button id="save-image" class="primary">Зберегти</button>
      <button id="cancel-edit" class="secondary" hidden>Скасувати</button>
    </div>
    <div class="actions">
      <button id="choose-asset" class="secondary">Імпортувати з Asset Manager</button>
      <button id="upload-local" class="secondary">Імпортувати файл</button>
      <input id="file-input" type="file" accept="image/*" multiple hidden>
    </div>
  </section>

  <section class="recipients">
    <div class="section-row"><span>ПОКАЗАТИ КОМУ</span><button id="refresh-players" class="text-button">Оновити</button></div>
    <div id="player-list" class="player-list">Завантаження учасників…</div>
    <div class="actions">
      <button id="select-all" class="secondary">Обрати всіх</button>
      <button id="select-none" class="secondary">Зняти вибір</button>
    </div>
  </section>

  <div class="actions">
    <button id="show" class="primary">↗ Показати обраним</button>
    <button id="hide" class="secondary">Приховати</button>
  </div>
  <div id="status" class="status" role="status">Очікування підключення до Owlbear Rodeo…</div>
  <footer>Зображення відкриваються у вікні учасника й не додаються на ігрову карту.</footer>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const gallery = $("#gallery");
const preview = $("#preview");
const searchInput = $<HTMLInputElement>("#search");
const count = $("#count");
const status = $("#status");
const titleInput = $<HTMLInputElement>("#title-input");
const urlInput = $<HTMLInputElement>("#url-input");
const descriptionInput = $<HTMLTextAreaElement>("#description-input");
const folderInput = $<HTMLSelectElement>("#image-folder");
const folderFilter = $<HTMLSelectElement>("#folder-filter");
const newFolderInput = $<HTMLInputElement>("#new-folder");
const playerList = $("#player-list");
const saveButton = $("#save-image");
const cancelButton = $("#cancel-edit");
const fileInput = $<HTMLInputElement>("#file-input");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]!);
}

function getSelected(): GalleryImage | undefined {
  return catalog.find((image) => image.id === selectedId);
}

function filteredImages(): GalleryImage[] {
  const needle = query.trim().toLocaleLowerCase("uk");
  return catalog.filter((image) => {
    const matchesFolder = selectedFolder === "Усі папки" || (image.folder ?? "") === selectedFolder;
    const matchesQuery = `${image.title} ${image.description ?? ""} ${image.folder ?? ""}`.toLocaleLowerCase("uk").includes(needle);
    return matchesFolder && matchesQuery;
  });
}

async function persistCatalog(): Promise<void> {
  if (!ready) return;
  await OBR.room.setMetadata({ [STORAGE_KEY]: catalog, [FOLDERS_KEY]: folders });
}

function renderFolders(): void {
  folders = [...new Set([...folders, ...catalog.map((image) => image.folder).filter((folder): folder is string => !!folder)])].sort((a, b) => a.localeCompare(b, "uk"));
  const currentFilter = selectedFolder;
  folderFilter.innerHTML = ['<option value="Усі папки">Усі папки</option>', ...folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)].join("");
  folderFilter.value = folders.includes(currentFilter) || currentFilter === "Усі папки" ? currentFilter : "Усі папки";
  if (folderFilter.value !== currentFilter) selectedFolder = folderFilter.value;
  const currentFolder = folderInput.value;
  folderInput.innerHTML = ['<option value="">Без папки</option>', ...folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)].join("");
  if (folders.includes(currentFolder)) folderInput.value = currentFolder;
}

function render(): void {
  renderFolders();
  const images = filteredImages();
  count.textContent = `${images.length} / ${catalog.length}`;

  if (images.length && !images.some((image) => image.id === selectedId)) {
    selectedId = images[0].id;
  }

  gallery.innerHTML = images.length ? images.map((image) => `
    <div class="gallery-item">
      <button class="tile ${image.id === selectedId ? "selected" : ""}" data-id="${escapeHtml(image.id)}" aria-pressed="${image.id === selectedId}">
        <img src="${escapeHtml(image.url)}" alt="" loading="lazy">
        <span class="tile-title">${escapeHtml(image.title)}</span>
        <span class="tile-category">${escapeHtml(image.category || "Без категорії")}${image.folder ? " · 📁 " + escapeHtml(image.folder) : ""}</span>
      </button>
      <div class="tile-tools">
        <button data-edit="${escapeHtml(image.id)}" class="text-button">Редагувати</button>
        <button data-delete="${escapeHtml(image.id)}" class="text-button danger">Видалити</button>
      </div>
    </div>
  `).join("") : `<div class="empty">Нічого не знайдено.</div>`;

  const image = getSelected();
  preview.innerHTML = image
    ? `<img class="preview-image" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.title)}">
       <div class="preview-copy"><span class="preview-label">ВИБРАНО</span><strong>${escapeHtml(image.title)}</strong><span>${escapeHtml(image.description ?? "")}</span></div>`
    : `<div class="empty">Додай зображення або обери його в каталозі.</div>`;

  $("#show").toggleAttribute("disabled", !image || selectedRecipients.size === 0);
}

function renderPlayers(): void {
  playerList.innerHTML = players.length ? players.map((player) => `
    <label class="player-option">
      <input type="checkbox" data-player="${escapeHtml(player.connectionId)}"
        ${selectedRecipients.has(player.connectionId) ? "checked" : ""}>
      <span>${escapeHtml(player.name)}</span>
      <small>${player.role === "GM" ? "Майстер" : "Гравець"}</small>
    </label>
  `).join("") : `<div class="empty">Учасників не знайдено. Перевір кімнату.</div>`;
  render();
}

function resetEditor(): void {
  editingId = null;
  titleInput.value = "";
  urlInput.value = "";
  descriptionInput.value = "";
  folderInput.value = "";
  $("#editor-heading").textContent = "ДОДАТИ ЗОБРАЖЕННЯ";
  saveButton.textContent = "Зберегти";
  cancelButton.hidden = true;
}

function editImage(id: string): void {
  const image = catalog.find((item) => item.id === id);
  if (!image) return;
  editingId = id;
  titleInput.value = image.title;
  urlInput.value = image.url;
  descriptionInput.value = image.description ?? "";
  folderInput.value = image.folder ?? "";
  $("#editor-heading").textContent = "РЕДАГУВАТИ ЗОБРАЖЕННЯ";
  saveButton.textContent = "Зберегти зміни";
  cancelButton.hidden = false;
  titleInput.focus();
}

async function refreshPlayers(): Promise<void> {
  try {
    const all = await OBR.party.getPlayers();
    players = all.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      connectionId: player.connectionId
    }));
    // За замовчуванням обираємо тільки гравців, а не майстра.
    if (selectedRecipients.size === 0) {
      selectedRecipients = new Set(players.filter((player) => player.role === "PLAYER").map((player) => player.connectionId));
    } else {
      selectedRecipients = new Set([...selectedRecipients].filter((id) => players.some((player) => player.connectionId === id)));
    }
    renderPlayers();
  } catch (error) {
    console.error("Could not load players:", error);
    playerList.textContent = "Не вдалося завантажити список учасників.";
  }
}

gallery.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const edit = target.closest<HTMLButtonElement>("[data-edit]");
  const del = target.closest<HTMLButtonElement>("[data-delete]");
  const tile = target.closest<HTMLButtonElement>("[data-id]");

  if (edit?.dataset.edit) {
    editImage(edit.dataset.edit);
    return;
  }

  if (del?.dataset.delete) {
    const image = catalog.find((item) => item.id === del.dataset.delete);
    if (!image || !confirm(`Видалити «${image.title}» з каталогу?`)) return;
    catalog = catalog.filter((item) => item.id !== image.id);
    if (selectedId === image.id) selectedId = catalog[0]?.id ?? "";
    if (editingId === image.id) resetEditor();
    try {
      await persistCatalog();
      render();
      status.textContent = "Зображення видалено.";
    } catch (error) {
      console.error(error);
      status.textContent = "Не вдалося зберегти зміни каталогу.";
    }
    return;
  }

  if (tile?.dataset.id) {
    selectedId = tile.dataset.id;
    render();
  }
});

searchInput.addEventListener("input", () => {
  query = searchInput.value;
  render();
});

folderFilter.addEventListener("change", () => {
  selectedFolder = folderFilter.value;
  render();
});

$("#create-folder").addEventListener("click", () => {
  const name = newFolderInput.value.trim();
  if (!name) { status.textContent = "Введи назву папки."; return; }
  if (folders.some((folder) => folder.toLocaleLowerCase("uk") === name.toLocaleLowerCase("uk"))) {
    status.textContent = "Папка з такою назвою вже існує."; return;
  }
  folders.push(name);
  selectedFolder = name;
  newFolderInput.value = "";
  render();
  folderInput.value = name;
  void persistCatalog().then(() => {
    status.textContent = "Папку створено й збережено. Обери її для нових зображень.";
  }).catch((error) => {
    console.error(error);
    status.textContent = "Папку створено локально, але не вдалося зберегти її в кімнаті.";
  });
});

saveButton.addEventListener("click", async () => {
  const title = titleInput.value.trim() || "Без назви";
  const url = urlInput.value.trim();
  const description = descriptionInput.value.trim();
  const folder = folderInput.value;

  if (!url) {
    status.textContent = "Додай URL зображення або імпортуй його з Asset Manager.";
    return;
  }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "data:", "blob:"].includes(parsed.protocol)) throw new Error("Unsupported URL protocol");
  } catch {
    status.textContent = "Вкажи коректне посилання на зображення.";
    return;
  }

  if (editingId) {
    catalog = catalog.map((image) => image.id === editingId
      ? { ...image, title, url, description, folder: folder || undefined }
      : image);
    selectedId = editingId;
  } else {
    const image: GalleryImage = {
      id: crypto.randomUUID(),
      title, url, description, folder: folder || undefined
    };
    catalog.unshift(image);
    selectedId = image.id;
  }

  try {
    await persistCatalog();
    resetEditor();
    render();
    status.textContent = "Каталог збережено.";
  } catch (error) {
    console.error(error);
    status.textContent = "Не вдалося зберегти каталог у метаданих кімнати.";
  }
});

cancelButton.addEventListener("click", resetEditor);

$("#refresh-players").addEventListener("click", refreshPlayers);
playerList.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  const id = input.dataset.player;
  if (!id) return;
  if (input.checked) selectedRecipients.add(id);
  else selectedRecipients.delete(id);
  render();
});

$("#select-all").addEventListener("click", () => {
  selectedRecipients = new Set(players.filter((player) => player.role === "PLAYER").map((player) => player.connectionId));
  renderPlayers();
});
$("#select-none").addEventListener("click", () => {
  selectedRecipients.clear();
  renderPlayers();
});

$("#choose-asset").addEventListener("click", async () => {
  try {
    // SDK відкриває вибір активів; API не надає прямого списку всієї бібліотеки.
    const assets = await OBR.assets.downloadImages(true, "");
    if (!assets.length) {
      status.textContent = "Зображення не вибрано.";
      return;
    }
    const existingUrls = new Set(catalog.map((image) => image.url));
    const imported: GalleryImage[] = assets
      .filter((asset) => typeof asset.image?.url === "string" && asset.image.url.length > 0 && !existingUrls.has(asset.image.url))
      .map((asset) => ({
        id: crypto.randomUUID(),
        title: asset.name || "Без назви",
        category: asset.type || "Asset Manager",
        url: asset.image.url,
        description: asset.description ?? "",
        folder: folderInput.value || undefined
      }));
    if (!imported.length) {
      status.textContent = "Усі вибрані зображення вже є в каталозі.";
      return;
    }
    catalog = [...imported, ...catalog];
    selectedId = imported[0].id;
    await persistCatalog();
    render();
    status.textContent = "Додано з Asset Manager: " + imported.length + " зображень.";
  } catch (error) {
    console.error(error);
    status.textContent = "Не вдалося імпортувати зображення з Asset Manager.";
  }
});

$("#upload-local").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  if (!files.length) return;

  try {
    await OBR.assets.uploadImages(files.map((file) => ({
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      text: {
        richText: [],
        plainText: "",
        type: "PLAIN" as const,
        width: "AUTO" as const,
        height: "AUTO" as const,
        style: {
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: "#000000",
          strokeOpacity: 1,
          strokeWidth: 0,
          textAlign: "CENTER" as const,
          textAlignVertical: "MIDDLE" as const,
          fontFamily: "Arial",
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 1,
          padding: 0
        }
      },
      textItemType: "LABEL" as const,
      grid: { offset: { x: 0, y: 0 }, dpi: 1 },
      visible: true,
      locked: false,
      rotation: 0,
      scale: { x: 1, y: 1 },
      description: ""
    })), "PROP");

    status.textContent = `Файли завантажено в Asset Manager (${files.length}). Натисни «Імпортувати з Asset Manager» і вибери їх зі списку.`;
  } catch (error) {
    console.error(error);
    status.textContent = "Не вдалося імпортувати файли. Перевір формат і права доступу.";
  } finally {
    fileInput.value = "";
  }
});

$("#show").addEventListener("click", async () => {
  const image = getSelected();
  const recipients = [...selectedRecipients];
  if (!image || recipients.length === 0) {
    status.textContent = "Спочатку обери зображення та хоча б одного гравця.";
    return;
  }

  try {
    await OBR.broadcast.sendMessage(CHANNEL, {
      type: "SHOW",
      image,
      recipients
    }, { destination: "ALL" });
    status.textContent = `Команду показу надіслано. Одержувачів: ${recipients.length}.`;
  } catch (error) {
    console.error(error);
    status.textContent = "Не вдалося надіслати команду показу.";
  }
});

$("#hide").addEventListener("click", async () => {
  const recipients = [...selectedRecipients];
  if (!recipients.length) {
    status.textContent = "Обери учасників, у яких потрібно приховати зображення.";
    return;
  }
  try {
    await OBR.broadcast.sendMessage(CHANNEL, {
      type: "HIDE",
      recipients
    }, { destination: "ALL" });
    status.textContent = "Команду приховування надіслано.";
  } catch (error) {
    console.error(error);
    status.textContent = "Не вдалося надіслати команду приховування.";
  }
});

render();

OBR.onReady(async () => {
  try {
    // Check the current role directly, then cross-check the current player in the party list.
    // This avoids incorrectly blocking the GM if the role response is temporarily stale.
    const role = await OBR.player.getRole();
    let isGM = role === "GM";
    if (!isGM) {
      const currentPlayerId = OBR.player.id;
      const party = await OBR.party.getPlayers();
      isGM = party.some((player) => player.id === currentPlayerId && player.role === "GM");
    }
    if (!isGM) {
      const playerName = await OBR.player.getName().catch(() => "невідомий учасник");
      app.innerHTML = `<div class="access-denied"><strong>Галерея майстра</strong><p>Owlbear Rodeo повідомляє, що поточний профіль «${playerName.replace(/[&<>"]/g, "")}» не має ролі майстра (отримана роль: ${String(role)}).</p><p>Переконайся, що відкрито правильну кімнату та профіль.</p></div>`;
      return;
    }
    const metadata = await OBR.room.getMetadata();
    const savedFolders = metadata[FOLDERS_KEY];
    if (Array.isArray(savedFolders)) folders = savedFolders.filter((folder): folder is string => typeof folder === "string");
    const saved = metadata[STORAGE_KEY];
    if (Array.isArray(saved)) {
      const sampleIds = new Set([
        "mysterious-stranger", "ancient-relic", "old-map",
        "dark-forest", "stormy-sea", "ancient-door"
      ]);
      catalog = saved.filter((item): item is GalleryImage =>
        !!item &&
        typeof item === "object" &&
        typeof (item as GalleryImage).id === "string" &&
        !sampleIds.has((item as GalleryImage).id) &&
        typeof (item as GalleryImage).title === "string" &&
        typeof (item as GalleryImage).url === "string"
      );
      selectedId = catalog[0]?.id ?? "";
      folders = [...new Set(catalog.map((image) => image.folder).filter((folder): folder is string => !!folder))];
    } else {
      await OBR.room.setMetadata({ [STORAGE_KEY]: catalog });
    }
    ready = true;
    render();
    await refreshPlayers();

    OBR.room.onMetadataChange((nextMetadata) => {
      const value = nextMetadata[STORAGE_KEY];
      if (!Array.isArray(value)) return;
      catalog = value as GalleryImage[];
      if (!catalog.some((image) => image.id === selectedId)) selectedId = catalog[0]?.id ?? "";
      render();
    });

    OBR.party.onChange(() => { void refreshPlayers(); });
    status.textContent = "Підключено. Каталог синхронізується з кімнатою.";
  } catch (error) {
    console.error("Gallery initialization failed:", error);
    status.textContent = "Не вдалося завантажити каталог. Перевір дозволи розширення.";
  }
});
