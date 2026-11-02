# Despliegue en AWS Lightsail

Un solo servidor con Docker: la API (con sus crons y WebSocket) y Caddy como proxy HTTPS.
La base de datos sigue en Supabase.

## 0. Antes de empezar (AWS)

1. Billing → Credits: confirma que el crédito vigente cubre Lightsail y su fecha de vencimiento.
2. AWS Budgets → crea una alerta de presupuesto (por ejemplo, 10 USD) para evitar cargos por olvido.

## 1. Crear la instancia

1. Entra a https://lightsail.aws.amazon.com → **Create instance**.
2. Región cercana a tus usuarios (por ejemplo `us-east-1`).
3. Plataforma **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**.
4. Plan de **2 GB de RAM** (con 1 GB el build de la imagen puede quedarse sin memoria).
5. Ponle un nombre (`skyplan-api`) y crea la instancia.

## 2. IP estática y firewall

1. Networking → **Create static IP**, asóciala a la instancia. Anota la IP.
2. En la pestaña Networking de la instancia → IPv4 Firewall: deja SSH (22) y HTTP (80) y **agrega HTTPS (443)**.

## 3. Instalar Docker

Conéctate con el botón **Connect using SSH** de la consola de Lightsail:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Vuelve a conectarte para que aplique el grupo `docker`.

## 4. Dominio y HTTPS

Caddy pide el certificado solo, pero necesita un nombre que apunte a la IP:

- **Con dominio en Cloudflare:** DNS → registro `A`, nombre `api`, contenido la IP estática, **proxy desactivado (nube gris)** para que Let's Encrypt valide. `DOMAIN=api.tudominio.com`.
- **Sin dominio:** usa `sslip.io`. Si la IP es `203.0.113.7`, `DOMAIN=203-0-113-7.sslip.io`.

## 5. Levantar el backend

```bash
git clone https://github.com/<usuario>/BackendSkyPlan.git && cd BackendSkyPlan
cp .env.example .env
nano .env   # DATABASE_URL, DIRECT_URL, RESEND_API_KEY, MAIL_FROM, DOMAIN, NODE_ENV=production, PORT=3000
docker compose up -d --build
docker compose logs -f api
```

Al arrancar, el contenedor ejecuta `prisma migrate deploy` y luego la API.
Las tablas de catálogo (`State`, `WeatherCondition`) ya están sembradas en la base de Supabase actual.
Si usas una base nueva, ejecútalo una vez: `docker compose exec api node_modules/.bin/prisma db seed`.

## 6. Verificar

```bash
curl https://<DOMAIN>/api/health
# {"status":200,"message":"Servicio operativo","data":{"status":"ok","database":"up"}}
```

Los crons arrancan con el proceso: `activities-auto-cancel` cada 15 min y `visits-weather` cada 6 h.
Confírmalo en `docker compose logs api`.

## 7. Actualizar

```bash
cd BackendSkyPlan && git pull && docker compose up -d --build
```

## 8. Configurar la app

Apunta la URL base de la API a `https://<DOMAIN>/api` y el WebSocket de notificaciones a `https://<DOMAIN>`.

## 9. Apagar al terminar

1. `docker compose down` en el servidor.
2. En Lightsail: elimina la instancia **y la IP estática** (una IP sin asociar genera cargo).
3. Revisa Billing para confirmar que no queda nada activo.

## Notas

- `restart: unless-stopped` reinicia los contenedores tras un reinicio de la instancia.
- Supabase gratis pausa el proyecto tras una semana sin actividad; con los crons activos no debería ocurrir.
