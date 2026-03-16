/* --- Dynamic loader: read productos.json and render sections/products --- */

/* Minimal cart and UI glue added: openCartModal, renderCart, sidebar controls, helpers */

/* Cart is now persisted to localStorage. The in-memory 'cart' is an array of
   { item: {name, priceValue, priceDisplay}, qty } objects. */

const CART_STORAGE_KEY = 'mi_app_carrito_v1';
const cart = []; // populated from storage

function parsePrice(priceStr){
  // accept formats like "$ 3.00" or "3" etc.
  if (typeof priceStr === 'number') return priceStr;
  const m = String(priceStr).match(/([\d,.]+)/);
  return m ? Number(m[1].replace(',', '.')) : 0;
}

/* Fetch text with fallback for offline/file:// access:
   - Try fetch first; on failure attempt a synchronous XHR read (some local setups allow this).
   - If both fail, return null so caller can show an error. */
async function fetchTextWithFallback(path){
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (res.ok) return await res.text();
    // fallthrough to XHR attempt
  } catch (e) {
    // continue to XHR fallback
  }

  try {
    // synchronous XHR fallback (may work when serving from file:// in some browsers)
    const xhr = new XMLHttpRequest();
    xhr.open('GET', path, false); // synchronous
    xhr.send(null);
    if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
      return xhr.responseText;
    }
  } catch (e) {
    // final fallback
  }
  return null;
}

/* Helper: create a product list item element */
function createItemNode(item) {
  const li = document.createElement('li');
  li.className = 'offer-item';

  const left = document.createElement('div');
  left.style.flex = '1 1 auto';

  const name = document.createElement('div');
  name.className = 'offer-name';
  name.textContent = item.name;
  left.appendChild(name);

  const price = document.createElement('div');
  price.className = 'offer-price';
  price.textContent = item.priceDisplay;

  li.appendChild(left);
  li.appendChild(price);

  // open modal on click
  name.style.cursor = 'pointer';
  name.addEventListener('click', () => openCartModal(item));

  return li;
}

/* Parse the custom productos.json format:
   - multiple sections enclosed in { ... }
   - inside each section: lines starting with "s:" (section name) and many "p:" (products)
   - product format: "Name/PRICE" where PRICE is an integer (e.g. 3) which will display as "$ 3.00"
*/
async function loadAndRenderProducts() {
  const container = document.getElementById('menu-container');
  container.innerHTML = '';

  try {
    const text = await fetchTextWithFallback('./productos.json');
    if (!text) {
      container.innerHTML = '<div class="menu-section"><h2>No hay secciones</h2><div>El archivo productos.json no se pudo leer (offline o ruta incorrecta).</div></div>';
      return;
    }

    const blockMatches = [...text.matchAll(/\{([\s\S]*?)\}/g)].map(m => m[1]);

    if (!blockMatches.length) {
      container.innerHTML = '<div class="menu-section"><h2>No hay secciones</h2><div>El archivo productos.json no contiene secciones válidas.</div></div>';
      return;
    }

    blockMatches.forEach(block => {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      const sLine = lines.find(l => l.startsWith('s:')) || '';
      const sectionName = sLine.replace(/^s:/, '').trim() || 'Sin título';

      const pLines = lines.filter(l => l.startsWith('p:'));
      const products = pLines.map(pl => {
        const raw = pl.replace(/^p:/, '').trim();
        // Expect format: Nombre/PRECIO/imagen.jpg  (image optional)
        const parts = raw.split('/');
        const namePart = (parts[0] || '').trim();
        const pricePart = (parts[1] || '').trim();
        const imagePart = (parts[2] || '').trim();
        const priceValue = Number(pricePart) || 0;
        // images are located at root/img/<imagen.jpg> per spec
        const imagePath = imagePart ? `img/${imagePart}` : '';
        return {
          name: namePart || 'Producto',
          priceValue,
          priceDisplay: `$ ${priceValue.toFixed(2)}`,
          image: imagePath
        };
      });

      const sectionEl = document.createElement('section');
      sectionEl.className = 'menu-section';
      const h2 = document.createElement('h2');
      h2.textContent = sectionName;
      sectionEl.appendChild(h2);

      const ul = document.createElement('ul');
      ul.className = 'offer-list';

      if (products.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'offer-item';
        emptyLi.textContent = 'Sin productos en esta sección';
        ul.appendChild(emptyLi);
      } else {
        products.forEach(p => ul.appendChild(createItemNode(p)));
      }

      sectionEl.appendChild(ul);
      container.appendChild(sectionEl);
    });
  } catch (err) {
    container.innerHTML = `<div class="menu-section"><h2>Error</h2><div>Imposible leer productos.json: ${err.message}</div></div>`;
    console.error(err);
  }
}

