/* --- Dynamic loader: read productos.json and render sections/products --- */

/* Cart is persisted to localStorage. The in-memory 'cart' is an array of
   { item: {name, priceValue, priceDisplay, image}, qty } objects. */

const CART_STORAGE_KEY = 'mi_app_carrito_v1';
const cart = [];

function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  const m = String(priceStr).match(/([\d,.]+)/);
  return m ? Number(m[1].replace(',', '.')) : 0;
}

/* Fetch text; returns null if unavailable. Tries fetch first, then falls back to XHR for file:// or restricted contexts. */
async function fetchTextWithFallback(path) {
  // Try fetch (works in normal online/HTTP(S) contexts)
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (res.ok) return await res.text();
  } catch (e) {
    // fetch failed (offline, CORS, or file:// restrictions) - continue to XHR fallback
  }

  // Fallback: synchronous-ish XHR to support file:// and some offline dev environments
  try {
    return await new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', path, true);
        xhr.overrideMimeType && xhr.overrideMimeType('text/plain; charset=utf-8');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
              resolve(xhr.responseText);
            } else {
              resolve(null);
            }
          }
        };
        xhr.send();
      } catch (err) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
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
  name.addEventListener('click', () => openCartModal(item));
  left.appendChild(name);

  const price = document.createElement('div');
  price.className = 'offer-price';
  price.textContent = item.priceDisplay;

  li.appendChild(left);
  li.appendChild(price);

  return li;
}

/* Parse the custom productos.json format */
async function loadAndRenderProducts() {
  const container = document.getElementById('menu-container');
  container.innerHTML = '';

  const showError = (msg) => {
    container.innerHTML = `<div class="menu-section"><h2>Error</h2><div>${msg}</div></div>`;
  };

  try {
    const text = await fetchTextWithFallback('./productos.json');
    if (!text) {
      showError('El archivo productos.json no se pudo leer (offline o ruta incorrecta).');
      return;
    }

    const blockMatches = [...text.matchAll(/\{([\s\S]*?)\}/g)].map(m => m[1]);
    if (!blockMatches.length) {
      showError('El archivo productos.json no contiene secciones válidas.');
      return;
    }

    const fragment = document.createDocumentFragment();

    blockMatches.forEach(block => {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      const sLine = lines.find(l => l.startsWith('s:')) || '';
      const sectionName = sLine.replace(/^s:/, '').trim() || 'Sin título';

      const products = lines
        .filter(l => l.startsWith('p:'))
        .map(pl => {
          const parts = pl.replace(/^p:/, '').trim().split('/');
          const namePart  = (parts[0] || '').trim();
          const pricePart = (parts[1] || '').trim();
          const imagePart = (parts[2] || '').trim();
          const priceValue = Number(pricePart) || 0;
          return {
            name: namePart || 'Producto',
            priceValue,
            priceDisplay: `$ ${priceValue.toFixed(2)}`,
            image: imagePart ? `img/${imagePart}` : ''
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
      fragment.appendChild(sectionEl);
    });

    container.appendChild(fragment);
  } catch (err) {
    showError(`Imposible leer productos.json: ${err.message}`);
    console.error(err);
  }
}

loadAndRenderProducts();

/* --- Sidebar cart rendering and controls --- */
const cartSidebar   = document.getElementById('cart-sidebar');
const cartToggle    = document.getElementById('cart-toggle');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotalEl   = document.getElementById('cart-total');
const cartBadge     = document.getElementById('cart-badge');
const orderBtn      = document.getElementById('order-btn');
const cartCloseBtn  = document.getElementById('cart-close-btn');

function openSidebar()  { document.body.classList.add('cart-open');    cartSidebar.setAttribute('aria-hidden', 'false'); }
function closeSidebar() { document.body.classList.remove('cart-open'); cartSidebar.setAttribute('aria-hidden', 'true');  }

cartToggle.addEventListener('click', () => {
  document.body.classList.contains('cart-open') ? closeSidebar() : openSidebar();
});
if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeSidebar);

function formatCurrency(n) {
  return `$ ${Number(n).toFixed(2)}`;
}

/* Update the order button disabled state */
function updateOrderBtn() {
  if (orderBtn) orderBtn.disabled = cart.length === 0;
}

/* Storage helpers */
function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (e) { /* ignore */ }
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    cart.length = 0;
    parsed.forEach(entry => {
      if (entry && entry.item && typeof entry.qty === 'number') {
        cart.push({
          item: {
            name:         String(entry.item.name || 'Producto'),
            priceValue:   Number(entry.item.priceValue) || 0,
            priceDisplay: String(entry.item.priceDisplay || `$ ${(Number(entry.item.priceValue) || 0).toFixed(2)}`),
            image:        String(entry.item.image || '')
          },
          qty: Number(entry.qty)
        });
      }
    });
  } catch (e) { /* ignore */ }
}

