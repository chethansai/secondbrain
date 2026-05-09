import { CategoryPath, CategorySummary, MutationResult, NoteItem, NotesData } from '../../shared/types/notes';

export function cloneData(data: NotesData): NotesData {
  return JSON.parse(JSON.stringify(data)) as NotesData;
}

export function cloneItems(items: NoteItem[]): NoteItem[] {
  return JSON.parse(JSON.stringify(items)) as NoteItem[];
}

export function normalizeName(name: string): string {
  return name.trim();
}

export function getCategoryItems(data: NotesData, path: CategoryPath): NoteItem[] | null {
  if (path.length === 0) return null;
  let current: NoteItem[] | undefined = data[path[0]];
  if (!Array.isArray(current)) return null;

  for (const segment of path.slice(1)) {
    const child: NoteItem | undefined = current.find((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, segment));
    if (!child || typeof child === 'string') return null;
    current = child[segment];
    if (!Array.isArray(current)) return null;
  }

  return current;
}

export function listRootCategories(data: NotesData): CategorySummary[] {
  return Object.entries(data).map(([name, items]) => summarizeCategory(name, [name], items));
}

export function listAllCategories(data: NotesData): CategorySummary[] {
  return Object.entries(data).flatMap(([name, items]) => listCategoryBranch(name, [name], items));
}

export function collapseExactNameCategories(categories: CategorySummary[]): CategorySummary[] {
  const byName = new Map<string, CategorySummary>();
  categories.forEach((category) => {
    const existing = byName.get(category.name);
    if (!existing || category.path.length < existing.path.length) {
      byName.set(category.name, category);
    }
  });
  return categories.filter((category) => byName.get(category.name) === category);
}

export function listChildCategories(items: NoteItem[], parentPath: CategoryPath): CategorySummary[] {
  return items.flatMap((item, itemIndex) => {
    if (!isCategoryNode(item)) return [];
    const [name, childItems] = Object.entries(item)[0];
    return [summarizeCategory(name, [...parentPath, name], childItems, itemIndex)];
  });
}

export function createRootCategory(data: NotesData, name: string): MutationResult {
  const cleanName = normalizeName(name);
  if (!cleanName) return failure('empty_name', 'Category name cannot be empty.');
  if (Object.prototype.hasOwnProperty.call(data, cleanName)) return failure('duplicate_category', 'A category with this name already exists.');
  const next = cloneData(data);
  const nestedItems = findNestedCategoryItems(next, cleanName);
  next[cleanName] = nestedItems ? cloneItems(nestedItems) : [];
  return { ok: true, data: next };
}

export function createSubcategory(data: NotesData, parentPath: CategoryPath, name: string): MutationResult {
  const cleanName = normalizeName(name);
  if (!cleanName) return failure('empty_name', 'Category name cannot be empty.');
  const next = cloneData(data);
  const parent = getCategoryItems(next, parentPath);
  const parentName = parentPath[parentPath.length - 1];
  if (!parent) return failure('path_not_found', 'The selected category no longer exists.');
  if (!parentName) return failure('path_not_found', 'The selected category no longer exists.');
  if (cleanName === parentName) return failure('duplicate_category', 'A subcategory cannot have the same name as its parent.');
  if (parent.some((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, cleanName))) {
    return failure('duplicate_category', 'A subcategory with this name already exists here.');
  }
  const standaloneItems = next[cleanName] ? cloneItems(next[cleanName]) : cloneItems(findNestedCategoryItems(next, cleanName) ?? []);
  addSubcategoryToCategoriesNamed(next, parentName, cleanName, standaloneItems);
  next[cleanName] = cloneItems(standaloneItems);
  syncStandaloneCategory(next, parentPath);
  syncStandaloneCategory(next, [cleanName]);
  return { ok: true, data: next };
}

