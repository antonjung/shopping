// ── Data layer ───────────────────────────────────────────────────────────────

const db = (() => {
  function load() {
    try { return JSON.parse(localStorage.getItem('shopping')) || { items: [], menus: [], lists: [] }; }
    catch { return { items: [], menus: [], lists: [] }; }
  }
  let d = load();
  function save() { localStorage.setItem('shopping', JSON.stringify(d)); }

  return {
    // Items
    items: () => d.items,
    getItem: id => d.items.find(i => i.id === id),
    addItem(name, location) {
      const item = { id: uid(), name: name.trim(), location: location.trim() };
      d.items.push(item); save(); return item;
    },
    updateItem(id, name, location) {
      const i = d.items.find(i => i.id === id);
      if (i) { i.name = name.trim(); i.location = location.trim(); save(); }
    },
    deleteItem(id) {
      d.items = d.items.filter(i => i.id !== id);
      d.menus.forEach(m => { m.items = m.items.filter(i => i !== id); });
      d.lists.forEach(l => { l.items = l.items.filter(i => i.id !== id); });
      save();
    },

    // Menus
    menus: () => d.menus,
    getMenu: id => d.menus.find(m => m.id === id),
    addMenu(name) {
      const menu = { id: uid(), name: name.trim(), items: [] };
      d.menus.push(menu); save(); return menu;
    },
    updateMenu(id, name) {
      const m = d.menus.find(m => m.id === id);
      if (m) { m.name = name.trim(); save(); }
    },
    deleteMenu(id) { d.menus = d.menus.filter(m => m.id !== id); save(); },
    toggleMenuItems(menuId, itemId) {
      const m = d.menus.find(m => m.id === menuId);
      if (!m) return;
      const idx = m.items.indexOf(itemId);
      if (idx === -1) m.items.push(itemId); else m.items.splice(idx, 1);
      save();
    },

    // Lists
    lists: () => d.lists,
    getList: id => d.lists.find(l => l.id === id),
    createList(name, menuIds) {
      const itemIds = [...new Set(
        menuIds.flatMap(mid => (d.menus.find(m => m.id === mid) || { items: [] }).items)
      )];
      const list = { id: uid(), name: name.trim(), items: itemIds.map(id => ({ id, completed: false })) };
      d.lists.push(list); save(); return list;
    },
    deleteList(id) { d.lists = d.lists.filter(l => l.id !== id); save(); },
    addItemToList(listId, itemId) {
      const l = d.lists.find(l => l.id === listId);
      if (!l || l.items.find(i => i.id === itemId)) return;
      l.items.push({ id: itemId, completed: false }); save();
    },
    removeFromList(listId, itemId) {
      const l = d.lists.find(l => l.id === listId);
      if (l) { l.items = l.items.filter(i => i.id !== itemId); save(); }
    },
    toggleListItem(listId, itemId) {
      const l = d.lists.find(l => l.id === listId);
      if (!l) return;
      const i = l.items.find(i => i.id === itemId);
      if (i) { i.completed = !i.completed; save(); }
    },
  };
})();

// ── Utilities ────────────────────────────────────────────────────────────────

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function el(id) { return document.getElementById(id); }