function renderCart() {
  cartItemsList.innerHTML = '';

  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  if (cartBadge) {
    cartBadge.textContent = String(totalQty);
    cartBadge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
  }

  updateOrderBtn();

  if (cart.length === 0) {
    const li = document.createElement('li');
    li.className = 'cart-row';
    li.textContent = 'Carrito vacío. Para añadir productos toque el nombre y seleccione la cantidad.';
    cartItemsList.appendChild(li);
    cartTotalEl.textContent = formatCurrency(0);
    saveCartToStorage();
    return;
  }

  const fragment = document.createDocumentFragment();

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
    decr.addEventListener('click', () => {
      if (entry.qty > 1) entry.qty--;
      else cart.splice(idx, 1);
      renderCart();
      saveCartToStorage();
    });

    const val = document.createElement('div');
    val.className = 'qty-val';
    val.textContent = entry.qty;

    const incr = document.createElement('button');
    incr.className = 'qty-btn';
    incr.textContent = '+';
    incr.addEventListener('click', () => {
      entry.qty++;
      renderCart();
      saveCartToStorage();
    });

    qtyWrap.appendChild(decr);
    qtyWrap.appendChild(val);
    qtyWrap.appendChild(incr);

    row.appendChild(left);
    row.appendChild(qtyWrap);
    fragment.appendChild(row);
  });

  cartItemsList.appendChild(fragment);

  const total = cart.reduce((s, c) => s + c.qty * c.item.priceValue, 0);
  cartTotalEl.textContent = formatCurrency(total);

  saveCartToStorage();
}

/* --- Cart modal (add item) --- */
const cartModal       = document.getElementById('cart-modal');
const cartBackdrop    = document.getElementById('cart-backdrop');
const cartClose       = document.getElementById('cart-close');
const cartAddBtn      = document.getElementById('cart-add');
const cartCancel      = document.getElementById('cart-cancel');
const counterDecr     = document.getElementById('counter-decr');
const counterIncr     = document.getElementById('counter-incr');
const counterValueEl  = document.getElementById('counter-value');
const cartItemNameEl  = document.getElementById('cart-item-name');
const imgEl           = document.getElementById('cart-item-image');
const placeholderEl   = document.getElementById('cart-item-image-placeholder');

let currentSelecting  = null;
let currentQty        = 1;
let orderOpenTimeoutId = null;

/* Helper: animate a modal out, then hide it */
function closeModalAnimated(modalEl, callback, duration = 180) {
  modalEl.classList.add('modal-exiting');
  setTimeout(() => {
    modalEl.classList.add('modal-hidden');
    modalEl.classList.remove('modal-exiting');
    modalEl.setAttribute('aria-hidden', 'true');
    if (callback) callback();
  }, duration);
}

function openCartModal(item) {
  currentSelecting = item;
  currentQty = 1;
  counterValueEl.textContent = '1';
  cartItemNameEl.textContent = `${item.name} - ${item.priceDisplay}`;

  if (imgEl && placeholderEl) {
    const hasImage = Boolean(item.image);
    imgEl.src            = hasImage ? item.image : '';
    imgEl.alt            = hasImage ? item.name : '';
    imgEl.style.display  = hasImage ? 'block' : 'none';
    placeholderEl.style.display = hasImage ? 'none' : 'flex';
  }

  cartModal.classList.remove('modal-hidden');
  cartModal.setAttribute('aria-hidden', 'false');
  closeSidebar();
}