export function renameCategory(data: NotesData, path: CategoryPath, newName: string): MutationResult {
  const cleanName = normalizeName(newName);
  if (!cleanName) return failure('empty_name', 'Category name cannot be empty.');
  const oldName = path[path.length - 1];
  if (!oldName) return failure('path_not_found', 'Choose a category to rename.');
  if (cleanName === oldName) return { ok: true, data };
  const next = cloneData(data);

  if (path.length === 1) {
    if (Object.prototype.hasOwnProperty.call(next, cleanName)) return failure('duplicate_category', 'A root category with this name already exists.');
    next[cleanName] = next[oldName];
    delete next[oldName];
    renameNestedCategoriesNamed(next, oldName, cleanName, next[cleanName]);
    return { ok: true, data: next };
  }

  const parent = getCategoryItems(next, path.slice(0, -1));
  if (!parent) return failure('path_not_found', 'The selected category no longer exists.');
  if (parent.some((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, cleanName))) {
    return failure('duplicate_category', 'A sibling category with this name already exists.');
  }
  if (Object.prototype.hasOwnProperty.call(next, cleanName) && Object.prototype.hasOwnProperty.call(next, oldName)) {
    return failure('duplicate_category', 'A root category with this name already exists.');
  }
  const node = parent.find((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, oldName));
  if (!node || typeof node === 'string') return failure('path_not_found', 'The selected category no longer exists.');
  const items = node[oldName];
  delete node[oldName];
  node[cleanName] = items;
  if (Object.prototype.hasOwnProperty.call(next, oldName)) {
    next[cleanName] = next[oldName];
    delete next[oldName];
  } else {
    next[cleanName] = cloneItems(items);
  }
  return { ok: true, data: next };
}

export function deleteCategory(data: NotesData, path: CategoryPath): MutationResult {
  const name = path[path.length - 1];
  if (!name) return failure('path_not_found', 'Choose a category to delete.');
  const next = cloneData(data);
  if (path.length === 1) {
    if (!Object.prototype.hasOwnProperty.call(next, name)) return failure('path_not_found', 'The selected category no longer exists.');
    delete next[name];
    deleteNestedCategoriesNamed(next, name);
    return { ok: true, data: next };
  }

  const parent = getCategoryItems(next, path.slice(0, -1));
  if (!parent) return failure('path_not_found', 'The selected category no longer exists.');
  const index = parent.findIndex((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, name));
  if (index === -1) return failure('path_not_found', 'The selected category no longer exists.');
  parent.splice(index, 1);
  if (!hasNestedCategoryNamed(next, name)) delete next[name];
  return { ok: true, data: next };
}

export function setCategoryPriority(data: NotesData, path: CategoryPath, priority: number): MutationResult {
  const name = path[path.length - 1];
  if (!name) return failure('path_not_found', 'Choose a category to order.');
  if (path.length === 1) return failure('root_category_order', 'Root category order is managed by the workspace board.');
  const next = cloneData(data);
  const items = getCategoryItems(next, path.slice(0, -1));
  if (!items) return failure('path_not_found', 'The selected category no longer exists.');
  const index = items.findIndex((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, name));
  if (index === -1) return failure('path_not_found', 'The selected category no longer exists.');

  const visibleItems = [...items].reverse();
  const currentVisibleIndex = visibleItems.findIndex((_, visibleIndex) => items.length - 1 - visibleIndex === index);
  if (currentVisibleIndex === -1) return failure('path_not_found', 'The selected category no longer exists.');

  const targetVisibleIndex = Math.max(0, Math.min(priority - 1, visibleItems.length - 1));
  const [selectedCategory] = visibleItems.splice(currentVisibleIndex, 1);
  visibleItems.splice(targetVisibleIndex, 0, selectedCategory);
  items.splice(0, items.length, ...visibleItems.reverse());

  syncStandaloneCategory(next, path.slice(0, -1));
  return { ok: true, data: next };
}

export function syncStandaloneCategory(data: NotesData, path: CategoryPath): NotesData {
  const name = path[path.length - 1];
  if (!name) return data;
  const sourceItems = getCategoryItems(data, path);
  if (!sourceItems) return data;

  if (path.length > 1) {
    data[name] = cloneItems(sourceItems);
    replaceNestedCategoriesNamed(data, name, sourceItems);
    return data;
  }

  replaceNestedCategoriesNamed(data, name, sourceItems);
  return data;
}

export function countCategoryContents(data: NotesData, path: CategoryPath): { notes: number; categories: number } {
  const items = getCategoryItems(data, path);
  if (!items) return { notes: 0, categories: 0 };
  return countItems(items);
}

export function formatPath(path: CategoryPath): string {
  return path.join(' > ');
}

export function isCategoryNode(item: unknown): item is Record<string, NoteItem[]> {
  return typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length === 1;
}

function summarizeCategory(name: string, path: CategoryPath, items: NoteItem[], itemIndex?: number): CategorySummary {
  const childCount = items.filter(isCategoryNode).length;
  const noteCount = items.filter((item) => typeof item === 'string').length;
  return { name, path, noteCount, childCount, itemIndex };
}

function listCategoryBranch(name: string, path: CategoryPath, items: NoteItem[], itemIndex?: number): CategorySummary[] {
  const category = summarizeCategory(name, path, items, itemIndex);
  const children = items.flatMap((item, childIndex) => {
    if (!isCategoryNode(item)) return [];
    const [childName, childItems] = Object.entries(item)[0];
    return listCategoryBranch(childName, [...path, childName], childItems, childIndex);
  });
  return [category, ...children];
}

