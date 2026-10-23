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
    <p class="hint">Вибери токен на поточній карті та признач власника. Позначені копії одного персонажа на активній карті синхронізуються без перенесення позиції, повороту й масштабу.</p>
    <label>Токен на поточній карті<select id="token"><option value="">Завантаження токенів…</option></select></label>
    <label>Ім’я персонажа<input id="character-name" maxlength="100" placeholder="Наприклад, Елара"></label>
    <label>Ім’я гравця<input id="owner-name" maxlength="100" placeholder="Ім’я гравця в кімнаті"></label>
    <label>ID гравця (необов’язково)<input id="owner-id" maxlength="160" placeholder="Для точного зіставлення користувача"></label>
    <button id="assign">Зберегти шаблон і прив’язати токен</button>
    <button id="reload" class="secondary">Оновити список токенів</button>
    <div id="status" role="status" class="status">Підключення до Owlbear Rodeo…</div>
  </section>
  <section class="panel">
    <div class="section-title">ЗБЕРЕЖЕНІ ШАБЛОНИ</div>
    <div id="characters" class="characters"><p class="muted">Завантаження…</p></div>
  </section>
  <footer>Шаблони зберігаються в метаданих кімнати. Синхронізація між різними сценами та справжнє обмеження прав гравців ще не реалізовані.</footer>
