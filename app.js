const VERSION = 'v1.9';

// ── Firebase config check ─────────────────────────────────────────────────────

function firebaseConfigured() {
  return !!(window.firebaseConfig && window.firebaseConfig.apiKey !== 'YOUR_API_KEY');
}

// ── Shared state ──────────────────────────────────────────────────────────────

let state = { items: [], menus: [], lists: [] };
let useRemote = localStorage.getItem('dataMode') === 'remote';
let firestoreDb = null;
let unsubscribers = [];
let remoteLoading = false;

// ── Local storage ─────────────────────────────────────────────────────────────

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem('shopping'));
    if (saved) { state.items = saved.items || []; state.menus = saved.menus || []; state.lists = saved.lists || []; }
  } catch {}
}

function saveLocal() {
  localStorage.setItem('shopping', JSON.stringify(state));
}

// ── Firebase / remote ─────────────────────────────────────────────────────────

function loadFirebaseScripts() {
  if (window.firebase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js';
    s1.onerror = reject;
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js';
      s2.onload = resolve;
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

function initFirestoreDb() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
    firestoreDb = firebase.firestore();
    return true;
  } catch { return false; }
}

function startListeners() {
  if (!firestoreDb) return;
  remoteLoading = true;
  let ready = 0;
  const onReady = () => { if (++ready === 3) { remoteLoading = false; } };

  unsubscribers = [
    firestoreDb.collection('items').onSnapshot(snap => {
      state.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onReady(); render();
    }, () => { remoteLoading = false; render(); }),
    firestoreDb.collection('menus').onSnapshot(snap => {
      state.menus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onReady(); render();
    }),
    firestoreDb.collection('lists').onSnapshot(snap => {
      state.lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onReady(); render();
    }),
  ];
}

function stopListeners() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  remoteLoading = false;
}

async function switchToRemote() {
  try {
    await loadFirebaseScripts();
    if (!initFirestoreDb()) return false;
    useRemote = true;
    localStorage.setItem('dataMode', 'remote');
    startListeners();
    return true;
  } catch { return false; }
}

function switchToLocal() {
  stopListeners();
  firestoreDb = null;
  useRemote = false;
  localStorage.setItem('dataMode', 'local');
  loadLocal();
  render();
}

// ── db object ─────────────────────────────────────────────────────────────────