function closeCartModal() {
  closeModalAnimated(cartModal, () => {
    currentSelecting = null;
    currentQty = 1;
  });
}

counterDecr.addEventListener('click', () => {
  if (currentQty > 1) currentQty--;
  counterValueEl.textContent = String(currentQty);
});
counterIncr.addEventListener('click', () => {
  currentQty++;
  counterValueEl.textContent = String(currentQty);
});
cartClose.addEventListener('click', closeCartModal);
cartBackdrop.addEventListener('click', closeCartModal);
cartCancel.addEventListener('click', closeCartModal);

cartAddBtn.addEventListener('click', () => {
  if (!currentSelecting) return;
  const existing = cart.find(c => c.item.name === currentSelecting.name && c.item.priceValue === currentSelecting.priceValue);
  if (existing) existing.qty += currentQty;
  else cart.push({ item: currentSelecting, qty: currentQty });
  renderCart();
  saveCartToStorage();
  closeCartModal();
});

/* --- Ordenar (formulario modal) --- */
const orderModal   = document.getElementById('order-modal');
const orderBackdrop = document.getElementById('order-backdrop');
const orderClose   = document.getElementById('order-close');
const orderCancel  = document.getElementById('order-cancel');
const formItems    = document.getElementById('form-items');
const formTotal    = document.getElementById('form-total');
const formDatetime = document.getElementById('form-datetime');

if (orderBtn) orderBtn.disabled = true;

