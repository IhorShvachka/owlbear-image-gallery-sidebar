import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "com.ihorshvachka.characters";
const ROOM_KEY = `${EXTENSION_ID}.characters.v1`;
const TOKEN_KEY = `${EXTENSION_ID}.characterId`;

type CharacterRecord = {
  id: string;
  name: string;
  ownerName: string;
  ownerId: string;
  tokenName: string;
  properties: Record<string, unknown>;
  updatedAt: number;
};

type CharacterStore = { characters: CharacterRecord[] };
type TokenSummary = { id: string; name: string; type: string };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <div class="eyebrow">OWLBEAR RODEO · РОЗШИРЕННЯ</div>
    <h1>Персонажі</h1>
    <p class="muted">Шаблони персонажів і прив’язка токенів до гравців.</p>
  </header>
  <section class="panel">
    <div class="section-title">ПРИЗНАЧИТИ ПЕРСОНАЖА</div>
    <p class="hint">Вибери токен на поточній карті та признач власника. Збережені токени з одним шаблоном синхронізуються в межах активної карти; координати, поворот і масштаб не копіюються.</p>
    <label>Токен на поточній карті<select id="token"><option value="">Завантаження токенів…</option></select></label>
    <label>Ім’я персонажа<input id="character-name" maxlength="100" placeholder="Наприклад, Елара"></label>
    <label>Ім’я гравця<input id="owner-name" maxlength="100" placeholder="Ім’я гравця в кімнаті"></label>
    <label>ID гравця (необов’язково)<input id="owner-id" maxlength="160" placeholder="Для точного зіставлення користувача"></label>
    <button id="assign">Зберегти шаблон</button>
    <button id="reload" class="secondary">Оновити список токенів</button>
    <div id="status" role="status" class="status">Підключення до Owlbear Rodeo…</div>
  </section>
  <section class="panel">
    <div class="section-title">ЗБЕРЕЖЕНІ ШАБЛОНИ</div>
    <div id="characters" class="characters"><p class="muted">Завантаження…</p></div>
  </section>
  <footer>Розташування токенів не є частиною шаблону. Синхронізація між різними сценами та надійне обмеження прав потребують окремої реалізації й перевірки.</footer>
