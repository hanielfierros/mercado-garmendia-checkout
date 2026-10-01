/* Mercado Garmendia — Checkout Web
   Página de confirmación de pedido. No guarda secretos. Usa textContent (anti-XSS). */

(function () {
  "use strict";

  var API_BASE = "https://mercado-garmendia-api-383735597998.us-central1.run.app";
  var ENVIO = 65;
  var WHATSAPP_MG = "525541921509";

  var cartId = null;
  var cartData = null;
  var checkoutToken = null;
  var submitting = false;
  var lastPedido = null;

  var AGENT_URL = "https://mercado-garmendia-agent-383735597998.us-central1.run.app/chat";
  var SESSION_KEY = "mg_chat_session";
  var checkoutUrl = null;
  var chatBusy = false;

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    return "$" + Number(n || 0).toFixed(2);
  }

  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setState(name) {
    ["state-loading", "state-error", "state-chat", "state-checkout", "state-confirmed"].forEach(function (s) {
      if (s === name) show(s); else hide(s);
    });
  }

  /* ---------- Carga del carrito ---------- */

  // Nueva visita sin cart_id/token -> nueva sesión (limpia solo el estado propio de la app).
  function resetSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage no disponible */ }
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage no disponible */ }
    checkoutUrl = null;
  }

  async function loadCart() {
    cartId = getParam("cart_id");
    checkoutToken = getParam("token");
    if (!cartId) {
      resetSession();
      setState("state-chat");
      return;
    }
    setState("state-loading");
    try {
      var resp = await fetch(API_BASE + "/checkout/" + encodeURIComponent(cartId), {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      var data = await resp.json();
      if (!resp.ok || !data.ok) {
        showError("No pudimos encontrar este pedido. Verifica el enlace e inténtalo de nuevo.");
        return;
      }
      cartData = data.data;
      if (!cartData.items || cartData.items.length === 0) {
        showError("Este pedido está vacío.");
        return;
      }
      renderOrder(cartData.items);
      renderTotals();
      setState("state-checkout");
    } catch (err) {
      showError("Ocurrió un error de conexión. Inténtalo de nuevo.");
    }
  }

  function showError(msg) {
    $("error-msg").textContent = msg;
    setState("state-error");
  }

  /* ---------- Render del pedido ---------- */

  function renderOrder(items) {
    var wrap = $("order-items");
    wrap.textContent = "";

    var grouped = {};
    items.forEach(function (it) {
      var key = it.local_id + "|" + it.vendor;
      if (!grouped[key]) grouped[key] = { local_id: it.local_id, vendor: it.vendor, items: [] };
      grouped[key].items.push(it);
    });

    Object.keys(grouped).forEach(function (key) {
      var g = grouped[key];
      wrap.appendChild(el("div", "locale-label", g.vendor + " · " + g.local_id));
      g.items.forEach(function (it) {
        var row = el("div", "order-item");
        var left = el("div");
        left.appendChild(el("div", "name", it.name));
        left.appendChild(el("div", "meta", "x" + it.quantity + " " + (it.unit || "") + " · " + fmt(it.price) + " c/u"));
        row.appendChild(left);
        row.appendChild(el("div", "sub", fmt(it.subtotal)));
        wrap.appendChild(row);
      });
    });
  }

  function renderTotals() {
    var subtotal = cartData.total || 0;
    var delivery = isDelivery() ? ENVIO : 0;
    var total = subtotal + delivery;
    $("subtotal").textContent = fmt(subtotal);
    $("envio").textContent = fmt(delivery);
    $("total").textContent = fmt(total) + " MXN";
    $("envio-line").style.display = delivery ? "flex" : "none";
  }

  function isDelivery() {
    return $("delivery-toggle").checked;
  }

  /* ---------- Notas ---------- */

  function setupNotes() {
    var t = $("notas");
    var c = $("notas-count");
    function update() {
      c.textContent = String(t.value.length);
    }
    t.addEventListener("input", update);
    update();
  }

  /* ---------- Entrega ---------- */

  function setupDelivery() {
    var toggle = $("delivery-toggle");
    var fields = $("delivery-fields");
    toggle.addEventListener("change", function () {
      if (toggle.checked) {
        fields.classList.add("open");
        fields.setAttribute("aria-hidden", "false");
      } else {
        fields.classList.remove("open");
        fields.setAttribute("aria-hidden", "true");
      }
      renderTotals();
    });
  }

  /* ---------- Envío del pedido ---------- */

  function validate() {
    if (isDelivery()) {
      if (!$("direccion").value.trim()) return "Indica la dirección de entrega.";
      if (!$("telefono").value.trim()) return "Indica tu teléfono para la entrega.";
    }
    return null;
  }

  async function submitOrder() {
    if (submitting) return;
    var err = validate();
    if (err) {
      showToast(err);
      return;
    }
    submitting = true;
    var btn = $("submit-btn");
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Enviando…";

    var body = {
      checkout_token: checkoutToken,
      cliente: {
        nombre: $("nombre").value.trim(),
        email: "",
        telefono: isDelivery() ? $("telefono").value.trim() : $("telefono-contacto").value.trim()
      },
      delivery: {
        activo: isDelivery(),
        direccion: isDelivery() ? $("direccion").value.trim() : ""
      },
      notas: $("notas").value.trim()
    };

    try {
      var resp = await fetch(API_BASE + "/checkout/" + encodeURIComponent(cartId) + "/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
      var data = await resp.json();
      if (!resp.ok || !data.ok) {
        var msg = (data.error && data.error.message) || "No se pudo crear el pedido.";
        showToast(msg);
        resetButton(btn);
        return;
      }
      renderConfirmation(data.data.pedido);
    } catch (e) {
      showToast("Error de conexión. Inténtalo de nuevo.");
      resetButton(btn);
    }
  }

  function resetButton(btn) {
    submitting = false;
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "HACER PEDIDO";
  }

  function showToast(msg) {
    var t = el("div", "toast", msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  /* ---------- Confirmación ---------- */

  function buildWhatsAppMessage(p) {
    var lines = [];
    lines.push("🛒 MERCADO GARMENDIA");
    lines.push("");
    lines.push("PEDIDO: " + p.numero);
    lines.push("");
    lines.push("Cliente:");
    lines.push(p.cliente.nombre || "-");
    if (p.cliente.email) {
      lines.push("");
      lines.push("Email:");
      lines.push(p.cliente.email);
    }
    lines.push("");
    lines.push("Modalidad:");
    lines.push(p.modalidad);
    if (p.notas) {
      lines.push("");
      lines.push("NOTAS:");
      lines.push(p.notas);
    }
    lines.push("");
    lines.push("───────────────");

    var grouped = {};
    p.productos.forEach(function (it) {
      var key = it.local_id + "|" + it.vendor;
      if (!grouped[key]) grouped[key] = { vendor: it.vendor, local_id: it.local_id, items: [] };
      grouped[key].items.push(it);
    });

    Object.keys(grouped).forEach(function (key) {
      var g = grouped[key];
      lines.push("");
      lines.push("LOCAL: " + g.vendor + " / " + g.local_id);
      lines.push("");
      g.items.forEach(function (it) {
        lines.push("• " + it.name);
        lines.push(it.cantidad + " " + (it.unidad || ""));
        lines.push(fmt(it.precio_unitario));
        lines.push(fmt(it.subtotal));
        lines.push("");
      });
      lines.push("───────────────");
    });

    lines.push("");
    lines.push("Subtotal: " + fmt(p.subtotal) + " MXN");
    lines.push("Envío: " + fmt(p.envio) + " MXN");
    lines.push("TOTAL: " + fmt(p.total) + " MXN");
    lines.push("");
    lines.push("Pago:");
    lines.push("EFECTIVO");
    lines.push("");
    lines.push("Pedido:");
    lines.push(p.numero);

    return lines.join("\n");
  }

  function openWhatsApp() {
    if (!lastPedido) return;
    var url = "https://wa.me/" + WHATSAPP_MG + "?text=" + encodeURIComponent(buildWhatsAppMessage(lastPedido));
    window.open(url, "_blank", "noopener");
  }

  function renderConfirmation(p) {
    lastPedido = p;
    $("conf-num").textContent = "Pedido " + p.numero;

    var d = $("conf-details");
    d.textContent = "";

    var grouped = {};
    p.productos.forEach(function (it) {
      var key = it.local_id + "|" + it.vendor;
      if (!grouped[key]) grouped[key] = { vendor: it.vendor, local_id: it.local_id, items: [] };
      grouped[key].items.push(it);
    });

    Object.keys(grouped).forEach(function (key) {
      var g = grouped[key];
      d.appendChild(el("div", "locale-label", g.vendor + " · " + g.local_id));
      g.items.forEach(function (it) {
        var row = el("div", "order-item");
        var left = el("div");
        left.appendChild(el("div", "name", it.name));
        left.appendChild(el("div", "meta", "x" + it.cantidad + " " + (it.unidad || "")));
        row.appendChild(left);
        row.appendChild(el("div", "sub", fmt(it.subtotal)));
        d.appendChild(row);
      });
    });

    if (p.envio) {
      d.appendChild(rowKV("Envío", fmt(p.envio)));
    }
    d.appendChild(rowKV("Total", fmt(p.total) + " " + p.moneda));
    d.appendChild(el("div", "conf-sec", "Modalidad: " + p.modalidad));
    d.appendChild(el("div", "conf-sec", "Forma de pago: " + p.pago));
    if (p.modalidad === "Recoger en local") {
      d.appendChild(el("div", "conf-sec", "Recoge en: " + p.locales.map(function (l) { return l.vendor + " (" + l.local_id + ")"; }).join(", ")));
    }

    setState("state-confirmed");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function rowKV(k, v) {
    var row = el("div", "conf-row");
    row.appendChild(el("span", null, k));
    row.appendChild(el("b", null, v));
    return row;
  }

  /* ---------- Chat de compra ---------- */

  function getSessionId() {
    var sid = null;
    try { sid = localStorage.getItem(SESSION_KEY); } catch (e) { /* storage no disponible */ }
    if (!sid) {
      sid = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : ("s-" + Date.now() + "-" + Math.random().toString(36).slice(2));
      try { localStorage.setItem(SESSION_KEY, sid); } catch (e) { /* storage no disponible */ }
    }
    return sid;
  }

  // Elimina datos técnicos (CART_ID=… / CHECKOUT_URL=…, enlaces Markdown, URLs, cart_id y tokens)
  // antes de mostrar la respuesta. Nunca se pinta checkout_url como texto.
  function cleanReply(text) {
    var t = String(text || "");

    // 1. Líneas técnicas CART_ID= / CHECKOUT_URL=
    t = t.split("\n").filter(function (line) {
      return !/^\s*(CART_ID|CHECKOUT_URL)=/.test(line);
    }).join("\n");

    // 2. Enlaces Markdown [texto](url) -> se eliminan por completo (nunca renderizar links)
    t = t.replace(/\[[^\]]*\]\([^)\s]+\)/g, "");

    // 3. URLs desnudas HTTP/HTTPS (incluye ?cart_id=...&token=...)
    t = t.replace(/https?:\/\/[^\s"'<>)\]]+/g, "");

    // 4. cart_id y token visibles
    t = t.replace(/MG-CART-[a-f0-9]{32}/g, "");
    t = t.replace(/\btoken=[A-Za-z0-9_\-]{16,}/g, "");

    // 5. Limpieza de espacios y líneas vacías
    t = t.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

    return t;
  }

  // Renderizado seguro de Markdown (negritas, títulos, listas) solo con DOM/textContent.
  function addInlineText(parent, text) {
    var parts = String(text).split("**");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "") continue;
      if (i % 2 === 1) {
        parent.appendChild(el("strong", null, parts[i]));
      } else {
        parent.appendChild(document.createTextNode(parts[i]));
      }
    }
  }

  function renderMarkdown(container, text) {
    container.textContent = "";
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var list = null;

    function flushList() {
      if (list) { container.appendChild(list); list = null; }
    }

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t === "") { flushList(); continue; }

      var h = t.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        flushList();
        var hnode = el(h[1].length <= 1 ? "h3" : "h4", "chat-h", null);
        addInlineText(hnode, h[2]);
        container.appendChild(hnode);
        continue;
      }

      var ul = t.match(/^[-*•]\s+(.*)$/);
      if (ul) {
        if (!list || list.tagName !== "UL") { flushList(); list = el("ul", "chat-list"); }
        var li = el("li", null, null);
        addInlineText(li, ul[1]);
        list.appendChild(li);
        continue;
      }

      var ol = t.match(/^\d+[.)]\s+(.*)$/);
      if (ol) {
        if (!list || list.tagName !== "OL") { flushList(); list = el("ol", "chat-list"); }
        var li2 = el("li", null, null);
        addInlineText(li2, ol[1]);
        list.appendChild(li2);
        continue;
      }

      flushList();
      var p = el("p", "chat-p", null);
      addInlineText(p, t);
      container.appendChild(p);
    }
    flushList();
  }

  function setupChat() {
    var messages = $("chat-messages");
    var input = $("chat-input");
    var sendBtn = $("chat-send");
    var checkoutBtn = $("chat-checkout");
    var orderBtn = $("chat-order");
    var loading = $("chat-loading");
    var orderRequested = false;

    function addBubble(text, who) {
      var bubble = el("div", "chat-msg " + (who === "user" ? "user" : "agent"));
      if (who === "user") {
        bubble.textContent = text;
      } else {
        renderMarkdown(bubble, text);
      }
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function setBusy(v) {
      chatBusy = v;
      sendBtn.disabled = v;
      input.disabled = v;
      loading.classList.toggle("hidden", !v);
    }

    async function send(predefinedMsg) {
      var msg = (typeof predefinedMsg === "string") ? predefinedMsg : input.value.trim();
      if (!msg || chatBusy) return;
      input.value = "";
      addBubble(msg, "user");
      setBusy(true);
      try {
        var resp = await fetch(AGENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ message: msg, session_id: getSessionId() })
        });
        var data = await resp.json();
        var reply = (data && data.reply) ? cleanReply(data.reply) : "No pude procesar tu mensaje. Inténtalo de nuevo.";
        if (data && data.cart_id) {
          orderBtn.classList.remove("hidden");
          if (!orderRequested) {
            orderBtn.classList.add("btn-pulse");
          }
        }
        if (data && data.checkout_url) {
          checkoutUrl = data.checkout_url;
          checkoutBtn.classList.remove("hidden");
          checkoutBtn.classList.add("btn-pulse");
          // Si tras limpiar el enlace el texto quedó vacío, mostrar mensaje amigable.
          if (!reply) reply = "¡Listo! , ya puedes IR A PAGAR";
        }
        addBubble(reply, "agent");
      } catch (e) {
        addBubble("Error de conexión. Inténtalo de nuevo.", "agent");
      } finally {
        setBusy(false);
      }
    }

    sendBtn.addEventListener("click", function () { send(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); send(); }
    });
    orderBtn.addEventListener("click", function () {
      orderRequested = true;
      orderBtn.classList.remove("btn-pulse");
      send("Prepara mi pedido, muéstrame el resumen completo de mi carrito y genera el enlace de pago.");
    });
    checkoutBtn.addEventListener("click", function () {
      checkoutBtn.classList.remove("btn-pulse");
      if (checkoutUrl) { window.location.href = checkoutUrl; }
    });

    addBubble("Hola. ¿Qué deseas comprar en Mercado Garmendia?", "agent");
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    setupNotes();
    setupDelivery();
    setupChat();
    $("submit-btn").addEventListener("click", submitOrder);
    $("whatsapp-btn").addEventListener("click", openWhatsApp);
    loadCart();
  });
})();