const db = {
  items: () => state.items,
  getItem: id => state.items.find(i => i.id === id),
  menus: () => state.menus,
  getMenu: id => state.menus.find(m => m.id === id),
  lists: () => state.lists,
  getList: id => state.lists.find(l => l.id === id),

  _persist(col, id, data) {
    if (useRemote && firestoreDb) firestoreDb.collection(col).doc(id).set(data);
    else saveLocal();
  },
  _remove(col, id) {
    if (useRemote && firestoreDb) firestoreDb.collection(col).doc(id).delete();
    else saveLocal();
  },

  addItem(name, location) {
    const item = { id: uid(), name: name.trim(), location: location.trim() };
    state.items.push(item);
    this._persist('items', item.id, { name: item.name, location: item.location });
    return item;
  },
  updateItem(id, name, location) {
    const i = state.items.find(i => i.id === id);
    if (!i) return;
    i.name = name.trim(); i.location = location.trim();
    this._persist('items', id, { name: i.name, location: i.location });
  },
  deleteItem(id) {
    state.items = state.items.filter(i => i.id !== id);
    state.menus.forEach(m => {
      const before = m.items.length;
      m.items = m.items.filter(mi => (typeof mi === 'string' ? mi : mi.id) !== id);
      if (m.items.length !== before) this._persist('menus', m.id, { name: m.name, items: m.items });
    });
    state.lists.forEach(l => {
      if (l.items.some(i => i.id === id)) {
        l.items = l.items.filter(i => i.id !== id);
        this._persist('lists', l.id, { name: l.name, items: l.items });
      }
    });
    this._remove('items', id);
  },

  addMenu(name) {
    const menu = { id: uid(), name: name.trim(), items: [] };
    state.menus.push(menu);
    this._persist('menus', menu.id, { name: menu.name, items: [] });
    return menu;
  },
  updateMenu(id, name) {
    const m = state.menus.find(m => m.id === id);
    if (!m) return;
    m.name = name.trim();
    this._persist('menus', id, { name: m.name, items: m.items });
  },
  deleteMenu(id) {
    state.menus = state.menus.filter(m => m.id !== id);
    this._remove('menus', id);
  },
  toggleMenuItems(menuId, itemId) {
    const m = state.menus.find(m => m.id === menuId);
    if (!m) return;
    m.items = m.items.map(mi => typeof mi === 'string' ? { id: mi, qty: 1 } : mi);
    const idx = m.items.findIndex(mi => mi.id === itemId);
    if (idx === -1) m.items.push({ id: itemId, qty: 1 }); else m.items.splice(idx, 1);
    this._persist('menus', menuId, { name: m.name, items: m.items });
  },
  setMenuItemQty(menuId, itemId, qty) {
    const m = state.menus.find(m => m.id === menuId);
    if (!m) return;
    m.items = m.items.map(mi => typeof mi === 'string' ? { id: mi, qty: 1 } : mi);
    const mi = m.items.find(mi => mi.id === itemId);
    if (mi) mi.qty = Math.max(1, qty);
    this._persist('menus', menuId, { name: m.name, items: m.items });
  },

  createList(name, menuIds, menuInfos = []) {
    const itemMap = {};
    menuIds.forEach(mid => {
      const menu = state.menus.find(m => m.id === mid);
      if (!menu) return;
      menu.items.forEach(mi => {
        const iid = typeof mi === 'string' ? mi : mi.id;
        const qty = typeof mi === 'string' ? 1 : (mi.qty || 1);
        if (!itemMap[iid]) itemMap[iid] = { qty: 0, menus: [] };
        itemMap[iid].qty += qty;
        itemMap[iid].menus.push(menu.name);
      });
    });
    const list = {
      id: uid(),
      name: name.trim(),
      items: Object.entries(itemMap).map(([id, { qty, menus }]) => ({ id, qty, menus, completed: false })),
      menus: menuInfos
    };
    state.lists.push(list);
    this._persist('lists', list.id, { name: list.name, items: list.items });
    return list;
  },
  deleteList(id) {
    state.lists = state.lists.filter(l => l.id !== id);
    this._remove('lists', id);
  },
  addItemToList(listId, itemId) {
    const l = state.lists.find(l => l.id === listId);
    if (!l || l.items.find(i => i.id === itemId)) return;
    l.items.push({ id: itemId, qty: 1, completed: false });
    this._persist('lists', listId, { name: l.name, items: l.items });
  },
  removeFromList(listId, itemId) {
    const l = state.lists.find(l => l.id === listId);
    if (!l) return;
    l.items = l.items.filter(i => i.id !== itemId);
    this._persist('lists', listId, { name: l.name, items: l.items });
  },
  toggleListItem(listId, itemId) {
    const l = state.lists.find(l => l.id === listId);
    if (!l) return;
    const item = l.items.find(i => i.id === itemId);
    if (item) item.completed = !item.completed;
    this._persist('lists', listId, { name: l.name, items: l.items });
  },
  setListItemQty(listId, itemId, qty) {
    const l = state.lists.find(l => l.id === listId);
    if (!l) return;
    const li = l.items.find(i => i.id === itemId);
    if (li) li.qty = Math.max(1, qty);
    this._persist('lists', listId, { name: l.name, items: l.items });
  },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function el(id) { return document.getElementById(id); }
function h(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── UI state ──────────────────────────────────────────────────────────────────

let currentTab = 'items';
let menuDetailId = null;
let menuDetailSelectedOnly = false;
let menuDetailSearch = '';
let menusSearch = '';
let activeListId = null;
let shopShowAddMore = false;
let shopAddMoreSearch = '';
let itemsSort = 'name';
let itemsSearch = '';
let listsShowDates = false;

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(tab) {
  if (tab !== 'menus') { menuDetailId = null; menuDetailSelectedOnly = false; menuDetailSearch = ''; menusSearch = ''; }
  if (tab !== 'shop') { shopShowAddMore = false; shopAddMoreSearch = ''; }
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  render();
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  el('header-left').innerHTML = `<button class="settings-btn" onclick="openSettings()">${iconGear()}</button>`;
  el('header-right').innerHTML = '<button class="header-btn" id="header-action">+</button>';

  if (remoteLoading) {
    el('header-title').textContent = { items:'Items', menus:'Menus', lists:'Lists', shop:'Shop' }[currentTab] || '';
    el('main').innerHTML = `<div class="empty">Connecting to shared storage…</div>`;
    return;
  }

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

// ── Items view ────────────────────────────────────────────────────────────────

function renderItems() {
  let items = [...db.items()];
  if (itemsSearch) {
    const q = itemsSearch.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q) || (i.location||'').toLowerCase().includes(q));
  }
  items.sort(itemsSort === 'location'
    ? (a, b) => (a.location||'').localeCompare(b.location||'') || a.name.localeCompare(b.name)
    : (a, b) => a.name.localeCompare(b.name)
  );

  return `
    <div class="list-controls">
      <input id="items-search" type="search" class="search-input" placeholder="Search…" value="${h(itemsSearch)}"
        oninput="onSearch(v=>itemsSearch=v,'items-search',this.value)" autocorrect="off" spellcheck="false">
      <button class="sort-btn ${itemsSort==='location'?'active':''}"
        onclick="itemsSort=itemsSort==='name'?'location':'name';render()">
        ${itemsSort === 'location' ? 'By location' : 'By name'}
      </button>
    </div>
    ${!items.length
      ? `<div class="empty">${itemsSearch ? 'No matches.' : 'No items yet.<br>Tap + to add your first item.'}</div>`
      : `<div class="card">${items.map(item => `
          <div class="card-item">
            <div class="item-row" onclick="openEditItem('${item.id}')">
              <span class="item-name">${h(item.name)}</span>
              ${item.location ? `<span class="item-loc">${h(item.location)}</span>` : ''}
            </div>
            <button class="btn-icon btn-danger" onclick="confirmDeleteItem('${item.id}')" aria-label="Delete">
              ${iconTrash()}
            </button>
          </div>`).join('')}</div>`}`;
}

function openAddItem() {
  openModal('Add Item', itemForm(), () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    if (!checkDupe(name)) return false;
    db.addItem(name, el('f-loc').value);
    render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function openEditItem(id) {
  const item = db.getItem(id);
  if (!item) return;
  openModal('Edit Item', itemForm(item.name, item.location), () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    const dupe = db.items().find(i => i.id !== id && i.name.toLowerCase() === name.toLowerCase());
    if (dupe && !confirm(`"${dupe.name}" already exists. Save anyway?`)) return false;
    db.updateItem(id, name, el('f-loc').value);
    render(); return true;
  });
}

function confirmDeleteItem(id) {
  const item = db.getItem(id);
  if (item && confirm(`Delete "${item.name}"?`)) { db.deleteItem(id); render(); }
}

// ── Menus view ────────────────────────────────────────────────────────────────

function renderMenus() {
  let menus = [...db.menus()].sort((a, b) => a.name.localeCompare(b.name));
  if (menusSearch) {
    const q = menusSearch.toLowerCase();
    menus = menus.filter(m => m.name.toLowerCase().includes(q));
  }
  return `
    <div class="list-controls">
      <input id="menus-search" type="search" class="search-input" placeholder="Search…" value="${h(menusSearch)}"
        oninput="onSearch(v=>menusSearch=v,'menus-search',this.value)" autocorrect="off" spellcheck="false">
    </div>
    ${!menus.length
      ? `<div class="empty">${menusSearch ? 'No matches.' : 'No menus yet.<br>Tap + to create one.'}</div>`
      : `<div class="card">${menus.map(menu => `
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
          </div>`).join('')}</div>`}`;
}

function openMenuDetail(id) { menuDetailId = id; menuDetailSelectedOnly = false; menuDetailSearch = ''; render(); }
function closeMenuDetail() { menuDetailId = null; menuDetailSelectedOnly = false; menuDetailSearch = ''; render(); }

function renderMenuDetail() {
  const menu = db.getMenu(menuDetailId);
  if (!menu) return '';
  const menuItemsNorm = menu.items.map(mi => typeof mi === 'string' ? { id: mi, qty: 1 } : mi);
  const checkedMap = new Map(menuItemsNorm.map(mi => [mi.id, mi.qty || 1]));
  let items = [...db.items()].sort((a, b) => a.name.localeCompare(b.name));
  if (menuDetailSelectedOnly) items = items.filter(i => checkedMap.has(i.id));
  if (menuDetailSearch) {
    const q = menuDetailSearch.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q));
  }

  const controls = `
    <div class="list-controls" style="margin-bottom:10px">
      <input id="menu-search" type="search" class="search-input" placeholder="Search…" value="${h(menuDetailSearch)}"
        oninput="onSearch(v=>menuDetailSearch=v,'menu-search',this.value)" autocorrect="off" spellcheck="false">
    </div>
    <div class="toggle-row">
      <span class="toggle-label">Selected only</span>
      <button class="toggle ${menuDetailSelectedOnly ? 'on' : ''}" onclick="menuDetailSelectedOnly=!menuDetailSelectedOnly;render()"></button>
    </div>`;

  if (!items.length) return controls + `<div class="empty" style="padding-top:16px">${menuDetailSearch ? 'No matches.' : menuDetailSelectedOnly ? 'No items selected yet.' : 'No items in catalog yet.<br>Tap + to add one.'}</div>`;

  return controls + `<div class="card">${items.map(item => {
    const checked = checkedMap.has(item.id);
    const qty = checkedMap.get(item.id) || 1;
    return `
    <label class="card-item card-check">
      <input type="checkbox" ${checked ? 'checked' : ''}
        onchange="db.toggleMenuItems('${menuDetailId}','${item.id}');render()">
      <div class="item-info" style="cursor:default">
        <div class="item-name">${h(item.name)}</div>
      </div>
      ${checked ? `<div class="qty-stepper">
        <button class="qty-btn" onclick="event.stopPropagation();event.preventDefault();db.setMenuItemQty('${menuDetailId}','${item.id}',${qty - 1});render()" ${qty <= 1 ? 'disabled' : ''}>−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="event.stopPropagation();event.preventDefault();db.setMenuItemQty('${menuDetailId}','${item.id}',${qty + 1});render()">+</button>
      </div>` : ''}
    </label>`;
  }).join('')}</div>`;
}