/* Kick off dynamic load */
loadAndRenderProducts();

/* --- Sidebar cart rendering and controls --- */
const cartSidebar = document.getElementById('cart-sidebar');
const cartToggle = document.getElementById('cart-toggle');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotalEl = document.getElementById('cart-total');

function openSidebar(){
  document.body.classList.add('cart-open');
  cartSidebar.setAttribute('aria-hidden','false');
}
function closeSidebar(){
  document.body.classList.remove('cart-open');
  cartSidebar.setAttribute('aria-hidden','true');
}
cartToggle.addEventListener('click', ()=>{
  if (document.body.classList.contains('cart-open')) closeSidebar();
  else openSidebar();
});

function formatCurrency(n){
  return `$ ${Number(n).toFixed(2)}`;
}

const cartBadge = document.getElementById('cart-badge');

/* Storage helpers */
function saveCartToStorage(){
  try {
    const serial = JSON.stringify(cart);
    localStorage.setItem(CART_STORAGE_KEY, serial);
  } catch (e) {
    // ignore storage errors
  }
}
function loadCartFromStorage(){
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    // clear current cart and push items (to keep same reference)
    cart.length = 0;
    parsed.forEach(entry => {
      // basic validation/fallback
      if (entry && entry.item && typeof entry.qty === 'number') {
        cart.push({
          item: {
            name: String(entry.item.name || 'Producto'),
            priceValue: Number(entry.item.priceValue) || 0,
            priceDisplay: String(entry.item.priceDisplay || `$ ${ (Number(entry.item.priceValue) || 0).toFixed(2) }`)
          },
          qty: Number(entry.qty)
        });
      }
    });
  } catch (e) {
    // ignore parse errors
  }
}

function renderCart(){
  cartItemsList.innerHTML = '';

  // compute total quantity for badge
  const totalQty = cart.reduce((s,c)=> s + c.qty, 0);
  if (cartBadge) {
    cartBadge.textContent = String(totalQty);
    cartBadge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
  }

  // Disable/enable the "Ordenar" button based on cart contents (safe-guard if orderBtn not yet present)
  if (typeof orderBtn !== 'undefined' && orderBtn) {
    orderBtn.disabled = cart.length === 0;
  }

  if (cart.length === 0){
    const li = document.createElement('li');
    li.className = 'cart-row';
    li.textContent = 'Carrito vacío. Para añadir productos toque el nombre y seleccione la cantidad.';
    cartItemsList.appendChild(li);
    cartTotalEl.textContent = formatCurrency(0);
    // save empty cart state
    saveCartToStorage();
    return;
  }
  cart.forEach((entry, idx) => {
    const row = document.createElement('li');
    row.className = 'cart-row';

    const left = document.createElement('div');
    left.className = 'cart-row-left';
    const name = document.createElement('div');
    name.className = 'cart-row-name';
    name.textContent = entry.item.name;
    const price = document.createElement('div');
    price.className = 'cart-row-price';
    price.textContent = entry.item.priceDisplay;
    left.appendChild(name);
    left.appendChild(price);

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'cart-qty';
    const decr = document.createElement('button');
    decr.className = 'qty-btn';
    decr.textContent = '-';
    const val = document.createElement('div');
    val.className = 'qty-val';
    val.textContent = entry.qty;
    const incr = document.createElement('button');
    incr.className = 'qty-btn';
    incr.textContent = '+';

    decr.addEventListener('click', ()=>{
      if (entry.qty > 1) entry.qty--;
      else cart.splice(idx,1);
      renderCart();
      saveCartToStorage();
    });
    incr.addEventListener('click', ()=>{
      entry.qty++;
      renderCart();
      saveCartToStorage();
    });

    qtyWrap.appendChild(decr);
    qtyWrap.appendChild(val);
    qtyWrap.appendChild(incr);

    row.appendChild(left);
    row.appendChild(qtyWrap);

    cartItemsList.appendChild(row);
  });

  const total = cart.reduce((s,c)=> s + c.qty * c.item.priceValue, 0);
  cartTotalEl.textContent = formatCurrency(total);

  // Ensure order button is enabled when there are items (in case it wasn't set earlier)
  if (typeof orderBtn !== 'undefined' && orderBtn) {
    orderBtn.disabled = cart.length === 0;
  }

  // persist after rendering changes
  saveCartToStorage();
}