`;

const tokenSelect = app.querySelector<HTMLSelectElement>("#token")!;
const nameInput = app.querySelector<HTMLInputElement>("#character-name")!;
const ownerInput = app.querySelector<HTMLInputElement>("#owner-name")!;
const ownerIdInput = app.querySelector<HTMLInputElement>("#owner-id")!;
const status = app.querySelector<HTMLDivElement>("#status")!;
const charactersEl = app.querySelector<HTMLDivElement>("#characters")!;

let tokens: TokenSummary[] = [];
let store: CharacterStore = { characters: [] };
let ready = false;
let syncing = false;
const lastSnapshot = new Map<string, string>();

const EXCLUDED_FIELDS = new Set([
  "id", "position", "rotation", "scale", "lastModified",
  "lastModifiedUserId", "createdUserId", "metadata"
]);

// Track writes performed by the extension so their onChange events do not become
// mistaken for player edits and overwrite the canonical template.
const pendingSyncWrites = new Set<string>();

function syncableProperties(item: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!EXCLUDED_FIELDS.has(key)) result[key] = value;
  }
  return result;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

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
    message("Не вдалося прочитати токени поточної карти.");
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

async function reconcileActiveScene(): Promise<void> {
  if (!ready || syncing) return;
  syncing = true;
  try {
    const items = await OBR.scene.items.getItems();
    const linked = items.filter((item: any) => item?.metadata?.[TOKEN_KEY]);
    for (const item of linked as any[]) {
      const characterId = String(item.metadata[TOKEN_KEY]);
      const record = store.characters.find((entry) => entry.id === characterId);
      if (!record) continue;
      const current = syncableProperties(item);
      const desired = record.properties;
      if (fingerprint(current) === fingerprint(desired)) {
        lastSnapshot.set(item.id, fingerprint(current));
        continue;
      }
      pendingSyncWrites.add(item.id);
      await OBR.scene.items.updateItems([item.id], (draft) => {
        for (const target of draft as any[]) {
          // Keep each copy's map placement and its own extension metadata.
          for (const [key, value] of Object.entries(desired)) {
            (target as any)[key] = value;
          }
        }
      });
      lastSnapshot.set(item.id, fingerprint(desired));
    }
    await loadTokens();
  } catch (error) {
    console.error("Could not reconcile character templates on active scene", error);
  } finally {
    syncing = false;
  }
}

async function handleSceneItems(items: any[]): Promise<void> {
  if (!ready || syncing) return;
  syncing = true;
  try {
    const linked = items.filter((item) => item?.metadata?.[TOKEN_KEY]);
    const updatesByCharacter = new Map<string, Record<string, unknown>>();
    let changedStore = false;

    for (const item of linked) {
      const characterId = String(item.metadata[TOKEN_KEY]);
      const record = store.characters.find((entry) => entry.id === characterId);
      if (!record) continue;

      const props = syncableProperties(item);
      const currentFingerprint = fingerprint(props);
      const previousFingerprint = lastSnapshot.get(item.id);

      if (pendingSyncWrites.has(item.id)) {
        pendingSyncWrites.delete(item.id);
        lastSnapshot.set(item.id, currentFingerprint);
        continue;
      }

      // First observation initializes the baseline instead of treating it as a user edit.
      if (previousFingerprint === undefined) {
        lastSnapshot.set(item.id, currentFingerprint);
        continue;
      }
      if (previousFingerprint === currentFingerprint) continue;

      lastSnapshot.set(item.id, currentFingerprint);
      record.properties = props;
      record.tokenName = item.name || record.tokenName;
      record.updatedAt = Date.now();
      updatesByCharacter.set(characterId, props);
      changedStore = true;
    }

    // Apply changed canonical properties to other copies on the currently active scene.
    for (const [characterId, props] of updatesByCharacter) {
      for (const peer of linked) {
        if (String(peer.metadata[TOKEN_KEY]) !== characterId) continue;
        const peerProps = syncableProperties(peer);
        if (fingerprint(peerProps) === fingerprint(props)) continue;
        pendingSyncWrites.add(peer.id);
        await OBR.scene.items.updateItems([peer.id], (draft) => {
          for (const target of draft) {
            for (const [key, value] of Object.entries(props)) (target as any)[key] = value;
          }
        });
        lastSnapshot.set(peer.id, fingerprint(props));
      }
    }

    if (changedStore) {
      await saveStore();
      renderCharacters();
    }
  } catch (error) {
    console.error("Character sync failed", error);
  } finally {
    syncing = false;
  }
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

    const existing = store.characters.find((character) => character.id === selected.metadata?.[TOKEN_KEY]);
    const recordId = existing?.id ?? crypto.randomUUID();
    await OBR.scene.items.updateItems([selected.id], (draft) => {
      for (const target of draft) {
        target.metadata = { ...target.metadata, [TOKEN_KEY]: recordId };
      }
    });

    const refreshed = (await OBR.scene.items.getItems([selected.id]))[0] as any;
    if (!refreshed) throw new Error("Token disappeared after tagging");
    const record: CharacterRecord = {
      id: recordId,
      name,
      ownerName,
      ownerId,
      tokenName: token.name,
      properties: syncableProperties(refreshed),
      updatedAt: Date.now()
    };
    store.characters = [...store.characters.filter((character) => character.id !== record.id), record];
    lastSnapshot.set(refreshed.id, fingerprint(record.properties));
    await saveStore();
    renderCharacters();
    message(`Шаблон «${name}» збережено, а токен прив’язано до нього. Синхронізація працює лише для позначених копій на активній карті.`);
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
    message("Шаблон видалено. Токени на карті не видалялися й не розв’язувалися автоматично.");
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
    message("Підключено. Початковий модуль шаблонів активний.");
    const initialItems = await OBR.scene.items.getItems();
    await handleSceneItems(initialItems as any[]);
    OBR.scene.items.onChange((items) => {
      void loadTokens();
      void handleSceneItems(items as any[]);
    });
    OBR.scene.onReadyChange((sceneReady) => {
      if (!sceneReady) return;
      void (async () => {
        await loadStore();
        await reconcileActiveScene();
      })();
    });
    OBR.room.onMetadataChange(() => {
      void loadStore().then(() => reconcileActiveScene());
    });
  } catch (error) {
    console.error("Characters extension initialization failed", error);
    message("Не вдалося ініціалізувати розширення в цій кімнаті.");
  }
});
