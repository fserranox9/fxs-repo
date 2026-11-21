"use strict";

const storageKey = "cucas-recipe-book-v1";
const backupFormat = "cucas-recipe-book";
const cuca = { id: "cuca", name: "Cuca", favorites: [] };
const adobo = {
  id: "pollo-en-adobo",
  cookId: cuca.id,
  title: "Pollo en Adobo",
  description: "Smoky, tangy, and rich — the heart of every family Sunday.",
  ingredients: ["2 lbs chicken pieces", "3 dried guajillo chiles", "2 cloves garlic", "½ cup vinegar", "1 tsp oregano, salt to taste"],
  steps: [
    "Toast chiles and soak until soft.",
    "Blend chiles, garlic, and vinegar to make adobo sauce.",
    "Marinate chicken in sauce for 2 hours.",
    "Simmer until tender — serve with rice and tortillas."
  ],
  story: ""
};
const recipeIdeas = [
  { id: "asada", title: "Tacos de Asada", description: "Juicy carne asada tacos with lime and cilantro." },
  { id: "galletas", title: "Galletas de Chocolate", description: "Soft, sweet, and perfectly chewy — just like Mom used to make." }
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

function emptyBook() {
  return { activeCookId: cuca.id, cooks: [{ ...cuca }], recipes: [] };
}

function currentCook() {
  return book.cooks.find((cook) => cook.id === book.activeCookId);
}

function getRecipe(id) {
  return book.recipes.find((recipe) => recipe.id === id) ?? (id === adobo.id ? adobo : undefined);
}

function cookName(id) {
  return book.cooks.find((cook) => cook.id === id)?.name ?? "Family cook";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
    onError("This browser couldn’t save the cookbook. Check its storage settings or available space.");
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
  $("#featured-title").textContent = getRecipe(adobo.id).title;
  renderRecipes();
  const cooks = book.cooks.map((cook) => {
    const chip = button("button button-outline button-small cook-chip", cook.name, () => {
      if (cook.id === book.activeCookId) return;
      if (saveBook({ ...book, activeCookId: cook.id })) {
        document.getElementById(`cook-${cook.id}`).focus();
        showNotice(`Cooking as ${cook.name}.`);
      }
    });
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
    generations[depth].setAttribute("aria-label", `Generation ${depth + 1}`);

    const person = element("article", "tree-person");
    person.id = `tree-person-${cook.id}`;
    const parents = (cook.parentIds ?? []).map(cookName);
    const edit = button("text-link", "Edit placement", () => openCookEditor(cook));
    edit.setAttribute("aria-label", `Edit placement for ${cook.name}`);
    person.append(element("h3", "", cook.name));
    if (parents.length) person.append(element("p", "", `Child of ${parents.join(" and ")}`));
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
  const recipes = [getRecipe(adobo.id), ...book.recipes.filter((recipe) => recipe.id !== adobo.id)].filter((recipe) => {
    return (!favoritesOnly || favorites.includes(recipe.id)) &&
      matches([recipe.title, recipe.description, cookName(recipe.cookId), ...recipe.ingredients]);
  });
  const ideas = favoritesOnly ? [] : recipeIdeas.filter((idea) =>
    !book.recipes.some((recipe) => recipe.ideaId === idea.id || normalized(recipe.title) === normalized(idea.title)) &&
    matches([idea.title, idea.description])
  );
  grid.replaceChildren(...recipes.map(recipeCard), ...ideas.map(ideaCard));
  const empty = $("#recipe-empty");
  empty.textContent = terms.length ? "No recipes match your search." : "No favorites yet. Save a recipe with the heart button.";
  empty.hidden = Boolean(grid.children.length);
}

function recipeCard(recipe) {
  const card = element("article", "recipe-card");
  const actions = element("div", "card-actions");
  const open = button("text-link", "View recipe", () => openRecipe(recipe.id));
  open.id = `open-${recipe.id}`;
  open.setAttribute("aria-label", `View recipe for ${recipe.title}`);
  actions.append(open, favoriteButton(recipe, false));
  card.append(element("p", "card-meta", `By ${cookName(recipe.cookId)}`), element("h3", "", recipe.title));
  if (recipe.description) card.append(element("p", "", recipe.description));
  card.append(actions);
  return card;
}

function ideaCard(idea) {
  const card = element("article", "recipe-card pending");
  const actions = element("div", "card-actions");
  const record = button("text-link", "Add the family recipe", () => openEditor(undefined, idea));
  record.id = `record-${idea.id}`;
  record.setAttribute("aria-label", `Add the family recipe for ${idea.title}`);
  actions.append(record);
  card.append(element("p", "card-meta", "Recipe to record"), element("h3", "", idea.title), element("p", "", idea.description), actions);
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
  toggle.setAttribute("aria-label", `Favorite ${recipe.title} for ${cook.name}`);
  toggle.setAttribute("aria-pressed", String(saved));
  return toggle;
}

function openEditor(recipe, idea) {
  recipeForm.reset();
  editingId = recipe?.id ?? null;
  recipeIdeaId = recipe?.ideaId ?? idea?.id ?? null;
  $("#editor-title").textContent = recipe ? "Edit recipe" : "Add a recipe";
  formError("#recipe-error");

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
  const data = new FormData(recipeForm);
  const recipe = {
    id: editingId ?? `recipe-${crypto.randomUUID()}`,
    cookId: data.get("cookId"),
    title: data.get("title").trim(),
    description: data.get("description").trim(),
    ingredients: lines(data.get("ingredients")),
    steps: lines(data.get("steps")),
    story: data.get("story").trim(),
    ideaId: recipeIdeaId
  };
  if (!recipe.title || !recipe.ingredients.length || !recipe.steps.length) {
    formError("#recipe-error", "Enter a recipe name, at least one ingredient, and at least one step.");
    return;
  }
  if (!book.cooks.some((cook) => cook.id === recipe.cookId)) {
    formError("#recipe-error", "Choose a cook to credit for this recipe.");
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
  $("#cook-editor-title").textContent = cook ? `Place ${cook.name} in the tree` : "Add a family cook";
  $("#save-cook").textContent = cook ? "Save placement" : "Add cook";
  formError("#cook-error");

  const fields = cookForm.elements;
  $("#cook-name-field").hidden = Boolean(cook);
  $("#cook-placement-field").hidden = Boolean(cook);
  fields.name.disabled = Boolean(cook);
  const relatives = book.cooks.filter((person) => person.id !== editingCookId);
  for (const field of [fields.parent, fields.secondParent, fields.child]) {
    const blank = field === fields.child ? "Choose a child" : "None selected";
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
  const data = new FormData(cookForm);
  const parentIds = [data.get("parent"), data.get("secondParent")].filter(Boolean);
  if (new Set(parentIds).size !== parentIds.length) {
    formError("#cook-error", "Choose a different person for each parent or guardian.");
    return;
  }
  if (parentIds.some((id) => !book.cooks.some((person) => person.id === id))) {
    formError("#cook-error", "The cookbook changed in another tab. Reopen this form to choose a parent or guardian.");
    return;
  }

  if (editingCookId) {
    if (!book.cooks.some((person) => person.id === editingCookId)) {
      formError("#cook-error", "This cook is no longer in the cookbook. Close the form to refresh your view.");
      return;
    }
    const cooks = book.cooks.map((person) => person.id === editingCookId ? { ...person, parentIds } : person);
    if (!treeDepths(cooks)) {
      formError("#cook-error", "That placement creates a loop. Choose someone outside this cook’s descendants.");
      return;
    }
    if (saveBook({ ...book, cooks }, (message) => formError("#cook-error", message))) {
      cookEditor.close();
      document.getElementById(`tree-person-${editingCookId}`).querySelector("button").focus();
      showNotice("Family tree updated.");
    }
    return;
  }

  const name = data.get("name").trim();
  if (!name) {
    formError("#cook-error", "Enter a name for the cook.");
    return;
  }
  if (book.cooks.some((cook) => normalized(cook.name) === normalized(name))) {
    formError("#cook-error", "There’s already a cook with that name. Use a nickname to tell them apart.");
    return;
  }
  const cook = { id: `cook-${crypto.randomUUID()}`, name, favorites: [], parentIds };
  const childId = data.get("child");
  let relatives = book.cooks;
  if (childId) {
    const child = book.cooks.find((person) => person.id === childId);
    if (!child) {
      formError("#cook-error", "The cookbook changed in another tab. Reopen this form to choose a child.");
      return;
    }
    if ((child.parentIds ?? []).length >= 2) {
      formError("#cook-error", `${child.name} already has two parents or guardians. Edit their placement to change one.`);
      return;
    }
    const linkedChild = { ...child, parentIds: [...(child.parentIds ?? []), cook.id] };
    relatives = relatives.map((person) => person.id === childId ? linkedChild : person);
  }
  const next = { ...book, activeCookId: cook.id, cooks: [...relatives, cook] };
  if (!saveBook(next, (message) => formError("#cook-error", message))) return;
  cookEditor.close();
  showNotice(`${name} has a place at the family table.`);
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

function recipeList(tag, heading, items) {
  const section = element("section");
  const list = element(tag);
  list.append(...items.map((item) => element("li", "", item)));
  section.append(element("h3", "", heading), list);
  return section;
}

function renderReader(recipe) {
  const attribution = element("p", "card-meta", `By ${cookName(recipe.cookId)}`);
  const actions = element("div", "reader-actions");
  const start = button("button", "Start cooking", () => {
    cookStep = 0;
    renderCookMode(recipe);
  });
  start.id = "start-cooking";
  actions.append(start, favoriteButton(recipe, true));
  actions.append(button("button button-outline", "Edit recipe", () => openEditor(recipe)));

  const details = element("div", "reader-body");
  details.append(recipeList("ul", "Ingredients", recipe.ingredients), recipeList("ol", "Directions", recipe.steps));
  const contents = [attribution];
  if (recipe.description) contents.push(element("p", "description", recipe.description));
  contents.push(actions, details);
  if (recipe.story) {
    const story = element("section", "story");
    story.append(element("h3", "", "From the family table"), element("p", "", recipe.story));
    contents.push(story);
  }
  readerContent.replaceChildren(...contents);
}

function renderCookMode(recipe) {
  const stepLabel = element("h3", "", `Step ${cookStep + 1} of ${recipe.steps.length}`);
  stepLabel.tabIndex = -1;
  const progress = element("progress", "cook-progress");
  progress.max = recipe.steps.length;
  progress.value = cookStep + 1;
  progress.setAttribute("aria-label", "Cooking progress");
  const actions = element("div", "reader-actions");
  const leave = () => {
    cookStep = null;
    renderReader(recipe);
    $("#start-cooking").focus();
  };
  if (cookStep > 0) actions.append(button("button button-outline", "Previous step", () => {
    cookStep--;
    renderCookMode(recipe);
  }));
  if (cookStep < recipe.steps.length - 1) {
    actions.append(button("button", "Next step", () => {
      cookStep++;
      renderCookMode(recipe);
    }));
    actions.append(button("button button-outline", "Back to recipe", leave));
  } else {
    actions.append(button("button", "Finish cooking", leave));
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
    label.append(check, element("span", "", ingredient));
    item.append(label);
    return item;
  }));
  readerContent.replaceChildren(stepLabel, progress, element("p", "cook-step", recipe.steps[cookStep]), actions, element("h3", "", "Ingredient checklist"), checklist);
  reader.scrollTop = 0;
  stepLabel.focus({ preventScroll: true });
}

function isText(value, length, required = false) {
  return typeof value === "string" && value.length <= length && (!required || Boolean(value.trim()));
}

function isId(value) {
  return typeof value === "string" && /^[a-z\d-]{1,60}$/.test(value);
}

function isTextList(value, limit) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => isText(item, limit, true)) && value.join("\n").length <= limit;
}

function validateBook(data) {
  if (!data || !Array.isArray(data.cooks) || !Array.isArray(data.recipes)) return false;
  const cooks = new Set();
  for (const cook of data.cooks) {
    if (!cook || !isId(cook.id) || cooks.has(cook.id) || !isText(cook.name, 50, true) ||
        !Array.isArray(cook.favorites) || !cook.favorites.every(isId)) return false;
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
    recipes.add(recipe.id);
  }
  return data.cooks.every((cook) => cook.favorites.every((id) => recipes.has(id) || id === adobo.id));
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
  const cooks = new Map(book.cooks.map((cook) => [cook.id, cook]));
  incoming.cooks.forEach((cook) => {
    const existing = cooks.get(cook.id);
    cooks.set(cook.id, existing
      ? { ...existing, favorites: [...new Set([...existing.favorites, ...cook.favorites])] }
      : cook);
  });
  for (const cook of incoming.cooks) {
    const existing = cooks.get(cook.id);
    if (existing.parentIds !== undefined || cook.parentIds === undefined) continue;
    cooks.set(cook.id, { ...existing, parentIds: cook.parentIds });
    if (!treeDepths([...cooks.values()])) cooks.set(cook.id, existing);
  }
  const existingRecipes = new Set(book.recipes.map((recipe) => recipe.id));
  return {
    ...book,
    cooks: [...cooks.values()],
    recipes: [...book.recipes, ...incoming.recipes.filter((recipe) => !existingRecipes.has(recipe.id))]
  };
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
      showNotice("These family trees overlap in a way that can’t be merged.");
      return;
    }
    if (saveBook(merged)) showNotice("Backup imported. Existing edits were kept.");
  } catch {
    showNotice("Couldn’t read this backup. Choose a cookbook backup JSON file under 8 MB.");
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
  showNotice("This browser couldn’t load its saved cookbook. You can import a backup from the family table.");
}

document.querySelectorAll("[data-new-recipe]").forEach((trigger) => trigger.addEventListener("click", () => openEditor()));
document.querySelectorAll("[data-close]").forEach((trigger) => trigger.addEventListener("click", () => trigger.closest("dialog").close()));
recipeForm.addEventListener("submit", saveRecipe);
cookForm.addEventListener("submit", saveCook);
document.querySelectorAll("[data-new-cook]").forEach((trigger) => trigger.addEventListener("click", () => openCookEditor()));
cookForm.elements.placement.addEventListener("change", updatePlacementFields);
$("#export-book").addEventListener("click", exportBackup);
$("#import-book").addEventListener("click", () => $("#backup-file").click());
$("#backup-file").addEventListener("change", importBackup);
$("[data-open-adobo]").addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  openRecipe(adobo.id);
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
      if (!recipe) reader.close();
      else if (cookStep === null) renderReader(recipe);
    }
  } catch {
    showNotice("Couldn’t read cookbook changes from another tab.");
  }
});

render();
new ResizeObserver(drawTreeLines).observe(treeChart);
if (location.hash === "#pollo-en-adobo") openRecipe(adobo.id);