`;

const tokenSelect = app.querySelector<HTMLSelectElement>("#token")!;
const nameInput = app.querySelector<HTMLInputElement>("#character-name")!;
const ownerInput = app.querySelector<HTMLInputElement>("#owner-name")!;
const ownerIdInput = app.querySelector<HTMLInputElement>("#owner-id")!;
const status = app.querySelector<HTMLDivElement>("#status")!;
const charactersEl = app.querySelector<HTMLDivElement>("#characters")!;

let tokens: TokenSummary[] = [];
let store: CharacterStore = { characters: [] };
let ready = false;\nlet syncing = false;\nlet lastSnapshot = new Map<string, string>();\nconst TRANSFORM_FIELDS = new Set(["id", "position", "rotation", "scale", "lastModified", "lastModifiedUserId", "createdUserId", "metadata"]);\n\nfunction syncableProperties(item: Record<string, any>): Record<string, unknown> {\n  const result: Record<string, unknown> = {};\n  for (const [key, value] of Object.entries(item)) {\n    if (TRANSFORM_FIELDS.has(key)) continue;\n    result[key] = value;\n  }\n  return result;\n}\n\nfunction stable(value: unknown): string {\n  try { return JSON.stringify(value, Object.keys((value && typeof value === "object") ? value as object : {}).sort()); } catch { return String(value); }\n}\n\nasync function handleSceneItems(items: any[]): Promise<void> {\n  if (!ready || syncing) return;\n  const linked = items.filter((item) => item?.metadata?.[TOKEN_KEY]);\n  if (!linked.length) return;\n  syncing = true;\n  try {\n    let changed = false;\n    for (const item of linked) {\n      const characterId = String(item.metadata[TOKEN_KEY]);\n      const record = store.characters.find((entry) => entry.id === characterId);\n      if (!record) continue;\n      const props = syncableProperties(item);\n      const fingerprint = JSON.stringify(props);\n      const previous = lastSnapshot.get(item.id);\n      lastSnapshot.set(item.id, fingerprint);\n      if (previous === undefined || previous === fingerprint) continue;\n      record.properties = props;\n      record.tokenName = item.name || record.tokenName;\n      record.updatedAt = Date.now();\n      changed = true;\n      const peers = linked.filter((other) => other.id !== item.id && String(other.metadata[TOKEN_KEY]) === characterId);\n      for (const peer of peers) {\n        await OBR.scene.items.updateItems([peer.id], (draft) => {\n          for (const target of draft) {\n            for (const [key, value] of Object.entries(props)) {\n              (target as any)[key] = value;\n            }\n          }\n        });\n      }\n    }\n    if (changed) await saveStore();\n  } catch (error) {\n    console.error("Character sync failed", error);\n  } finally {\n    syncing = false;\n  }\n}

function message(text: string): void {
  status.textContent = text;
}

function safe(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]!);
}

async function loadStore(): Promise<void> {
  const metadata = await OBR.room.getMetadata();
  const value = metadata[ROOM_KEY] as CharacterStore | undefined;
  store = value && Array.isArray(value.characters) ? value : { characters: [] };
  renderCharacters();
}

async function saveStore(): Promise<void> {
  await OBR.room.setMetadata({ [ROOM_KEY]: store });
}

async function loadTokens(): Promise<void> {
  try {
    const items = await OBR.scene.items.getItems();
    tokens = items
      .filter((item) => item.type === "IMAGE" || item.type === "ATTACHMENT")
      .map((item) => ({
        id: item.id,
        name: item.name?.trim() || `Без назви · ${item.id.slice(0, 8)}`,
        type: item.type
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "uk"));
    const previous = tokenSelect.value;
    tokenSelect.innerHTML = '<option value="">Вибери токен…</option>' + tokens
      .map((token) => `<option value="${safe(token.id)}">${safe(token.name)} · ${safe(token.type)}</option>`)
      .join("");
    if (tokens.some((token) => token.id === previous)) tokenSelect.value = previous;
    if (!tokens.length) message("На поточній карті не знайдено відповідних токенів.");
  } catch (error) {
    console.error("Could not load scene items", error);
    message("Не вдалося прочитати токени поточної карти. Перевір доступ розширення.");
  }
}

function renderCharacters(): void {
  if (!store.characters.length) {
    charactersEl.innerHTML = '<p class="muted">Шаблонів поки немає.</p>';
    return;
  }
  charactersEl.innerHTML = store.characters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "uk"))
    .map((character) => `
      <article class="character">
        <div><strong>${safe(character.name)}</strong><div class="muted">Токен: ${safe(character.tokenName)}</div><div class="muted">Гравець: ${safe(character.ownerName || "Не призначений")}</div></div>
        <button class="secondary remove" data-remove="${safe(character.id)}">Видалити</button>
      </article>
    `).join("");
}

app.querySelector<HTMLButtonElement>("#reload")!.addEventListener("click", () => void loadTokens());

app.querySelector<HTMLButtonElement>("#assign")!.addEventListener("click", async () => {
  if (!ready) return;
  const token = tokens.find((item) => item.id === tokenSelect.value);
  if (!token) {
    message("Спочатку вибери токен зі списку.");
    return;
  }
  const name = nameInput.value.trim() || token.name;
  const ownerName = ownerInput.value.trim();
  const ownerId = ownerIdInput.value.trim();
  try {
    const items = await OBR.scene.items.getItems([token.id]);
    const selected = items[0] as any;
    if (!selected) {
      message("Токен більше не знайдено на цій карті. Онови список.");
      return;
    }
    const properties = { ...selected } as Record<string, unknown>;
    delete properties.position;
    delete properties.rotation;
    delete properties.scale;
    delete properties.id;
    const existing = store.characters.find((character) => character.id === token.id);
    const record: CharacterRecord = {
      id: existing?.id ?? token.id,
      name,
      ownerName,
      ownerId,
      tokenName: token.name,
      properties,
      updatedAt: Date.now()
    };
    store.characters = [...store.characters.filter((character) => character.id !== record.id), record];
    await saveStore();
    renderCharacters();
    message(`Шаблон «${name}» збережено в метаданих кімнати. Зміни шаблону відстежуються для позначених копій на активній карті. Для синхронізації між різними картами потрібен окремий етап.`);
  } catch (error) {
    console.error("Could not save character template", error);
    message("Не вдалося зберегти шаблон. Перевір консоль Owlbear для деталей.");
  }
});

charactersEl.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove]");
  const id = button?.dataset.remove;
  if (!id || !ready) return;
  store.characters = store.characters.filter((character) => character.id !== id);
  try {
    await saveStore();
    renderCharacters();
    message("Шаблон видалено. Токен на карті не видалявся.");
  } catch (error) {
    console.error(error);
    message("Не вдалося видалити шаблон.");
  }
});

OBR.onReady(async () => {
  try {
    await loadStore();
    await loadTokens();
    ready = true;
    message("Підключено. Це початковий модуль шаблонів.");
    OBR.scene.items.onChange((items) => { void loadTokens(); void handleSceneItems(items as any[]); });
    OBR.room.onMetadataChange(() => void loadStore());
  } catch (error) {
    console.error("Characters extension initialization failed", error);
    message("Не вдалося ініціалізувати розширення в цій кімнаті.");
  }
});
