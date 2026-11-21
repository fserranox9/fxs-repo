"use strict";

const storageKey = "cucas-recipe-book-v1";
const backupFormat = "cucas-recipe-book";
const cuca = { id: "cuca", name: "Cuca", favorites: [] };
const adobo = {
  id: "pollo-en-adobo",
  cookId: cuca.id,
  title: "Pollo en Adobo",
  description: "Ahumado, con un toque ácido y mucho sabor. El plato de los domingos en familia.",
  ingredients: ["2 libras de pollo en piezas", "3 chiles guajillos secos", "2 dientes de ajo", "½ taza de vinagre", "1 cucharadita de orégano y sal al gusto"],
  steps: [
    "Tuesta los chiles y remójalos hasta que se suavicen.",
    "Licúa los chiles, el ajo y el vinagre para hacer el adobo.",
    "Marina el pollo en el adobo durante 2 horas.",
    "Cocina a fuego lento hasta que esté tierno. Sirve con arroz y tortillas."
  ],
  story: ""
};
const adoboEnglish = {
  description: "Smoky, tangy, and rich — the heart of every family Sunday.",
  ingredients: ["2 lbs chicken pieces", "3 dried guajillo chiles", "2 cloves garlic", "½ cup vinegar", "1 tsp oregano, salt to taste"],
  steps: [
    "Toast chiles and soak until soft.",
    "Blend chiles, garlic, and vinegar to make adobo sauce.",
    "Marinate chicken in sauce for 2 hours.",
    "Simmer until tender — serve with rice and tortillas."
  ]
};
const recipeIdeas = [
  { id: "asada", title: "Tacos de Asada", description: "Tacos de carne asada con limón y cilantro." },
  { id: "galletas", title: "Galletas de Chocolate", description: "Suavecitas y dulces, como las hacía mamá." }
];

const $ = (selector) => document.querySelector(selector);
const recipeEditor = $("#recipe-editor");
const recipeForm = $("#recipe-form");
const cookEditor = $("#cook-editor");
const cookForm = $("#cook-form");
const reader = $("#recipe-reader");
const readerContent = $("#recipe-content");
const grid = $("#recipe-grid");
const search = $("#recipe-search");
const filter = $("#favorite-filter");
const featureLink = $("#featured-link");
const deleteDialog = $("#recipe-delete");
const treeChart = $("#tree-chart");
const treeCanvas = $("#tree-lines");
let book = emptyBook();
let editingId = null;
let editingCookId = null;
let recipeIdeaId = null;
let readingId = null;
let cookStep = null;
let checkedIngredients = new Set();
let favoritesOnly = false;
let noticeTimer;
const recipePhoto = photoPicker("recipe", false, (photo) => {
  const preview = $("#recipe-photo-preview");
  preview.hidden = !photo;
  if (photo) preview.src = photo;
  else preview.removeAttribute("src");
});
const cookPhoto = photoPicker("cook", true, (photo) => {
  const person = book.cooks.find((cook) => cook.id === editingCookId);
  $("#cook-photo-preview").replaceChildren(profileAvatar({
    id: person?.id,
    name: person?.name ?? cookForm.elements.name.value,
    photo
  }));
});

function emptyBook() {
  return { activeCookId: cuca.id, cooks: [{ ...cuca }], recipes: [] };
}

function currentCook() {
  return book.cooks.find((cook) => cook.id === book.activeCookId);
}

function getRecipe(id) {
  if (id === adobo.id && book.hideAdobo) return undefined;
  return book.recipes.find((recipe) => recipe.id === id) ?? (id === adobo.id ? adobo : undefined);
}

function featuredRecipe() {
  return getRecipe(adobo.id) ?? book.recipes.find((recipe) => recipe.photo);
}

function recipeTranslations(recipe) {
  if (recipe.id !== adobo.id) return {};
  return {
    description: recipe.description === adobo.description ? adoboEnglish.description : "",
    ingredients: recipe.ingredients.map((item) => adoboEnglish.ingredients[adobo.ingredients.indexOf(item)]),
    steps: recipe.steps.map((item) => adoboEnglish.steps[adobo.steps.indexOf(item)])
  };
}