/* --- Cart modal (add item) implementation --- */
const cartModal = document.getElementById('cart-modal');
const cartBackdrop = document.getElementById('cart-backdrop');
const cartClose = document.getElementById('cart-close');
const cartAddBtn = document.getElementById('cart-add');
const cartCancel = document.getElementById('cart-cancel');
const counterDecr = document.getElementById('counter-decr');
const counterIncr = document.getElementById('counter-incr');
const counterValueEl = document.getElementById('counter-value');
const cartItemNameEl = document.getElementById('cart-item-name');

let currentSelecting = null;
let currentQty = 1;
let orderOpenTimeoutId = null;

function openCartModal(item){
  currentSelecting = item;
  currentQty = 1;
  counterValueEl.textContent = String(currentQty);
  cartItemNameEl.textContent = item.name + ' - ' + item.priceDisplay;

  // set image if available
  const imgEl = document.getElementById('cart-item-image');
  const placeholderEl = document.getElementById('cart-item-image-placeholder');
  if (imgEl && placeholderEl) {
    if (item.image) {
      imgEl.src = item.image;
      imgEl.alt = item.name;
      imgEl.style.display = 'block';
      placeholderEl.style.display = 'none';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      placeholderEl.style.display = 'flex';
    }
  }

  cartModal.classList.remove('modal-hidden');
  cartModal.setAttribute('aria-hidden','false');
  // ensure sidebar closed while adding
  closeSidebar();
}
function closeCartModal(){
  cartModal.classList.add('modal-hidden');
  cartModal.setAttribute('aria-hidden','true');
  currentSelecting = null;
  currentQty = 1;
}

counterDecr.addEventListener('click', ()=> {
  if (currentQty > 1) currentQty--;
  counterValueEl.textContent = String(currentQty);
});
counterIncr.addEventListener('click', ()=> {
  currentQty++;
  counterValueEl.textContent = String(currentQty);
});
cartClose.addEventListener('click', closeCartModal);
cartBackdrop.addEventListener('click', closeCartModal);
cartCancel.addEventListener('click', closeCartModal);

cartAddBtn.addEventListener('click', ()=>{
  if (!currentSelecting) return;
  // if item already in cart, increase qty
  const existing = cart.find(c => c.item.name === currentSelecting.name && c.item.priceValue === currentSelecting.priceValue);
  if (existing) existing.qty += currentQty;
  else cart.push({ item: currentSelecting, qty: currentQty });
  renderCart();
  saveCartToStorage();
  closeCartModal();
  // do not open the sidebar automatically when adding an item
});

