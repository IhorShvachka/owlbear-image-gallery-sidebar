import OBR, { buildImage } from "@owlbear-rodeo/sdk";
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
type RoomPlayer = { id: string; name: string; role: "GM" | "PLAYER" };

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
    <label>Власник персонажа<select id="owner-player"><option value="">Не призначено</option></select></label>
    <button id="assign">Зберегти шаблон і прив’язати токен</button>
    <button id="reload" class="secondary">Оновити список токенів</button>
    <div class="notice">Для обмеження керування гравцями ввімкни в Owlbear дозвіл <strong>Character → Owner Only</strong>. Розширення призначає власника вибраному токену й новим копіям, але права потрібно перевірити в кімнаті з кількома гравцями.</div>
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
const ownerSelect = app.querySelector<HTMLSelectElement>("#owner-player")!;
const status = app.querySelector<HTMLDivElement>("#status")!;
const charactersEl = app.querySelector<HTMLDivElement>("#characters")!;

let tokens: TokenSummary[] = [];
let roomPlayers: RoomPlayer[] = [];
let store: CharacterStore = { characters: [] };
let ready = false;
let syncing = false;
const lastSnapshot = new Map<string, string>();

// Only copy properties documented as item/image content or presentation.
// Identity, ownership, layer, metadata and map transforms are deliberately local.
const SYNCABLE_FIELDS = new Set([
  "name",
  "visible",
  "locked",
  "zIndex",
  "disableHit",
  "disableAutoZIndex",
  "description",
  "image",
  "grid",
  "text",
  "textItemType"
]);

// Track writes performed by the extension so their onChange events do not become
// mistaken for player edits and overwrite the canonical template.
const pendingSyncWrites = new Map<string, string>();

function syncableProperties(item: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of SYNCABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      result[key] = item[key];
    }
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

async function loadPlayers(): Promise<void> {
  try {
    const players = await OBR.party.getPlayers();
    roomPlayers = players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role
    })).sort((a, b) => {
      if (a.role !== b.role) return a.role === "GM" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk");
    });

    const previous = ownerSelect.value;
    ownerSelect.innerHTML = '<option value="">Не призначено</option>' + roomPlayers
      .map((player) => `<option value="${safe(player.id)}">${safe(player.name)}${player.role === "GM" ? " · ведучий" : ""}</option>`)
      .join("");
    if (roomPlayers.some((player) => player.id === previous)) ownerSelect.value = previous;
  } catch (error) {
    console.error("Could not load room players", error);
    message("Не вдалося завантажити список гравців кімнати.");
  }
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
        <div class="character-actions"><button class="secondary" data-create="${safe(character.id)}">Створити копію</button><button class="secondary remove" data-remove="${safe(character.id)}">Видалити</button></div>
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
      const expectedFingerprint = fingerprint(desired);
      pendingSyncWrites.set(item.id, expectedFingerprint);
      await OBR.scene.items.updateItems([item.id], (draft) => {
        for (const target of draft as any[]) {
          // Keep each copy's map placement and its own extension metadata.
          for (const [key, value] of Object.entries(desired)) {
            (target as any)[key] = value;
          }
        }
      });
      lastSnapshot.set(item.id, expectedFingerprint);
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

      const pendingFingerprint = pendingSyncWrites.get(item.id);
      if (pendingFingerprint !== undefined && pendingFingerprint === currentFingerprint) {
        pendingSyncWrites.delete(item.id);
        lastSnapshot.set(item.id, currentFingerprint);
        continue;
      }
      // If a newer manual edit happened after our write, do not suppress it.
      if (pendingFingerprint !== undefined) pendingSyncWrites.delete(item.id);

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
        const expectedFingerprint = fingerprint(props);
        pendingSyncWrites.set(peer.id, expectedFingerprint);
        await OBR.scene.items.updateItems([peer.id], (draft) => {
          for (const target of draft) {
            for (const [key, value] of Object.entries(props)) (target as any)[key] = value;
          }
        });
        lastSnapshot.set(peer.id, expectedFingerprint);
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

async function createCharacterCopy(characterId: string): Promise<void> {
  const record = store.characters.find((entry) => entry.id === characterId);
  if (!record) return;
  if (await OBR.player.getRole() !== "GM") {
    message("Створювати копії персонажів може лише ведучий.");
    return;
  }

  const props = record.properties as Record<string, any>;
  if (!props.image || !props.grid) {
    message("У цього шаблону немає даних зображення, необхідних для створення копії.");
    return;
  }

  try {
    const center = await OBR.viewport.getPosition();
    const builder = buildImage(props.image, props.grid)
      .name(record.name)
      .position({ x: center.x, y: center.y })
      .rotation(0)
      .scale({ x: 1, y: 1 })
      .layer("CHARACTER")
      .metadata({ [TOKEN_KEY]: record.id });
    if (record.ownerId) builder.createdUserId(record.ownerId);

    if (typeof props.visible === "boolean") builder.visible(props.visible);
    if (typeof props.locked === "boolean") builder.locked(props.locked);
    if (typeof props.description === "string") builder.description(props.description);
    if (typeof props.zIndex === "number") builder.zIndex(props.zIndex);
    if (props.text) builder.text(props.text);
    if (props.textItemType === "LABEL" || props.textItemType === "TEXT") {
      builder.textItemType(props.textItemType);
    }
    if (typeof props.disableHit === "boolean") builder.disableHit(props.disableHit);
    if (typeof props.disableAutoZIndex === "boolean") builder.disableAutoZIndex(props.disableAutoZIndex);

    await OBR.scene.items.addItems([builder.build()]);
    await loadTokens();
    message(`Копію «${record.name}» додано в центр поточного перегляду. Її позицію можна змінювати незалежно від інших копій.`);
  } catch (error) {
    console.error("Could not create character copy", error);
    message("Не вдалося створити копію персонажа. Перевір консоль Owlbear для деталей.");
  }
}

app.querySelector<HTMLButtonElement>("#reload")!.addEventListener("click", () => void loadTokens());

app.querySelector<HTMLButtonElement>("#assign")!.addEventListener("click", async () => {
  if (!ready) return;
  if (await OBR.player.getRole() !== "GM") {
    message("Призначати персонажів може лише ведучий.");
    return;
  }
  const token = tokens.find((item) => item.id === tokenSelect.value);
  if (!token) {
    message("Спочатку вибери токен зі списку.");
    return;
  }
  const name = nameInput.value.trim() || token.name;
  const owner = roomPlayers.find((player) => player.id === ownerSelect.value);
  const ownerName = owner?.name ?? "";
  const ownerId = owner?.id ?? "";

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
        if (ownerId) target.createdUserId = ownerId;
      }
    });

    const refreshed = (await OBR.scene.items.getItems([selected.id]))[0] as any;
    if (!refreshed) throw new Error("Token disappeared after tagging");
    const properties = syncableProperties(refreshed);
    properties.name = name;
    const record: CharacterRecord = {
      id: recordId,
      name,
      ownerName,
      ownerId,
      tokenName: token.name,
      properties,
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
  const target = event.target as HTMLElement;
  const createButton = target.closest<HTMLButtonElement>("[data-create]");
  if (createButton?.dataset.create && ready) {
    await createCharacterCopy(createButton.dataset.create);
    return;
  }
  const button = target.closest<HTMLButtonElement>("[data-remove]");
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
    await loadPlayers();
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
    OBR.party.onChange(() => void loadPlayers());
  } catch (error) {
    console.error("Characters extension initialization failed", error);
    message("Не вдалося ініціалізувати розширення в цій кімнаті.");
  }
});