function cookName(id) {
  return book.cooks.find((cook) => cook.id === id)?.name ?? "Familia";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function english(text) {
  const caption = element("span", "translation", text);
  caption.lang = "en";
  return caption;
}

function profileAvatar(person) {
  const source = person.photo || (person.id === cuca.id ? "mom.jpg" : "");
  if (source) {
    const picture = element("img", "profile-avatar");
    picture.src = source;
    picture.alt = "";
    return picture;
  }
  const initial = Array.from(person.name.trim())[0]?.toLocaleUpperCase("es") ?? "?";
  const avatar = element("span", "profile-avatar", initial);
  avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

function photoPicker(kind, avatar, preview) {
  const library = $(`#${kind}-photo-files`);
  const camera = $(`#${kind}-photo-camera`);
  const remove = $(`#${kind}-photo-remove`);
  const save = $(`#save-${kind}`);
  let photo = null;
  let selection = 0;

  function reset(value) {
    selection++;
    photo = value ?? null;
    library.value = "";
    camera.value = "";
    save.disabled = false;
    remove.hidden = !photo;
    preview(photo);
  }

  async function select(event) {
    const [file] = event.currentTarget.files;
    if (!file) return;
    const current = ++selection;
    save.disabled = true;
    formError(`#${kind}-error`);
    try {
      const prepared = await preparePhoto(file, avatar);
      if (current === selection) reset(prepared);
    } catch {
      if (current !== selection) return;
      reset(photo);
      formError(`#${kind}-error`, "No pudimos abrir la foto. Elige una imagen compatible (JPG, PNG o WebP) de hasta 12 MB.");
    }
  }

  $(`#${kind}-photo-choose`).addEventListener("click", () => library.click());
  $(`#${kind}-photo-capture`).addEventListener("click", () => camera.click());
  library.addEventListener("change", select);
  camera.addEventListener("change", select);
  remove.addEventListener("click", () => {
    reset(null);
    $(`#${kind}-photo-choose`).focus();
  });
  const dialog = library.closest("dialog");
  dialog.addEventListener("close", () => { if (!dialog.open) selection++; });
  return { reset, value: () => photo, refresh: () => preview(photo) };
}

async function preparePhoto(file, avatar) {
  if (file.size > 12_000_000) throw new Error("Photo too large");
  const source = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = source;
    await photo.decode();
    const { naturalWidth: width, naturalHeight: height } = photo;
    const shortest = Math.min(width, height);
    const crop = avatar
      ? [(width - shortest) / 2, (height - shortest) / 2, shortest, shortest]
      : [0, 0, width, height];
    const ratio = avatar ? 160 / shortest : Math.min(1, 960 / width, 800 / height);
    const canvas = element("canvas");
    canvas.width = Math.max(1, Math.round(crop[2] * ratio));
    canvas.height = Math.max(1, Math.round(crop[3] * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, ...crop, 0, 0, canvas.width, canvas.height);
    let saved = canvas.toDataURL("image/jpeg", .8);
    if (!avatar && saved.length > 300_000) saved = canvas.toDataURL("image/jpeg", .6);
    if (!isPhoto(saved, avatar ? 85_000 : 400_000)) throw new Error("Photo exceeds storage limit");
    return saved;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function button(className, text, action) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function showNotice(message) {
  const notice = $("#notice");
  clearTimeout(noticeTimer);
  notice.hidden = false;
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

function formError(selector, message = "") {
  const error = $(selector);
  error.textContent = message;
  error.hidden = !message;
}

function saveBook(next, onError = showNotice) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    onError("El navegador no pudo guardar el recetario. Revisa la configuración o el espacio disponible.");
    return false;
  }
  book = next;
  render();
  return true;
}

function normalized(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function render() {
  const featured = featuredRecipe();
  featureLink.closest("figure").hidden = !featured;
  if (featured) {
    const original = featured.id === adobo.id;
    const image = featureLink.querySelector("img");
    const source = featured.photo ?? "recipes/adobo/adobo.jpg";
    if (image.getAttribute("src") !== source) image.src = source;
    image.alt = original && !featured.photo
      ? "Pollo en adobo de chile guajillo en un sartén de hierro"
      : `Foto de ${featured.title}`;
    featureLink.href = original ? "recipes/adobo/index.html" : "#recipes";
    $("#featured-title").textContent = featured.title;
    $("#featured-kicker").textContent = original ? "El plato de Cuca" : "Del recetario familiar";
  }
  renderRecipes();
  const cooks = book.cooks.map((cook) => {
    const chip = button("button button-outline button-small cook-chip", cook.name, () => {
      if (cook.id === book.activeCookId) return;
      if (saveBook({ ...book, activeCookId: cook.id })) {
        document.getElementById(`cook-${cook.id}`).focus();
        showNotice(`Perfil activo: ${cook.name}.`);
      }
    });
    chip.prepend(profileAvatar(cook));
    chip.id = `cook-${cook.id}`;
    chip.setAttribute("aria-pressed", String(cook.id === book.activeCookId));
    return chip;
  });
  $("#cook-list").replaceChildren(...cooks);
  renderTree();
}

function treeDepths(cooks) {
  const children = new Map(cooks.map((cook) => [cook.id, []]));
  const pending = new Map();
  const depths = new Map();
  const ready = [];
  for (const cook of cooks) {
    const parents = cook.parentIds ?? [];
    for (const id of parents) {
      if (!children.has(id)) return null;
      children.get(id).push(cook.id);
    }
    pending.set(cook.id, parents.length);
    depths.set(cook.id, 0);
    if (!parents.length) ready.push(cook.id);
  }
  for (const id of ready) {
    for (const child of children.get(id)) {
      depths.set(child, Math.max(depths.get(child), depths.get(id) + 1));
      const remaining = pending.get(child) - 1;
      pending.set(child, remaining);
      if (!remaining) ready.push(child);
    }
  }
  return ready.length === cooks.length ? depths : null;
}

function renderTree() {
  const depths = treeDepths(book.cooks);
  const generations = [];
  for (const cook of book.cooks) {
    const depth = depths.get(cook.id);
    generations[depth] ??= element("div", "tree-generation");
    generations[depth].setAttribute("role", "group");
    generations[depth].setAttribute("aria-label", `Generación ${depth + 1}`);

    const person = element("article", "tree-person");
    person.id = `tree-person-${cook.id}`;
    const parents = (cook.parentIds ?? []).map(cookName);
    const edit = button("text-link", "Editar perfil", () => openCookEditor(cook));
    edit.setAttribute("aria-label", `Editar el perfil y lugar de ${cook.name}`);
    const heading = element("div", "tree-person-heading");
    heading.append(profileAvatar(cook), element("h3", "", cook.name));
    person.append(heading);
    if (parents.length) person.append(element("p", "", `Padres o tutores: ${parents.join(" y ")}`));
    person.append(edit);
    generations[depth].append(person);
  }
  $("#tree-generations").replaceChildren(...generations);
  requestAnimationFrame(drawTreeLines);
}

function drawTreeLines() {
  const frame = treeChart.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 2);
  treeCanvas.width = Math.round(frame.width * scale);
  treeCanvas.height = Math.round(frame.height * scale);
  $("#tree-scroll-hint").hidden = treeChart.offsetWidth <= treeChart.parentElement.clientWidth;
  const context = treeCanvas.getContext("2d");
  if (!context) return;
  context.scale(scale, scale);
  context.strokeStyle = "#66816f";
  context.lineWidth = 2;
  const cards = new Map(book.cooks.map((cook) => [
    cook.id, document.getElementById(`tree-person-${cook.id}`).getBoundingClientRect()
  ]));
  context.beginPath();
  for (const cook of book.cooks) {
    const child = cards.get(cook.id);
    const childX = child.left + child.width / 2 - frame.left;
    const childY = child.top - frame.top;
    for (const id of cook.parentIds ?? []) {
      const parent = cards.get(id);
      const parentX = parent.left + parent.width / 2 - frame.left;
      const parentY = parent.bottom - frame.top;
      const turn = childY - Math.min(16, (childY - parentY) / 2);
      context.moveTo(parentX, parentY);
      context.lineTo(parentX, turn);
      context.lineTo(childX, turn);
      context.lineTo(childX, childY);
    }
  }
  context.stroke();
}

function renderRecipes() {
  const terms = normalized(search.value).split(/\s+/).filter(Boolean);
  const matches = (fields) => {
    const haystack = normalized(fields.join(" "));
    return terms.every((term) => haystack.includes(term));
  };
  const favorites = currentCook().favorites;
  const original = getRecipe(adobo.id);
  const available = [...(original ? [original] : []), ...book.recipes.filter((recipe) => recipe.id !== adobo.id)];
  const recipes = available.filter((recipe) => {
    return (!favoritesOnly || favorites.includes(recipe.id)) &&
      matches([recipe.title, recipe.description, cookName(recipe.cookId), ...recipe.ingredients,
        ...(recipeTranslations(recipe).ingredients ?? [])]);
  });
  const ideas = favoritesOnly ? [] : recipeIdeas.filter((idea) =>
    !book.recipes.some((recipe) => recipe.ideaId === idea.id || normalized(recipe.title) === normalized(idea.title)) &&
    matches([idea.title, idea.description])
  );
  grid.replaceChildren(...recipes.map(recipeCard), ...ideas.map(ideaCard));
  const empty = $("#recipe-empty");
  empty.textContent = terms.length ? "No encontramos recetas que coincidan con tu búsqueda."
    : favoritesOnly ? "Todavía no hay favoritas. Toca el corazón de una receta para guardarla." : "Todavía no hay recetas.";
  empty.hidden = Boolean(grid.children.length);
}

function recipeCard(recipe) {
  const card = element("article", "recipe-card");
  const actions = element("div", "card-actions");
  const open = button("text-link", "Ver receta", () => openRecipe(recipe.id));
  open.id = `open-${recipe.id}`;
  open.setAttribute("aria-label", `Ver la receta de ${recipe.title}`);
  actions.append(open, favoriteButton(recipe, false));
  if (recipe.photo) {
    const picture = element("img", "recipe-card-photo");
    picture.src = recipe.photo;
    picture.alt = "";
    picture.loading = "lazy";
    card.append(picture);
  }
  card.append(element("p", "card-meta", `De ${cookName(recipe.cookId)}`), element("h3", "", recipe.title));
  if (recipe.description) card.append(element("p", "", recipe.description));
  card.append(actions);
  return card;
}

function ideaCard(idea) {
  const card = element("article", "recipe-card pending");
  const actions = element("div", "card-actions");
  const record = button("text-link", "Anotar la receta", () => openEditor(undefined, idea));
  record.id = `record-${idea.id}`;
  record.setAttribute("aria-label", `Anotar la receta familiar de ${idea.title}`);
  actions.append(record);
  card.append(element("p", "card-meta", "Receta por anotar"), element("h3", "", idea.title), element("p", "", idea.description), actions);
  return card;
}

function favoriteButton(recipe, inReader) {
  const cook = currentCook();
  const saved = cook.favorites.includes(recipe.id);
  const id = `favorite-${inReader ? "reader" : "card"}-${recipe.id}`;
  const toggle = button("icon-button", saved ? "♥" : "♡", () => {
    const favorites = saved ? cook.favorites.filter((favorite) => favorite !== recipe.id) : [...cook.favorites, recipe.id];
    const cooks = book.cooks.map((person) => person.id === cook.id ? { ...person, favorites } : person);
    if (!saveBook({ ...book, cooks })) return;
    if (inReader) toggle.replaceWith(favoriteButton(recipe, true));
    (document.getElementById(id) ?? filter).focus();
  });
  toggle.id = id;
  toggle.setAttribute("aria-label", `Marcar ${recipe.title} como favorita de ${cook.name}`);
  toggle.setAttribute("aria-pressed", String(saved));
  return toggle;
}

function openEditor(recipe, idea) {
  recipeForm.reset();
  editingId = recipe?.id ?? null;
  recipeIdeaId = recipe?.ideaId ?? idea?.id ?? null;
  $("#editor-title").textContent = recipe ? "Editar receta" : "Agregar receta";
  formError("#recipe-error");
  recipePhoto.reset(recipe?.photo);

  const fields = recipeForm.elements;
  fields.cookId.replaceChildren(...book.cooks.map((cook) => new Option(cook.name, cook.id)));
  fields.cookId.value = recipe?.cookId ?? book.activeCookId;
  fields.title.value = recipe?.title ?? idea?.title ?? "";
  fields.description.value = recipe?.description ?? idea?.description ?? "";
  fields.ingredients.value = recipe?.ingredients.join("\n") ?? "";
  fields.steps.value = recipe?.steps.join("\n") ?? "";
  fields.story.value = recipe?.story ?? "";
  recipeEditor.showModal();
  fields.title.focus();
}

function lines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function saveRecipe(event) {
  event.preventDefault();
  if ($("#save-recipe").disabled) return;
  if (editingId && !getRecipe(editingId)) {
    formError("#recipe-error", "La receta se eliminó en otra pestaña. Cierra el formulario para actualizar la vista.");
    return;
  }
  const data = new FormData(recipeForm);
  const recipe = {
    id: editingId ?? `recipe-${crypto.randomUUID()}`,
    cookId: data.get("cookId"),
    title: data.get("title").trim(),
    description: data.get("description").trim(),
    ingredients: lines(data.get("ingredients")),
    steps: lines(data.get("steps")),
    story: data.get("story").trim(),
    ideaId: recipeIdeaId,
    photo: recipePhoto.value()
  };
  if (!recipe.title || !recipe.ingredients.length || !recipe.steps.length) {
    formError("#recipe-error", "Escribe el nombre de la receta, al menos un ingrediente y un paso.");
    return;
  }
  if (!book.cooks.some((cook) => cook.id === recipe.cookId)) {
    formError("#recipe-error", "Elige a la persona que aportó esta receta.");
    return;
  }
  const recipes = book.recipes.some((existing) => existing.id === recipe.id)
    ? book.recipes.map((existing) => existing.id === editingId ? recipe : existing)
    : [recipe, ...book.recipes];
  if (!saveBook({ ...book, recipes }, (message) => formError("#recipe-error", message))) return;
  recipeEditor.close();
  openRecipe(recipe.id);
}

function openCookEditor(cook) {
  cookForm.reset();
  editingCookId = cook?.id ?? null;
  $("#cook-editor-title").textContent = cook ? `Lugar de ${cook.name} en el árbol` : "Agregar a la familia";
  $("#save-cook").textContent = cook ? "Guardar lugar" : "Agregar persona";
  formError("#cook-error");
  cookPhoto.reset(cook?.photo);

  const fields = cookForm.elements;
  $("#cook-name-field").hidden = Boolean(cook);
  $("#cook-placement-field").hidden = Boolean(cook);
  fields.name.disabled = Boolean(cook);
  const relatives = book.cooks.filter((person) => person.id !== editingCookId);
  for (const field of [fields.parent, fields.secondParent, fields.child]) {
    const blank = field === fields.child ? "Elige un hijo o una hija" : "Sin seleccionar";
    field.replaceChildren(new Option(blank, ""), ...relatives.map((person) => new Option(person.name, person.id)));
  }
  fields.parent.value = cook?.parentIds?.[0] ?? "";
  fields.secondParent.value = cook?.parentIds?.[1] ?? "";
  updatePlacementFields();
  cookEditor.showModal();
  (cook ? fields.parent : fields.name).focus();
}

function updatePlacementFields() {
  const fields = cookForm.elements;
  const placement = fields.placement.value;
  const showParents = Boolean(editingCookId) || placement === "child";
  const showChild = !editingCookId && placement === "parent";
  $("#cook-parents").hidden = !showParents;
  $("#cook-child-field").hidden = !showChild;
  fields.parent.required = !editingCookId && showParents;
  fields.child.required = showChild;
  fields.parent.disabled = !showParents;
  fields.secondParent.disabled = !showParents;
  fields.child.disabled = !showChild;
}

function saveCook(event) {
  event.preventDefault();
  if ($("#save-cook").disabled) return;
  const data = new FormData(cookForm);
  const parentIds = [data.get("parent"), data.get("secondParent")].filter(Boolean);
  if (new Set(parentIds).size !== parentIds.length) {
    formError("#cook-error", "Elige a dos personas distintas.");
    return;
  }
  if (parentIds.some((id) => !book.cooks.some((person) => person.id === id))) {
    formError("#cook-error", "El recetario cambió en otra pestaña. Abre el formulario de nuevo para elegir a la persona.");
    return;
  }

  if (editingCookId) {
    if (!book.cooks.some((person) => person.id === editingCookId)) {
      formError("#cook-error", "Este perfil ya no está en el recetario. Cierra el formulario para actualizar la vista.");
      return;
    }
    const cooks = book.cooks.map((person) => person.id === editingCookId
      ? { ...person, parentIds, photo: cookPhoto.value() } : person);
    if (!treeDepths(cooks)) {
      formError("#cook-error", "Este parentesco crea un ciclo. Elige a alguien que no descienda de esta persona.");
      return;
    }
    if (saveBook({ ...book, cooks }, (message) => formError("#cook-error", message))) {
      cookEditor.close();
      document.getElementById(`tree-person-${editingCookId}`).querySelector("button").focus();
      showNotice("Se actualizó el perfil.");
    }
    return;
  }

  const name = data.get("name").trim();
  if (!name) {
    formError("#cook-error", "Escribe el nombre de la persona.");
    return;
  }
  if (book.cooks.some((cook) => normalized(cook.name) === normalized(name))) {
    formError("#cook-error", "Ya hay un perfil con ese nombre. Puedes usar un apodo para distinguirlos.");
    return;
  }
  const cook = { id: `cook-${crypto.randomUUID()}`, name, favorites: [], parentIds, photo: cookPhoto.value() };
  const childId = data.get("child");
  let relatives = book.cooks;
  if (childId) {
    const child = book.cooks.find((person) => person.id === childId);
    if (!child) {
      formError("#cook-error", "El recetario cambió en otra pestaña. Abre el formulario de nuevo para elegir al hijo o hija.");
      return;
    }
    if ((child.parentIds ?? []).length >= 2) {
      formError("#cook-error", `${child.name} ya tiene dos padres, madres o tutores registrados. Edita su lugar para cambiar uno.`);
      return;
    }
    const linkedChild = { ...child, parentIds: [...(child.parentIds ?? []), cook.id] };
    relatives = relatives.map((person) => person.id === childId ? linkedChild : person);
  }
  const next = { ...book, activeCookId: cook.id, cooks: [...relatives, cook] };
  if (!saveBook(next, (message) => formError("#cook-error", message))) return;
  cookEditor.close();
  showNotice(`${name} ya tiene un lugar en la mesa.`);
}

function openRecipe(id) {
  const recipe = getRecipe(id);
  if (!recipe) return;
  readingId = id;
  cookStep = null;
  checkedIngredients = new Set();
  $("#reader-title").textContent = recipe.title;
  renderReader(recipe);
  if (!reader.open) reader.showModal();
  reader.scrollTop = 0;
  reader.querySelector("[data-close]").focus({ preventScroll: true });
}

function recipeList(tag, heading, items, translations = []) {
  const section = element("section");
  const list = element(tag);
  list.append(...items.map((item, index) => {
    const line = element("li", "", item);
    if (translations[index]) line.append(english(translations[index]));
    return line;
  }));
  section.append(element("h3", "", heading), list);
  return section;
}

function renderReader(recipe) {
  const translated = recipeTranslations(recipe);
  const attribution = element("p", "card-meta", `De ${cookName(recipe.cookId)}`);
  const actions = element("div", "reader-actions");
  const start = button("button", "A cocinar", () => {
    cookStep = 0;
    renderCookMode(recipe);
  });
  start.id = "start-cooking";
  actions.append(start, favoriteButton(recipe, true));
  actions.append(button("button button-outline", "Editar receta", () => openEditor(recipe)));
  actions.append(button("button button-outline", "Eliminar", () => {
    $("#delete-message").textContent = `¿Eliminar «${recipe.title}» del recetario de este navegador?`;
    deleteDialog.showModal();
  }));

  const details = element("div", "reader-body");
  details.append(recipeList("ul", "Ingredientes", recipe.ingredients, translated.ingredients),
    recipeList("ol", "Preparación", recipe.steps, translated.steps));
  const contents = [attribution];
  if (recipe.description) {
    const description = element("p", "description", recipe.description);
    if (translated.description) description.append(english(translated.description));
    contents.push(description);
  }
  if (recipe.photo) {
    const picture = element("img", "reader-photo");
    picture.src = recipe.photo;
    picture.alt = `Foto de ${recipe.title}`;
    contents.push(picture);
  }
  contents.push(actions, details);
  if (recipe.story) {
    const story = element("section", "story");
    story.append(element("h3", "", "Historia familiar"), element("p", "", recipe.story));
    contents.push(story);
  }
  readerContent.replaceChildren(...contents);
}

function renderCookMode(recipe) {
  const translated = recipeTranslations(recipe);
  const stepLabel = element("h3", "", `Paso ${cookStep + 1} de ${recipe.steps.length}`);
  stepLabel.tabIndex = -1;
  const progress = element("progress", "cook-progress");
  progress.max = recipe.steps.length;
  progress.value = cookStep + 1;
  progress.setAttribute("aria-label", "Avance de la preparación");
  const actions = element("div", "reader-actions");
  const leave = () => {
    cookStep = null;
    renderReader(recipe);
    $("#start-cooking").focus();
  };
  if (cookStep > 0) actions.append(button("button button-outline", "Paso anterior", () => {
    cookStep--;
    renderCookMode(recipe);
  }));
  if (cookStep < recipe.steps.length - 1) {
    actions.append(button("button", "Siguiente paso", () => {
      cookStep++;
      renderCookMode(recipe);
    }));
    actions.append(button("button button-outline", "Volver a la receta", leave));
  } else {
    actions.append(button("button", "Terminar", leave));
  }

  const checklist = element("ul", "ingredient-checklist");
  checklist.append(...recipe.ingredients.map((ingredient, index) => {
    const item = element("li");
    const label = element("label");
    const check = element("input");
    check.type = "checkbox";
    check.checked = checkedIngredients.has(index);
    check.addEventListener("change", () => {
      if (check.checked) checkedIngredients.add(index);
      else checkedIngredients.delete(index);
    });
    const text = element("span", "", ingredient);
    if (translated.ingredients?.[index]) text.append(english(translated.ingredients[index]));
    label.append(check, text);
    item.append(label);
    return item;
  }));
  const step = element("p", "cook-step", recipe.steps[cookStep]);
  if (translated.steps?.[cookStep]) step.append(english(translated.steps[cookStep]));
  readerContent.replaceChildren(stepLabel, progress, step, actions, element("h3", "", "Lista de ingredientes"), checklist);
  reader.scrollTop = 0;
  stepLabel.focus({ preventScroll: true });
}

function isText(value, length, required = false) {
  return typeof value === "string" && value.length <= length && (!required || Boolean(value.trim()));
}

function isId(value) {
  return typeof value === "string" && /^[a-z\d-]{1,60}$/.test(value);
}

function isPhoto(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isTextList(value, limit) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => isText(item, limit, true)) && value.join("\n").length <= limit;
}

function validateBook(data) {
  if (!data || !Array.isArray(data.cooks) || !Array.isArray(data.recipes)) return false;
  if (data.hideAdobo !== undefined && typeof data.hideAdobo !== "boolean") return false;
  const cooks = new Set();
  for (const cook of data.cooks) {
    if (!cook || !isId(cook.id) || cooks.has(cook.id) || !isText(cook.name, 50, true) ||
        !Array.isArray(cook.favorites) || !cook.favorites.every(isId)) return false;
    if (cook.photo != null && !isPhoto(cook.photo, 85_000)) return false;
    if (cook.parentIds !== undefined && (!Array.isArray(cook.parentIds) || cook.parentIds.length > 2 ||
        new Set(cook.parentIds).size !== cook.parentIds.length || !cook.parentIds.every(isId))) return false;
    cooks.add(cook.id);
  }
  if (!cooks.has(cuca.id) || !cooks.has(data.activeCookId) || !treeDepths(data.cooks)) return false;
  const recipes = new Set();
  for (const recipe of data.recipes) {
    if (!recipe || !isId(recipe.id) || recipes.has(recipe.id) || !cooks.has(recipe.cookId) ||
        !isText(recipe.title, 80, true) || !isText(recipe.description, 180) || !isText(recipe.story, 1200) ||
        !isTextList(recipe.ingredients, 4000) || !isTextList(recipe.steps, 7000) ||
        (recipe.ideaId !== null && !recipeIdeas.some((idea) => idea.id === recipe.ideaId))) return false;
    if ((data.hideAdobo && recipe.id === adobo.id) || (recipe.photo != null && !isPhoto(recipe.photo, 400_000))) return false;
    recipes.add(recipe.id);
  }
  return data.cooks.every((cook) => cook.favorites.every((id) => recipes.has(id) || (!data.hideAdobo && id === adobo.id)));
}

function exportBackup() {
  const contents = JSON.stringify({ format: backupFormat, version: 1, book }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = element("a");
  link.href = url;
  link.download = "cucas-recipe-book.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mergeBackup(incoming) {
  const hideAdobo = book.hideAdobo ?? incoming.hideAdobo;
  const cooks = new Map(book.cooks.map((cook) => [cook.id, cook]));
  incoming.cooks.forEach((cook) => {
    const existing = cooks.get(cook.id);
    cooks.set(cook.id, existing
      ? { ...existing, photo: existing.photo === undefined ? cook.photo : existing.photo,
        favorites: [...new Set([...existing.favorites, ...cook.favorites])] }
      : cook);
  });
  for (const cook of incoming.cooks) {
    const existing = cooks.get(cook.id);
    if (existing.parentIds !== undefined || cook.parentIds === undefined) continue;
    cooks.set(cook.id, { ...existing, parentIds: cook.parentIds });
    if (!treeDepths([...cooks.values()])) cooks.set(cook.id, existing);
  }
  const existingRecipes = new Set(book.recipes.map((recipe) => recipe.id));
  const recipes = [...book.recipes, ...incoming.recipes.filter((recipe) => !existingRecipes.has(recipe.id))];
  return {
    ...book,
    hideAdobo,
    cooks: [...cooks.values()].map((cook) => hideAdobo
      ? { ...cook, favorites: cook.favorites.filter((id) => id !== adobo.id) } : cook),
    recipes: hideAdobo ? recipes.filter((recipe) => recipe.id !== adobo.id) : recipes
  };
}

function deleteRecipe() {
  const recipe = getRecipe(readingId);
  if (!recipe) {
    deleteDialog.close();
    return;
  }
  const recipes = book.recipes.filter((item) => item.id !== recipe.id);
  const cooks = book.cooks.map((cook) => ({ ...cook, favorites: cook.favorites.filter((id) => id !== recipe.id) }));
  const hideAdobo = recipe.id === adobo.id ? true : book.hideAdobo;
  if (!saveBook({ ...book, cooks, recipes, hideAdobo })) return;
  deleteDialog.close();
  reader.close();
  search.focus();
  showNotice("Se eliminó la receta.");
}

async function importBackup(event) {
  const input = event.currentTarget;
  const [file] = input.files;
  input.value = "";
  if (!file) return;
  try {
    if (file.size > 8_000_000) throw new Error("Backup too large");
    const data = JSON.parse(await file.text());
    if (data?.format !== backupFormat || data.version !== 1 || !validateBook(data.book)) {
      throw new Error("Invalid backup");
    }
    const merged = mergeBackup(data.book);
    if (!validateBook(merged)) {
      showNotice("Las relaciones de estos dos árboles no se pueden combinar.");
      return;
    }
    if (saveBook(merged)) showNotice("Se importó la copia y se conservaron tus cambios.");
  } catch {
    showNotice("No pudimos leer la copia. Elige un archivo JSON del recetario menor a 8 MB.");
  }
}

function readStoredBook(value) {
  if (!value) return emptyBook();
  const saved = JSON.parse(value);
  if (!validateBook(saved)) throw new Error("Invalid stored cookbook");
  return saved;
}

try {
  book = readStoredBook(localStorage.getItem(storageKey));
} catch {
  showNotice("El navegador no pudo cargar el recetario guardado. Puedes importar una copia en La familia.");
}

document.querySelectorAll("[data-new-recipe]").forEach((trigger) => trigger.addEventListener("click", () => openEditor()));
document.querySelectorAll("[data-close]").forEach((trigger) => trigger.addEventListener("click", () => trigger.closest("dialog").close()));
recipeForm.addEventListener("submit", saveRecipe);
cookForm.addEventListener("submit", saveCook);
document.querySelectorAll("[data-new-cook]").forEach((trigger) => trigger.addEventListener("click", () => openCookEditor()));
cookForm.elements.placement.addEventListener("change", updatePlacementFields);
cookForm.elements.name.addEventListener("input", cookPhoto.refresh);
$("#confirm-delete").addEventListener("click", deleteRecipe);
$("#export-book").addEventListener("click", exportBackup);
$("#import-book").addEventListener("click", () => $("#backup-file").click());
$("#backup-file").addEventListener("change", importBackup);
featureLink.addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const recipe = featuredRecipe();
  if (!recipe) return;
  event.preventDefault();
  openRecipe(recipe.id);
});
search.addEventListener("input", renderRecipes);
filter.addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  filter.setAttribute("aria-pressed", String(favoritesOnly));
  renderRecipes();
});
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  try {
    book = readStoredBook(event.newValue);
    render();
    if (reader.open) {
      const recipe = getRecipe(readingId);
      if (!recipe) {
        deleteDialog.close();
        reader.close();
      }
      else if (cookStep === null) renderReader(recipe);
    }
  } catch {
    showNotice("No pudimos leer los cambios hechos en otra pestaña.");
  }
});

render();
new ResizeObserver(drawTreeLines).observe(treeChart);
if (location.hash === "#pollo-en-adobo") openRecipe(adobo.id);