function h(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── State ────────────────────────────────────────────────────────────────────

let currentTab = 'items';
let menuDetailId = null;
let activeListId = null;

// ── Navigation ───────────────────────────────────────────────────────────────

function navigate(tab) {
  if (tab !== 'menus') menuDetailId = null;
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  render();
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  el('header-left').innerHTML = '';
  el('header-right').innerHTML = '<button class="header-btn" id="header-action">+</button>';

  switch (currentTab) {
    case 'items':
      el('header-title').textContent = 'Items';
      el('header-action').onclick = openAddItem;
      el('main').innerHTML = renderItems();
      break;

    case 'menus':
      if (menuDetailId) {
        const menu = db.getMenu(menuDetailId);
        el('header-title').textContent = menu ? menu.name : 'Menu';
        el('header-left').innerHTML = `<button class="header-back" onclick="closeMenuDetail()">‹ Menus</button>`;
        el('header-right').innerHTML = `<button class="header-btn" onclick="openAddItemFromMenu()">+</button>`;
        el('main').innerHTML = renderMenuDetail();
      } else {
        el('header-title').textContent = 'Menus';
        el('header-action').onclick = openAddMenu;
        el('main').innerHTML = renderMenus();
      }
      break;

    case 'lists':
      el('header-title').textContent = 'Lists';
      el('header-action').onclick = openNewList;
      el('main').innerHTML = renderLists();
      break;

    case 'shop':
      el('header-title').textContent = 'Shop';
      el('header-right').innerHTML = '';
      if (activeListId && db.getList(activeListId)) {
        el('header-right').innerHTML = `<button class="btn-text" onclick="activeListId=null;render()">Change</button>`;
      }
      el('main').innerHTML = renderShop();
      break;
  }
}

// ── Items view ───────────────────────────────────────────────────────────────

function renderItems() {
  const items = [...db.items()].sort((a, b) =>
    (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name)
  );
  if (!items.length) return `<div class="empty">No items yet.<br>Tap + to add your first item.</div>`;
  return `<div class="card">${items.map(item => `
    <div class="card-item">
      <div class="item-row" onclick="openEditItem('${item.id}')">
        <span class="item-name">${h(item.name)}</span>
        ${item.location ? `<span class="item-loc">${h(item.location)}</span>` : ''}
      </div>
      <button class="btn-icon btn-danger" onclick="confirmDeleteItem('${item.id}')" aria-label="Delete">
        ${iconTrash()}
      </button>
    </div>
  `).join('')}</div>`;
}

function openAddItem() {
  openModal('Add Item', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" placeholder="e.g. Milk" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Location / Aisle</label>
      <input id="f-loc" class="form-input" type="text" placeholder="e.g. Dairy" autocapitalize="words">
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    db.addItem(name, el('f-loc').value);
    render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function openEditItem(id) {
  const item = db.getItem(id);
  if (!item) return;
  openModal('Edit Item', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" value="${h(item.name)}" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Location / Aisle</label>
      <input id="f-loc" class="form-input" type="text" value="${h(item.location)}" autocapitalize="words">
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    db.updateItem(id, name, el('f-loc').value);
    render(); return true;
  });
}

function confirmDeleteItem(id) {
  const item = db.getItem(id);
  if (item && confirm(`Delete "${item.name}"?`)) { db.deleteItem(id); render(); }
}

// ── Menus view ───────────────────────────────────────────────────────────────

function renderMenus() {
  const menus = db.menus();
  if (!menus.length) return `<div class="empty">No menus yet.<br>Tap + to create one.</div>`;
  return `<div class="card">${menus.map(menu => `
    <div class="card-item">
      <div class="item-info" onclick="openMenuDetail('${menu.id}')">
        <div class="item-name">${h(menu.name)}</div>
        <div class="item-sub">${menu.items.length} item${menu.items.length !== 1 ? 's' : ''}</div>
      </div>
      <button class="btn-icon" onclick="openEditMenu('${menu.id}')" aria-label="Edit">
        ${iconEdit()}
      </button>
      <button class="btn-icon btn-danger" onclick="confirmDeleteMenu('${menu.id}')" aria-label="Delete">
        ${iconTrash()}
      </button>
    </div>
  `).join('')}</div>`;
}

function openMenuDetail(id) { menuDetailId = id; render(); }
function closeMenuDetail() { menuDetailId = null; render(); }

function renderMenuDetail() {
  const menu = db.getMenu(menuDetailId);
  if (!menu) return '';
  const items = [...db.items()].sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) return `<div class="empty">No items in catalog yet.<br>Tap + to add one.</div>`;

  return `<div class="card">${items.map(item => `
    <label class="card-item card-check">
      <input type="checkbox" ${menu.items.includes(item.id) ? 'checked' : ''}
        onchange="db.toggleMenuItems('${menuDetailId}','${item.id}');render()">
      <div class="item-info" style="cursor:default">
        <div class="item-name">${h(item.name)}</div>
      </div>
    </label>
  `).join('')}</div>`;
}

function openAddItemFromMenu() {
  openModal('Add Item', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" placeholder="e.g. Milk" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Location / Aisle</label>
      <input id="f-loc" class="form-input" type="text" placeholder="e.g. Dairy" autocapitalize="words">
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    const item = db.addItem(name, el('f-loc').value);
    db.toggleMenuItems(menuDetailId, item.id);
    render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function openAddMenu() {
  openModal('Add Menu', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" placeholder="e.g. Weekly Dinners" autocapitalize="words">
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    db.addMenu(name); render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function openEditMenu(id) {
  const menu = db.getMenu(id);
  if (!menu) return;
  openModal('Edit Menu', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" value="${h(menu.name)}" autocapitalize="words">
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    db.updateMenu(id, name); render(); return true;
  });
}

function confirmDeleteMenu(id) {
  const menu = db.getMenu(id);
  if (menu && confirm(`Delete "${menu.name}"?`)) { db.deleteMenu(id); render(); }
}

// ── Lists view ───────────────────────────────────────────────────────────────

function renderLists() {
  const lists = db.lists();
  if (!lists.length) return `<div class="empty">No lists yet.<br>Tap + to build one from your menus.</div>`;
  return `<div class="card">${lists.map(list => {
    const done = list.items.filter(i => i.completed).length;
    return `
    <div class="card-item">
      <div class="item-info" onclick="startShopping('${list.id}')">
        <div class="item-name">${h(list.name)}</div>
        <div class="item-sub">${list.items.length} item${list.items.length !== 1 ? 's' : ''}${done ? ' · ' + done + ' done' : ''}</div>
      </div>
      <button class="btn-text" onclick="startShopping('${list.id}')">Shop</button>
      <button class="btn-icon btn-danger" onclick="confirmDeleteList('${list.id}')" aria-label="Delete">
        ${iconTrash()}
      </button>
    </div>`;
  }).join('')}</div>`;
}

function startShopping(listId) { activeListId = listId; navigate('shop'); }

function openNewList() {
  const menus = db.menus();
  if (!menus.length) { alert('Create some menus first.'); return; }
  openModal('New List', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" placeholder="e.g. This Week" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Include Menus</label>
      <div class="check-list">${menus.map(m => `
        <label class="check-list-item">
          <input type="checkbox" name="menus" value="${m.id}">
          <span>${h(m.name)}</span>
          <small>${m.items.length} items</small>
        </label>
      `).join('')}</div>
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    const menuIds = [...document.querySelectorAll('input[name="menus"]:checked')].map(i => i.value);
    if (!menuIds.length) { alert('Select at least one menu.'); return false; }
    db.createList(name, menuIds); render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function confirmDeleteList(id) {
  const list = db.getList(id);
  if (list && confirm(`Delete "${list.name}"?`)) {
    if (activeListId === id) activeListId = null;
    db.deleteList(id); render();
  }
}

// ── Shop view ────────────────────────────────────────────────────────────────

function renderShop() {
  if (!activeListId || !db.getList(activeListId)) {
    const lists = db.lists();
    if (!lists.length) return `<div class="empty">No lists yet.<br>Go to Lists to create one.</div>`;
    return `
      <div class="empty" style="padding-bottom:12px">Select a list to shop:</div>
      <div class="card">${lists.map(list => `
        <div class="card-item tappable" onclick="activeListId='${list.id}';render()">
          <div class="item-info" style="cursor:default">
            <div class="item-name">${h(list.name)}</div>
            <div class="item-sub">${list.items.length} item${list.items.length !== 1 ? 's' : ''}</div>
          </div>
          <span class="chevron">›</span>
        </div>
      `).join('')}</div>`;
  }

  const list = db.getList(activeListId);
  const allItems = db.items();
  const listItems = list.items
    .map(li => { const item = allItems.find(i => i.id === li.id); return item ? { ...item, completed: li.completed } : null; })
    .filter(Boolean)
    .sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name));

  const done = listItems.filter(i => i.completed).length;

  const grouped = {};
  listItems.forEach(item => {
    const loc = item.location || 'Other';
    if (!grouped[loc]) grouped[loc] = [];
    grouped[loc].push(item);
  });

  const groupHtml = Object.entries(grouped).map(([loc, items]) => `
    <div class="loc-label">${h(loc)}</div>
    <div class="card">${items.map(item => `
      <div class="card-item shop-item ${item.completed ? 'done' : ''}">
        <label class="shop-check">
          <input type="checkbox" ${item.completed ? 'checked' : ''}
            onchange="db.toggleListItem('${activeListId}','${item.id}');render()">
        </label>
        <div class="item-info" style="cursor:default">
          <div class="item-name">${h(item.name)}</div>
        </div>
        <button class="btn-icon btn-danger" onclick="db.removeFromList('${activeListId}','${item.id}');render()" aria-label="Remove">
          ${iconX()}
        </button>
      </div>
    `).join('')}</div>
  `).join('');

  const addHtml = renderAddToShop();

  return `
    <div class="shop-bar">
      <div class="shop-bar-name">${h(list.name)}</div>
      <div class="shop-bar-progress">${done}/${listItems.length}</div>
    </div>
    ${listItems.length ? groupHtml : '<div class="empty">List is empty.</div>'}
    ${addHtml}
  `;
}

function renderAddToShop() {
  const list = db.getList(activeListId);
  if (!list) return '';
  const inList = new Set(list.items.map(i => i.id));
  const available = db.items().filter(i => !inList.has(i.id));
  if (!available.length) return '';
  return `
    <div class="loc-label" style="margin-top:24px">Add more items</div>
    <div class="card">${available.sort((a,b) => (a.location||'').localeCompare(b.location||'')||a.name.localeCompare(b.name)).map(item => `
      <div class="card-item">
        <div class="item-info" style="cursor:default">
          <div class="item-name">${h(item.name)}</div>
          ${item.location ? `<div class="item-sub">${h(item.location)}</div>` : ''}
        </div>
        <button class="btn-text" onclick="db.addItemToList('${activeListId}','${item.id}');render()">Add</button>
      </div>
    `).join('')}</div>
  `;
}

// ── Modal ────────────────────────────────────────────────────────────────────

let _saveHandler = null;

function openModal(title, body, onSave) {
  _saveHandler = onSave;
  el('modal-content').innerHTML = `
    <div class="modal-header">
      <button class="modal-cancel" onclick="closeModal()">Cancel</button>
      <span class="modal-title">${h(title)}</span>
      <button class="modal-save" onclick="_doSave()">Save</button>
    </div>
    <div class="modal-body">${body}</div>
  `;
  el('modal').showModal();
}

function closeModal() { el('modal').close(); _saveHandler = null; }

function _doSave() {
  if (_saveHandler && _saveHandler() !== false) closeModal();
}

el('modal').addEventListener('click', e => { if (e.target === el('modal')) closeModal(); });

// ── SVG icons ────────────────────────────────────────────────────────────────

function iconTrash() {
  return `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}
function iconEdit() {
  return `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>`;
}
function iconX() {
  return `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}

// ── Service worker registration ───────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Boot ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(tab =>
  tab.addEventListener('click', () => navigate(tab.dataset.tab))
);

render();
