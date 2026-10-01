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
    ["state-loading", "state-error", "state-checkout", "state-confirmed"].forEach(function (s) {
      if (s === name) show(s); else hide(s);
    });
  }

  /* ---------- Carga del carrito ---------- */

  async function loadCart() {
    cartId = getParam("cart_id");
    checkoutToken = getParam("token");
    if (!cartId) {
      showError("Falta el identificador del pedido en el enlace.");
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
    var email = $("email").value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Revisa el email.";
    }
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
        email: $("email").value.trim(),
        telefono: isDelivery() ? $("telefono").value.trim() : ""
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

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    setupNotes();
    setupDelivery();
    $("submit-btn").addEventListener("click", submitOrder);
    $("whatsapp-btn").addEventListener("click", openWhatsApp);
    loadCart();
  });
})();
