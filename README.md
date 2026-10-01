# Mercado Garmendia — Checkout Web

Página de confirmación de pedido (móvil, estilo Apple) para Mercado Garmendia.
Es la pantalla final a la que llega el usuario tras completar la compra en
Google AI Mode / UCP. **No** es una tienda, catálogo ni PWA.

## Qué hace

1. Recibe un `cart_id` por URL (`?cart_id=MG-CART-XXXX`).
2. Consulta el backend y resuelve el carrito real (productos, precios, locales, total).
3. Muestra el pedido, notas (250 car.), entrega a domicilio (+$65 MXN) y el total.
4. Al confirmar, crea el pedido (`MG-XXXXXX`) y muestra la confirmación.

## Backend requerido

- API base (Cloud Run): `https://mercado-garmendia-api-383735597998.us-central1.run.app`
- `GET /checkout/{cart_id}` → resuelve el carrito (público, token no adivinable).
- `POST /checkout/{cart_id}/pedido` → crea el pedido y envía emails.

El frontend **no** envía precios ni totales; el backend es la única autoridad.

## Ejecutar localmente

```bash
cd "PWA CHECKOUT"
python -m http.server 8080
# Abrir http://localhost:8080/?cart_id=MG-CART-XXXX
```

> Para generar un `cart_id` real, usa la API:
> `POST https://mercado-garmendia-api-383735597998.us-central1.run.app/carrito`
> (requiere `Authorization: Bearer <MG_API_TOKEN>`).

## Publicar en GitHub Pages

1. Sube esta carpeta a un repositorio de GitHub (los 4 archivos en la raíz).
2. En el repositorio: **Settings → Pages → Branch: `main` → Save**.
3. La página quedará en `https://<usuario>.github.io/<repositorio>/`.

> El backend debe permitir el origen de GitHub Pages en `MG_ALLOWED_ORIGINS`
> (actualmente configurado con `*` para desarrollo). Tras publicar, cámbialo a
> `MG_ALLOWED_ORIGINS=https://USUARIO.github.io` o al origen exacto del checkout.

## Seguridad

- Sin API keys ni secretos en el código.
- Sin precios/totales como autoridad del cliente.
- Anti-XSS (usa `textContent`).
- Protección de doble envío.

## Limitación (MVP)

**Cloud Run cart state is in-memory.** En un despliegue multi-instancia de
producción, el carrito y el pedido requieren almacenamiento persistente
(carrito/orden). No se implementa una base de datos en esta etapa.

## Flujo de pedido

`HACER PEDIDO` → crea el pedido (`MG-XXXXXX`) → pantalla de confirmación →
botón **"Enviar pedido por WhatsApp"** abre `wa.me/525541921509` con el mensaje
prearmado (el usuario pulsa manualmente «Enviar»). No se usa WhatsApp Business
API ni pagos online.