function countItems(items: NoteItem[]): { notes: number; categories: number } {
  return items.reduce(
    (total, item) => {
      if (typeof item === 'string') return { ...total, notes: total.notes + 1 };
      if (!isCategoryNode(item)) return total;
      const [, childItems] = Object.entries(item)[0];
      const child = countItems(childItems);
      return { notes: total.notes + child.notes, categories: total.categories + child.categories + 1 };
    },
    { notes: 0, categories: 0 },
  );
}

function hasNestedCategoryNamed(data: NotesData, name: string) {
  return Object.values(data).some((items) => containsCategoryNamed(items, name));
}

function findNestedCategoryItems(data: NotesData, name: string) {
  for (const items of Object.values(data)) {
    const found = findItemsNamed(items, name);
    if (found) return found;
  }
  return null;
}

function findItemsNamed(items: NoteItem[], name: string): NoteItem[] | null {
  for (const item of items) {
    if (!isCategoryNode(item)) continue;
    const [childName, childItems] = Object.entries(item)[0];
    if (childName === name) return childItems;
    const found = findItemsNamed(childItems, name);
    if (found) return found;
  }
  return null;
}

function addSubcategoryToCategoriesNamed(data: NotesData, parentName: string, childName: string, childItems: NoteItem[]) {
  Object.entries(data).forEach(([rootName, items]) => {
    if (rootName === parentName && !hasChildCategory(items, childName)) {
      items.push({ [childName]: cloneItems(childItems) });
    }
    addSubcategoryToItemsNamed(items, parentName, childName, childItems);
  });
}

function addSubcategoryToItemsNamed(items: NoteItem[], parentName: string, childName: string, childItems: NoteItem[]) {
  items.forEach((item) => {
    if (!isCategoryNode(item)) return;
    const [categoryName, categoryItems] = Object.entries(item)[0];
    if (categoryName === parentName && !hasChildCategory(categoryItems, childName)) {
      categoryItems.push({ [childName]: cloneItems(childItems) });
    }
    addSubcategoryToItemsNamed(categoryItems, parentName, childName, childItems);
  });
}

function hasChildCategory(items: NoteItem[], childName: string) {
  return items.some((item) => isCategoryNode(item) && Object.prototype.hasOwnProperty.call(item, childName));
}

function containsCategoryNamed(items: NoteItem[], name: string): boolean {
  return items.some((item) => {
    if (!isCategoryNode(item)) return false;
    const [childName, childItems] = Object.entries(item)[0];
    return childName === name || containsCategoryNamed(childItems, name);
  });
}

function replaceNestedCategoriesNamed(data: NotesData, name: string, sourceItems: NoteItem[]) {
  Object.values(data).forEach((items) => replaceItemsNamed(items, name, sourceItems));
}

function replaceItemsNamed(items: NoteItem[], name: string, sourceItems: NoteItem[]) {
  items.forEach((item) => {
    if (!isCategoryNode(item)) return;
    const [childName, childItems] = Object.entries(item)[0];
    if (childName === name) {
      item[childName] = cloneItems(sourceItems);
      return;
    }
    replaceItemsNamed(childItems, name, sourceItems);
  });
}

function renameNestedCategoriesNamed(data: NotesData, oldName: string, newName: string, sourceItems: NoteItem[]) {
  Object.values(data).forEach((items) => renameItemsNamed(items, oldName, newName, sourceItems));
}

function renameItemsNamed(items: NoteItem[], oldName: string, newName: string, sourceItems: NoteItem[]) {
  items.forEach((item) => {
    if (!isCategoryNode(item)) return;
    const [childName, childItems] = Object.entries(item)[0];
    if (childName === oldName) {
      delete item[oldName];
      item[newName] = cloneItems(sourceItems);
      return;
    }
    renameItemsNamed(childItems, oldName, newName, sourceItems);
  });
}

function deleteNestedCategoriesNamed(data: NotesData, name: string) {
  Object.values(data).forEach((items) => deleteItemsNamed(items, name));
}

function deleteItemsNamed(items: NoteItem[], name: string) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!isCategoryNode(item)) continue;
    const [childName, childItems] = Object.entries(item)[0];
    if (childName === name) {
      items.splice(index, 1);
      continue;
    }
    deleteItemsNamed(childItems, name);
  }
}

function failure(code: string, message: string): MutationResult {
  return { ok: false, code, message };
}

function getRootCategoryItems(data: NotesData): NoteItem[] {
  return Object.entries(data).map(([name, items]) => ({ [name]: items }));
}