function formatLocalDateTimeForForm(date) {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${d}/${m}/${y} - ${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function openOrderModal() {
  const lines    = cart.map(c => `${c.qty} x ${c.item.name} (${c.item.priceDisplay}) `).join('\n');
  const totalVal = cart.reduce((s, c) => s + c.item.priceValue * c.qty, 0);
  formItems.value = lines;
  formTotal.value = formatCurrency(totalVal);
  if (formDatetime) {
    try { formDatetime.value = formatLocalDateTimeForForm(new Date()); }
    catch (e) { formDatetime.value = ''; }
  }
  orderModal.classList.remove('modal-hidden');
  orderModal.setAttribute('aria-hidden', 'false');
  const nameInput = document.getElementById('cust-name');
  if (nameInput) nameInput.focus();
}

function closeOrderModal() {
  closeModalAnimated(orderModal);
}

if (orderBtn) {
  orderBtn.addEventListener('click', () => {
    closeSidebar();
    if (orderOpenTimeoutId) clearTimeout(orderOpenTimeoutId);
    orderOpenTimeoutId = setTimeout(() => {
      openOrderModal();
      orderOpenTimeoutId = null;
    }, 600);
  });
}
if (orderClose)   orderClose.addEventListener('click', closeOrderModal);
if (orderCancel)  orderCancel.addEventListener('click', closeOrderModal);
if (orderBackdrop) orderBackdrop.addEventListener('click', closeOrderModal);

/* --- Modal de confirmación de envío --- */
const confirmModal  = document.getElementById('confirm-modal');
const confirmYesBtn = document.getElementById('confirm-yes');
const confirmNoBtn  = document.getElementById('confirm-no');
let confirmCountdownId = null;

function openConfirmModal(onConfirm) {
  confirmModal.classList.remove('modal-hidden');
  confirmModal.setAttribute('aria-hidden', 'false');

  // Reset and start countdown
  let secs = 5;
  confirmYesBtn.disabled = true;
  confirmYesBtn.textContent = `Sí (${secs})`;

  confirmCountdownId = setInterval(() => {
    secs--;
    if (secs > 0) {
      confirmYesBtn.textContent = `Sí (${secs})`;
    } else {
      clearInterval(confirmCountdownId);
      confirmYesBtn.disabled = false;
      confirmYesBtn.textContent = 'Sí';
    }
  }, 1000);

  function cleanup() {
    clearInterval(confirmCountdownId);
    confirmYesBtn.removeEventListener('click', handleYes);
    confirmNoBtn.removeEventListener('click', handleNo);
  }

  function handleYes() {
    cleanup();
    closeConfirmModal(() => onConfirm());
  }
  function handleNo() {
    cleanup();
    closeConfirmModal();
  }

  confirmYesBtn.addEventListener('click', handleYes);
  confirmNoBtn.addEventListener('click', handleNo);
}

function closeConfirmModal(callback) {
  confirmModal.classList.add('modal-exiting');
  setTimeout(() => {
    confirmModal.classList.add('modal-hidden');
    confirmModal.classList.remove('modal-exiting');
    confirmModal.setAttribute('aria-hidden', 'true');
    if (callback) callback();
  }, 180);
}


const pedidoForm   = document.getElementById('pedidoForm');
const statusModal  = document.getElementById('status-modal');
const statusText   = document.getElementById('status-text');
let statusTimeoutId = null;

function showStatus(message, isError) {
  if (!statusModal || !statusText) return;
  // Cancel any pending hide
  if (statusTimeoutId) clearTimeout(statusTimeoutId);
  statusModal.classList.remove('status-hidden', 'status-exiting', 'status-success', 'status-error');
  statusText.textContent = message;
  statusModal.classList.add(isError ? 'status-error' : 'status-success');
  statusModal.setAttribute('aria-hidden', 'false');
  // Auto-hide with exit animation
  statusTimeoutId = setTimeout(() => {
    statusModal.classList.add('status-exiting');
    setTimeout(() => {
      statusModal.classList.add('status-hidden');
      statusModal.classList.remove('status-exiting');
      statusModal.setAttribute('aria-hidden', 'true');
    }, 200);
  }, 3000);
}

if (pedidoForm) {
  const submitBtn      = pedidoForm.querySelector('button[type="submit"]');
  const inputName      = document.getElementById('cust-name');
  const inputPhone     = document.getElementById('cust-phone');
  const inputPin       = document.getElementById('cust-pin');
  const inputAddress   = document.getElementById('cust-address');
  const deliveryRadios = Array.from(pedidoForm.querySelectorAll('input[name="Entrega"]'));

  function setSubmitState(enabled) {
    if (submitBtn) submitBtn.disabled = !enabled;
  }

  function updateAddressState() {
    if (!inputAddress) return;
    const domicileSelected = deliveryRadios.some(r => r.checked && r.value === 'Domicilio');
    inputAddress.disabled = !domicileSelected;
    if (!domicileSelected) inputAddress.value = '';
  }

  function validateFormInputs() {
    const nameOk     = inputName    && inputName.value.trim().length > 0;
    const phoneOk    = inputPhone   && inputPhone.value.trim().length > 0;
    const pinOk      = inputPin     && String(inputPin.value).trim().length === 4;
    const deliveryOk = deliveryRadios.some(r => r.checked);
    const domicileSelected = deliveryRadios.some(r => r.checked && r.value === 'Domicilio');
    const addressOk  = !domicileSelected || (inputAddress && inputAddress.value.trim().length > 0);
    setSubmitState(nameOk && phoneOk && pinOk && deliveryOk && addressOk);
  }

  [inputName, inputPhone, inputPin, inputAddress].forEach(el => {
    if (!el) return;
    el.addEventListener('input', validateFormInputs);
    el.addEventListener('change', validateFormInputs);
  });
  deliveryRadios.forEach(r => r.addEventListener('change', () => {
    updateAddressState();
    validateFormInputs();
  }));

  updateAddressState();
  validateFormInputs();

  pedidoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn && submitBtn.disabled) return;

    // Show confirm modal before submitting
    openConfirmModal(async () => {
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Enviar pedido';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
      }

      try {
        const res = await fetch(pedidoForm.action, { method: 'POST', body: new FormData(pedidoForm) });
        if (!res.ok) throw new Error('Respuesta no OK');

        showStatus('Orden enviada con éxito.', false);
        closeOrderModal();
        pedidoForm.reset();
        formItems.value = '';
        formTotal.value = formatCurrency(0);
        cart.length = 0;
        renderCart();
        saveCartToStorage();
      } catch (err) {
        showStatus('Error de envío, revise su conexión e intente de nuevo.', true);
      } finally {
        setTimeout(() => {
          if (submitBtn) {
            submitBtn.textContent = originalBtnText;
            validateFormInputs();
          }
        }, 600);
      }
    });
  });
}

/* Initialize */
loadCartFromStorage();
renderCart();