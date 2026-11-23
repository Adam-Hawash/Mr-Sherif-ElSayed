#!/usr/bin/env bash
# سكربت تسطيب سيرفر أوراكل كلاود (OCI) — أوبونتو 24.04 على معالج Ampere ARM
# ينفَّذ مرة واحدة على السيرفر الفاضي:  sudo bash scripts/oracle-setup.sh
# بيُسطّب: Node 22 + PM2 + Caddy + فتح الفايروول (ufw و iptables بتوع أوراكل)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "شغّله بـ sudo:  sudo bash scripts/oracle-setup.sh"
  exit 1
fi

echo "== 1) تحديث النظام + الأدوات الأساسية =="
apt-get update -y
apt-get install -y curl git ufw ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "== 2) Node.js 22 (نسخة ARM64 الرسمية) =="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v

echo "== 3) PM2 لتشغيل المنصة دايمًا =="
npm install -g pm2

echo "== 4) Caddy للدومين وشهادة SSL التلقائية =="
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -y && apt-get install -y caddy

echo "== 5) فتح البورتات 80 و443 (ufw + iptables بتوع أوراكل) =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# مهم جدًا: صور أوبونتو في أوراكل جاية بـ iptables بيسد 80 و443 افتراضيًا — لازم نفتحهم يدوي
for PORT in 80 443; do
  iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport "$PORT" -j ACCEPT || true
  RULES=/etc/iptables/rules.v4
  if [ -f "$RULES" ] && ! grep -q -- "--dport $PORT" "$RULES"; then
    sed -i "/--dport 22/a -A INPUT -p tcp -m state --state NEW -m tcp --dport $PORT -j ACCEPT" "$RULES" || true
  fi
done
netfilter-persistent save 2>/dev/null || true

echo ""
echo "===== خلص التسطيب! الخطوات الجاية ====="
echo "1) git clone https://github.com/Adam-Hawash/Mr-Sherif-ElSayed.git && cd Mr-Sherif-ElSayed"
echo "2) اعمل ملف .env بمتغيرات تورسو (TURSO_DATABASE_URL و TURSO_AUTH_TOKEN)"
echo "3) npm install && npm run build"
echo "4) pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
echo "5) حط الدومين في /etc/caddy/Caddyfile ثم:  sudo systemctl reload caddy"