function openAddItemFromMenu() {
  openModal('Add Item', itemForm(), () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    if (!checkDupe(name)) return false;
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

// ── Lists view ────────────────────────────────────────────────────────────────

function formatMenuDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${day} ${date}`;
}

function renderLists() {
  const lists = db.lists();
  const toggle = `
    <div class="toggle-row" style="margin-bottom:12px">
      <span class="toggle-label">Show menu dates</span>
      <button class="toggle ${listsShowDates ? 'on' : ''}" onclick="listsShowDates=!listsShowDates;render()"></button>
    </div>`;
  if (!lists.length) return toggle + `<div class="empty">No lists yet.<br>Tap + to build one from your menus.</div>`;
  return toggle + `<div class="card">${lists.map(list => {
    const done = list.items.filter(i => i.completed).length;
    const menuDisplay = listsShowDates
      ? [...(list.menus || [])].sort((a, b) => {
          if (!a.date && !b.date) return a.name.localeCompare(b.name);
          if (!a.date) return 1; if (!b.date) return -1;
          return a.date.localeCompare(b.date);
        })
      : [];
    return `
    <div class="card-item" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="item-info" onclick="startShopping('${list.id}')">
          <div class="item-name">${h(list.name)}</div>
          <div class="item-sub">${list.items.length} item${list.items.length !== 1 ? 's' : ''}${done ? ' · ' + done + ' done' : ''}</div>
        </div>
        <button class="btn-text" onclick="startShopping('${list.id}')">Shop</button>
        <button class="btn-icon btn-danger" onclick="confirmDeleteList('${list.id}')" aria-label="Delete">
          ${iconTrash()}
        </button>
      </div>
      ${menuDisplay.length ? `<div class="menu-dates-list">${menuDisplay.map(m => `
        <div class="menu-date-item">
          ${m.date ? `<span class="menu-date-label">${formatMenuDate(m.date)}</span>` : '<span class="menu-date-label menu-date-none">No date</span>'}
          <span>${h(m.name)}</span>
        </div>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function startShopping(listId) { activeListId = listId; shopShowAddMore = false; navigate('shop'); }

function openNewList() {
  const menus = [...db.menus()].sort((a, b) => a.name.localeCompare(b.name));
  if (!menus.length) { alert('Create some menus first.'); return; }
  openModal('New List', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" placeholder="e.g. This Week" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Include Menus</label>
      <input type="search" class="search-input" placeholder="Search menus…" style="margin-bottom:8px"
        oninput="onMenuListSearch(this.value)" autocorrect="off" spellcheck="false">
      <div class="check-list">${menus.map(m => `
        <div class="menu-select-item" data-name="${h(m.name).toLowerCase()}">
          <label class="check-list-item">
            <input type="checkbox" name="menus" value="${m.id}" onchange="onMenuToggle(this,'${m.id}')">
            <span>${h(m.name)}</span>
            <small>${m.items.length} items</small>
          </label>
          <div id="menu-date-${m.id}" class="menu-date-picker" style="display:none">
            <label class="form-label" style="margin-bottom:4px">Date for this menu</label>
            <input type="date" class="form-input" id="mdate-${m.id}" style="font-size:15px">
          </div>
        </div>
      `).join('')}</div>
    </div>
  `, () => {
    const name = el('f-name').value.trim();
    if (!name) { el('f-name').focus(); return false; }
    const checked = [...document.querySelectorAll('input[name="menus"]:checked')];
    if (!checked.length) { alert('Select at least one menu.'); return false; }
    const menuIds = checked.map(i => i.value);
    const menuInfos = checked.map(i => ({
      id: i.value,
      name: state.menus.find(m => m.id === i.value)?.name || '',
      date: document.getElementById('mdate-' + i.value)?.value || ''
    }));
    db.createList(name, menuIds, menuInfos); render(); return true;
  });
  setTimeout(() => el('f-name')?.focus(), 80);
}

function onMenuListSearch(value) {
  const q = value.toLowerCase();
  document.querySelectorAll('.menu-select-item').forEach(el => {
    el.style.display = (!q || el.dataset.name.includes(q)) ? '' : 'none';
  });
}

function onMenuToggle(cb, menuId) {
  const row = document.getElementById('menu-date-' + menuId);
  if (row) row.style.display = cb.checked ? '' : 'none';
}

function confirmDeleteList(id) {
  const list = db.getList(id);
  if (list && confirm(`Delete "${list.name}"?`)) {
    if (activeListId === id) activeListId = null;
    db.deleteList(id); render();
  }
}

// ── Shop view ─────────────────────────────────────────────────────────────────

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
    .map(li => {
      const item = allItems.find(i => i.id === li.id);
      return item ? { ...item, completed: li.completed, qty: li.qty || li.count || 1, menus: li.menus || [] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name));

  const done = listItems.filter(i => i.completed).length;

  const grouped = {};
  listItems.forEach(item => {
    const loc = item.location || 'Other';
    if (!grouped[loc]) grouped[loc] = [];
    grouped[loc].push(item);
  });

  return `
    <div class="shop-bar">
      <div class="shop-bar-name">${h(list.name)}</div>
      <div class="shop-bar-progress">${done}/${listItems.length}</div>
    </div>
    ${listItems.length ? Object.entries(grouped).map(([loc, items]) => `
      <div class="loc-label">${h(loc)}</div>
      <div class="card">${items.map(item => `
        <div class="card-item shop-item ${item.completed ? 'done' : ''}">
          <label class="shop-check">
            <input type="checkbox" ${item.completed ? 'checked' : ''}
              onchange="db.toggleListItem('${activeListId}','${item.id}');render()">
          </label>
          <div class="item-info" style="cursor:default">
            <div class="item-name">${h(item.name)}</div>
            ${item.menus.length ? `<div class="item-menus">${h(item.menus.join(' · '))}</div>` : ''}
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" onclick="db.setListItemQty('${activeListId}','${item.id}',${item.qty - 1});render()" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="db.setListItemQty('${activeListId}','${item.id}',${item.qty + 1});render()">+</button>
          </div>
          <button class="btn-icon btn-danger" onclick="db.removeFromList('${activeListId}','${item.id}');render()" aria-label="Remove">
            ${iconX()}
          </button>
        </div>
      `).join('')}</div>
    `).join('') : '<div class="empty">List is empty.</div>'}
    ${renderAddToShop()}
  `;
}

function renderAddToShop() {
  const list = db.getList(activeListId);
  if (!list) return '';
  const inList = new Set(list.items.map(i => i.id));
  let available = db.items().filter(i => !inList.has(i.id));
  if (!available.length) return '';

  if (shopShowAddMore && shopAddMoreSearch) {
    const q = shopAddMoreSearch.toLowerCase();
    available = available.filter(i => i.name.toLowerCase().includes(q));
  }
  available.sort((a,b) => a.name.localeCompare(b.name));

  return `
    <div class="toggle-row" style="margin-top:24px">
      <span class="toggle-label">Add more items</span>
      <button class="toggle ${shopShowAddMore ? 'on' : ''}" onclick="shopShowAddMore=!shopShowAddMore;shopAddMoreSearch='';render()"></button>
    </div>
    ${shopShowAddMore ? `
      <div class="list-controls" style="margin-bottom:10px">
        <input id="shop-search" type="search" class="search-input" placeholder="Search…" value="${h(shopAddMoreSearch)}"
          oninput="onSearch(v=>shopAddMoreSearch=v,'shop-search',this.value)" autocorrect="off" spellcheck="false">
      </div>
      <div class="card">${available.map(item => `
        <div class="card-item">
          <div class="item-info" style="cursor:default">
            <div class="item-name">${h(item.name)}</div>
          </div>
          <button class="btn-text" onclick="db.addItemToList('${activeListId}','${item.id}');render()">Add</button>
        </div>
      `).join('')}</div>` : ''}
  `;
}

// ── Export / Import ───────────────────────────────────────────────────────────

async function exportData() {
  const data = JSON.stringify({ items: state.items, menus: state.menus, lists: state.lists }, null, 2);
  const file = new File([data], 'shopping-backup.json', { type: 'application/json' });
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Shopping Backup' });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'shopping-backup.json'; a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.items) || !Array.isArray(data.menus) || !Array.isArray(data.lists))
          throw new Error();
        if (!confirm(`Import ${data.items.length} items, ${data.menus.length} menus, ${data.lists.length} lists?\n\nThis replaces all current data.`)) return;
        state.items = data.items; state.menus = data.menus; state.lists = data.lists;
        saveLocal();
        closeModal();
        render();
      } catch { alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── Settings ──────────────────────────────────────────────────────────────────

function openSettings() {
  const configured = firebaseConfigured();
  openModal('Settings', `
    <div class="form-group">
      <label class="form-label">Data Storage</label>
      <div class="check-list">
        <label class="check-list-item">
          <input type="radio" name="mode" value="local" ${!useRemote ? 'checked' : ''}>
          <span>Local</span>
          <small>This device only</small>
        </label>
        <label class="check-list-item" ${!configured ? 'style="opacity:0.45"' : ''}>
          <input type="radio" name="mode" value="remote" ${useRemote ? 'checked' : ''} ${!configured ? 'disabled' : ''}>
          <span>Shared</span>
          <small>${configured ? 'Syncs across devices via Firebase' : 'Requires firebase-config.js'}</small>
        </label>
      </div>
    </div>
    ${!configured ? `<p class="settings-note">To enable shared storage, create a free Firebase project and update <strong>firebase-config.js</strong> with your project credentials.</p>` : ''}
    <div class="form-group" style="margin-top:20px">
      <label class="form-label">Data</label>
      <div class="check-list">
        <div class="check-list-item" onclick="exportData()" style="cursor:pointer">
          <span>Export backup</span>
          <small>Save JSON file</small>
        </div>
        <div class="check-list-item" onclick="importData()" style="cursor:pointer">
          <span>Import backup</span>
          <small>Restore from JSON file</small>
        </div>
      </div>
    </div>
    <p class="settings-version">${VERSION}</p>
  `, () => {
    const selected = document.querySelector('input[name="mode"]:checked')?.value;
    const wantRemote = selected === 'remote';
    if (wantRemote === useRemote) return true;

    if (wantRemote) {
      if (!configured) { alert('Firebase not configured.'); return false; }
      if (!confirm('Switch to shared data?\n\nYour local data stays on this device — it won\'t be copied to Firebase.')) return false;
      state = { items: [], menus: [], lists: [] };
      remoteLoading = true;
      switchToRemote().then(ok => {
        if (!ok) {
          remoteLoading = false;
          useRemote = false;
          localStorage.setItem('dataMode', 'local');
          loadLocal();
          alert('Could not connect to Firebase. Check your config.');
          render();
        }
      });
    } else {
      if (!confirm('Switch to local data?\n\nShared data stays in Firebase and won\'t be affected.')) return false;
      switchToLocal();
    }
    return true;
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

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

function closeModal() { el('modal').close(); _saveHandler = null; render(); }

function _doSave() {
  if (_saveHandler && _saveHandler() !== false) closeModal();
}

el('modal').addEventListener('click', e => { if (e.target === el('modal')) closeModal(); });

// ── Item form helpers ─────────────────────────────────────────────────────────

function itemForm(name = '', location = '') {
  return `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="f-name" class="form-input" type="text" value="${h(name)}" placeholder="e.g. Milk" autocapitalize="words">
    </div>
    <div class="form-group">
      <label class="form-label">Aisle</label>
      <input id="f-loc" class="form-input" type="text" inputmode="numeric" value="${h(location)}" placeholder="e.g. 5">
    </div>`;
}

function checkDupe(name) {
  const existing = db.items().find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!existing) return true;
  return confirm(`"${existing.name}" already exists. Add anyway?`);
}

function onSearch(setter, id, value) {
  setter(value);
  render();
  const input = el(id);
  if (input) { input.focus(); try { input.setSelectionRange(value.length, value.length); } catch(e) {} }
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function iconTrash() {
  return `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}
function iconEdit() {
  return `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>`;
}
function iconX() {
  return `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}
function iconGear() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
}

// ── Service worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Auto-reload when a new service worker takes over, so users always get the latest version
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) { reloading = true; window.location.reload(); }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(tab =>
  tab.addEventListener('click', () => navigate(tab.dataset.tab))
);

function hideSplash() {
  const s = document.getElementById('splash');
  if (!s) return;
  s.classList.add('hiding');
  setTimeout(() => s.remove(), 450);
}

if (useRemote && firebaseConfigured()) {
  remoteLoading = true;
  render();
  loadFirebaseScripts()
    .then(() => { if (initFirestoreDb()) startListeners(); else switchToLocal(); })
    .catch(() => switchToLocal());
} else {
  if (useRemote) { useRemote = false; localStorage.setItem('dataMode', 'local'); }
  loadLocal();
  render();
}

setTimeout(hideSplash, 1200);