/* --- Ordenar (abrir modal del formulario) --- */
const orderModal = document.getElementById('order-modal');
const orderBackdrop = document.getElementById('order-backdrop');
const orderClose = document.getElementById('order-close');
const orderCancel = document.getElementById('order-cancel');
const formItems = document.getElementById('form-items');
const formTotal = document.getElementById('form-total');
const formDatetime = document.getElementById('form-datetime');
const orderBtn = document.getElementById('order-btn');
// make sure the button starts disabled if cart is empty
if (orderBtn) orderBtn.disabled = true;

function formatLocalDateTimeForForm(date){
  // D/M/AAAA - h:mm tt  (tt = am/pm)
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const pad = (n) => String(n).padStart(2, '0');

  return `${d}/${m}/${y} - ${hours}:${pad(minutes)} ${ampm}`;
}

function openOrderModal(){
  // rellenar items y total en el formulario (texto no editable)
  const lines = cart.map(c => `${c.qty} x ${c.item.name} (${c.item.priceDisplay}) `).join('\n');
  const totalVal = cart.reduce((s,c)=> s + c.item.priceValue * c.qty, 0);
  formItems.value = lines;
  // format total as currency string like "$ 3.00"
  formTotal.value = formatCurrency(totalVal);

  // set current device date/time in requested format
  if (formDatetime) {
    try {
      formDatetime.value = formatLocalDateTimeForForm(new Date());
    } catch (e) {
      formDatetime.value = '';
    }
  }

  orderModal.classList.remove('modal-hidden');
  orderModal.setAttribute('aria-hidden','false');
  const nameInput = document.getElementById('cust-name');
  if (nameInput) nameInput.focus();
}

function closeOrderModal(){
  orderModal.classList.add('modal-hidden');
  orderModal.setAttribute('aria-hidden','true');
}

if (orderBtn){
  orderBtn.addEventListener('click', ()=>{
    closeSidebar();
    // ensure only one pending open timeout at a time
    if (orderOpenTimeoutId) clearTimeout(orderOpenTimeoutId);
    orderOpenTimeoutId = setTimeout(()=>{
      openOrderModal();
      orderOpenTimeoutId = null;
    }, 600);
  });
}
if (orderClose) orderClose.addEventListener('click', closeOrderModal);
if (orderCancel) orderCancel.addEventListener('click', closeOrderModal);
if (orderBackdrop) orderBackdrop.addEventListener('click', closeOrderModal);

/* --- Envío del formulario sin redirección, con mensajes de estado --- */
const pedidoForm = document.getElementById('pedidoForm');
const statusModal = document.getElementById('status-modal');
const statusText = document.getElementById('status-text');
let statusTimeoutId = null;

function showStatus(message, isError){
  if (!statusModal || !statusText) return;
  statusText.textContent = message;
  statusModal.classList.remove('status-hidden', 'status-success', 'status-error');
  statusModal.classList.add(isError ? 'status-error' : 'status-success');
  statusModal.setAttribute('aria-hidden','false');

  if (statusTimeoutId) clearTimeout(statusTimeoutId);
  statusTimeoutId = setTimeout(()=>{
    statusModal.classList.add('status-hidden');
    statusModal.setAttribute('aria-hidden','true');
  }, 3000);
}

if (pedidoForm) {
  pedidoForm.addEventListener('submit', async (e)=>{
    e.preventDefault();

    const formData = new FormData(pedidoForm);

    try {
      const res = await fetch(pedidoForm.action, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Respuesta no OK');
      }

      showStatus('Orden enviada con éxito.', false);
      closeOrderModal();
      pedidoForm.reset();
      formItems.value = '';
      formTotal.value = formatCurrency(0);
      // clear cart after successful order
      cart.length = 0;
      renderCart();
      saveCartToStorage();
    } catch (err) {
      showStatus('Error de envío, revise su conexion e intente de nuevo.', true);
    }
  });
}

/* Initialize cart UI state */
loadCartFromStorage();
renderCart();