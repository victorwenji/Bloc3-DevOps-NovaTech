#!/bin/bash
# Script de déploiement — Phase 3 du plan de remédiation : authentification par
# clé SSH à la place du mot de passe en clair, host/target paramétrés par env
# plutôt qu'en dur. Usage :
#   SSH_HOST=hrflow.novatech.io SSH_KEY_PATH=~/.ssh/hrflow_deploy REMOTE_DIR=/var/www/hrflow ./scripts/deploy.sh
set -euo pipefail

SSH_HOST="${SSH_HOST:?SSH_HOST requis (ex. hrflow.novatech.io)}"
SSH_USER="${SSH_USER:-deploy}"
SSH_KEY_PATH="${SSH_KEY_PATH:?SSH_KEY_PATH requis (chemin vers la clé privée, pas de mot de passe)}"
REMOTE_DIR="${REMOTE_DIR:?REMOTE_DIR requis (ex. /var/www/hrflow ou /var/www/hrflow-staging)}"

ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" REMOTE_DIR="$REMOTE_DIR" bash -s << 'REMOTE'
  cd "$REMOTE_DIR" && git pull origin main && npm install --production && pm2 restart all
  echo "Deployed at $(date)" >> /var/log/hrflow-deploys.log
REMOTE
echo "Déployé sur $SSH_HOST:$REMOTE_DIR"
