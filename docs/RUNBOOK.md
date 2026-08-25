# Runbook — Déploiement, rollback, restauration, incidents

Document issu des Phases 3 et 4 du plan de remédiation (`docs/audit-J1-equipe-entrante.md`), en
réponse directe aux causes racines listées dans `docs/incident-aout-2024.md` : pas de backup
récent, pas de procédure de rollback documentée, aucune alerte automatique.

**Mise à jour** : l'infrastructure est passée d'un déploiement SSH/pm2 sur VM statique à une
infra as code complète (Terraform + K3s sur EC2 + RDS managé). Ce document reflète l'architecture
réellement en place, pas l'ancienne.

## Architecture de déploiement actuelle

- **Infra** : Terraform provisionne VPC, EC2 (K3s mono-nœud, ARM64/Graviton), RDS PostgreSQL, ALB,
  SNS + CloudWatch pour les alertes (`terraform/`, workspaces `staging`/`production`).
- **Accès à l'instance** : via AWS SSM (Session Manager), pas de SSH exposé publiquement pour la
  CI — seul le port 22 est ouvert, restreint à `SSH_ALLOWED_CIDR`, pour un accès humain ponctuel.
- **Orchestration applicative** : K3s (Kubernetes léger). Chaque service (auth, paie, congés,
  recrutement, gateway, frontend, redis) est un Deployment dans le namespace `hrflow-<env>`.
- **Images** : buildées et poussées vers Amazon ECR (une image par service, taguée avec le SHA du
  commit), pas de registre public.
- **Ingress** : Traefik (installé via Helm par la CI) reçoit le trafic depuis l'ALB AWS sur le
  port 80 du nœud, route vers les Services k8s.

## Déploiement normal

Le seul chemin de déploiement supporté est la CI (`.github/workflows/pipeline.yml`), déclenchée
sur tout push :

1. `changes` : détecte si e2e/frontend/services ont changé (optimisation, pas un gate).
2. `codeql` + `security` : analyse statique (CodeQL) et audit (npm audit, OWASP ZAP sur le
   gateway) — en amont du build, pas bloquants pour l'instant (voir TODO plus bas).
3. `build-tests` : tests unitaires/intégration Jest par service (matrice), build frontend, tests
   E2E Playwright contre la stack assemblée par `docker-compose.yml`.
4. `docker` : build multi-service (arm64), scan Trivy (rapport, pas encore bloquant), push vers
   ECR — uniquement sur push à une branche `dev-*` ou `main`.
5. `deploy-staging` (`.github/workflows/deploy.yml`, `environment: staging`) :
   - `terraform apply` sur le workspace `staging` (crée/met à jour VPC, EC2, RDS, ALB...).
   - Attente que l'agent SSM et K3s soient prêts sur l'instance.
   - Récupération du kubeconfig via SSM (tunnel port-forward local vers le port 6443 de
     l'instance — pas d'exposition publique de l'API Kubernetes).
   - Installation/mise à jour de Traefik, ConfigMap/Secret applicatifs, init du schéma DB,
     déploiement de chaque service avec l'image taguée au SHA du commit courant.
6. `deploy-production` : identique, sur le workspace `production`, uniquement si `deploy-staging`
   a réussi et que le push est sur `main`.

Ne jamais déployer manuellement en contournant la CI. Un `terraform apply` ou un `kubectl apply`
lancé à la main en local, sans coordination avec l'équipe, peut entrer en conflit avec un run CI
en cours sur le même state (lock S3) ou sur le même cluster — vécu concrètement pendant le
diagnostic ayant précédé cette mise à jour du runbook (instance dupliquée, state désynchronisé).
**Toujours vérifier qu'aucun run CI n'est actif sur `Actions` avant une manipulation manuelle.**

## Rollback

### Rollback applicatif (un service se comporte mal après déploiement)

Le plus rapide, sans repasser par tout le pipeline :
```bash
# Depuis un poste avec accès kubectl (ou via SSM port-forward comme dans deploy.yml)
kubectl rollout undo deployment/<service> -n hrflow-staging
kubectl rollout status deployment/<service> -n hrflow-staging --timeout=120s
```
K3s garde l'historique des ReplicaSets précédents par défaut ; ça revient à l'image/config d'avant
en quelques secondes, sans repasser par Terraform.

**Rollback propre via Git** (recommandé si le rollback applicatif seul ne suffit pas, ex. si le
schéma DB a aussi changé) : revert le commit fautif et laisser la CI redéployer normalement.
```bash
git revert <sha-du-commit-fautif>
git push origin main
```
Le job `deploy-production` va reconstruire les images depuis ce commit et redéployer — c'est plus
lent (~5-10 min) mais garantit la cohérence code/infra/images.

### Rollback infrastructure (Terraform)

Si un `terraform apply` a cassé quelque chose (mauvaise AZ, type d'instance, etc.), corriger la
config dans `terraform/*.tfvars` ou les modules, committer, et laisser la CI ré-appliquer — ne pas
`terraform destroy` en prod par réflexe. Voir la section state ci-dessous en cas de state
désynchronisé de la réalité AWS.

## État Terraform : diagnostics utiles

- **Lock orphelin** (un run CI annulé en plein `apply` ne relâche pas toujours son lock proprement) :
  ```bash
  terraform force-unlock <LOCK_ID>   # l'ID est donné dans le message d'erreur
  ```
- **State désynchronisé** (une ressource existe dans le state mais plus sur AWS, ou l'inverse) :
  ```bash
  terraform apply -refresh-only -var-file="staging.tfvars"
  ```
  Confirme la mise à jour du state sans toucher à l'infra réelle, puis relancer un `plan` normal.
- **Ne jamais utiliser `-lock=false`** en dehors d'un déblocage ponctuel et volontaire — le
  backend S3 a le vrai locking activé (`use_lockfile = true`), le désactiver expose exactement au
  scénario de state corrompu rencontré pendant la stabilisation de cet environnement.

## Restauration d'une sauvegarde base de données

`scripts/backup-db.sh` et `scripts/restore-db.sh` restent valides tels quels : ils opèrent via
`DATABASE_URL` (donc compatibles RDS, peu importe où ils s'exécutent — poste local avec `psql`
installé, ou pod jetable dans le cluster).

```bash
DATABASE_URL="postgresql://<user>:<password>@<rds_endpoint>/<db_name>" \
  ./scripts/restore-db.sh latest
# ou un fichier précis :
DATABASE_URL="postgresql://..." ./scripts/restore-db.sh /chemin/vers/hrflow-20260723T140000Z.sql.gz
```
`<rds_endpoint>`, `<db_name>` : sorties Terraform (`terraform output rds_endpoint`, `db_name`).

**TODO connu** : contrairement à l'ancienne VM, il n'y a plus d'hôte persistant pour héberger le
cron horaire de `backup-db.sh`. Actuellement aucune sauvegarde automatique n'est en place ; RDS a
les backups automatiques AWS activés par défaut (rétention standard), qui couvrent le besoin
minimal en attendant une CronJob Kubernetes dédiée exécutant ce script.

## Monitoring et alerting

- **Grafana** (`kube-prometheus-stack`, namespace `monitoring`, exposé en NodePort `:30000`) :
  dashboard `HRFlow - Observabilité` avec latence P99 par service, taux d'erreur 5xx, CPU/RAM par
  pod. Identifiants récupérables via :
  ```bash
  kubectl get secret -n monitoring kube-prometheus-stack-grafana \
    -o jsonpath="{.data.admin-password}" | base64 -d
  ```
- **Prometheus** : `:30090`, cible les pods applicatifs et le nœud (node-exporter).
- **Alerting infra** : CloudWatch alarm sur `StatusCheckFailed` de l'instance EC2 → topic SNS →
  email (`ALERT_EMAIL`, variable GitHub). Pas encore de canal Slack/PagerDuty — c'est le principal
  écart avec l'exigence "alerte en moins de 2 minutes sur canal d'équipe partagé" (TODO).
- **Alertmanager** (`kube-prometheus-stack`) : déployé mais pas encore configuré avec de vraies
  règles d'alerte applicatives (latence, taux d'erreur) au-delà des defaults du chart — TODO.

## En cas d'incident (alerte, remontée client, etc.)

1. **Confirmer côté infra** :
   ```bash
   kubectl get pods -n hrflow-staging -o wide     # tous les pods Running ?
   kubectl get nodes                               # le nœud K3s est Ready ?
   curl -sf http://<alb_dns_name>/                 # l'ALB répond ?
   ```
   Si un pod spécifique est en erreur/CrashLoopBackOff mais le reste tourne, le problème est
   localisé à ce service — pas la peine de suspecter une panne totale.
2. **Regarder les logs du service concerné** avant toute action :
   ```bash
   kubectl logs -n hrflow-staging -l app=<service> --tail=100 --all-containers
   ```
3. **Ne pas improviser de correctif ou de migration en prod.** Si la régression vient d'un
   déploiement récent, préférer le rollback (section ci-dessus) à un correctif à chaud.
4. **Vérifier l'état de la base avant de restaurer un backup** — une restauration écrase les
   données plus récentes que le backup choisi.
5. **Documenter pendant l'incident**, pas après : heure de début, ce qui a été tenté, heure de
   résolution.
6. **Après résolution** : vérifier que les actions décidées sont effectivement suivies d'effet.

## Secrets et variables à configurer côté GitHub

⚠️ Point important découvert en pratique : un secret/variable défini au niveau **Environment**
(`Settings → Environments → staging/production`) n'est visible que par les jobs qui déclarent
`environment: staging`/`production` dans le workflow (le job `deploy-k8s` de `deploy.yml`). Les
jobs sans `environment:` déclaré (ex. `docker.yml`) ne lisent que les secrets/variables au niveau
**Repository** (`Settings → Secrets and variables → Actions → Repository secrets`). Certaines
clés doivent donc exister aux **deux** niveaux si elles sont utilisées par les deux types de job
(ex. `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

| Secret (Repository + Environment) | Contenu |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Identifiants IAM utilisés par la CI (ECR, EC2, RDS, IAM, SNS, SSM...) |
| `AWS_REGION` | Région AWS cible (`eu-central-1`) |
| `DB_PASSWORD` | Mot de passe RDS — **caractères ASCII imprimables uniquement, sans `/ @ " ` ou espace** (contrainte RDS, source d'erreurs `ModifyDBInstance` sinon) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secrets de signature JWT |
| `STRIPE_SECRET_KEY` | Clé API Stripe (module paie) |
| `SSH_ALLOWED_CIDR` | IP autorisée en SSH vers l'instance (`ton_ip/32`) — à mettre à jour si l'IP de connexion change |

| Variable (non sensible) | Contenu |
|---|---|
| `ACM_CERTIFICATE_ARN` | Certificat ACM pour l'ALB (HTTPS) |
| `ALERT_EMAIL` | Destinataire des alertes CloudWatch/SNS |
| `CORS_ALLOWED_ORIGINS` | Origines autorisées côté gateway |

**Attention à l'encodage lors de la saisie d'un secret ou d'une clé** : un copier-coller depuis
PowerShell (`> fichier`, `Out-File` sans `-Encoding`) ajoute souvent un BOM UTF-16/UTF-8 invisible,
ce qui casse la validation côté AWS/GitHub sans message d'erreur clair. Toujours écrire ces
fichiers en UTF-8 sans BOM :
```powershell
[System.IO.File]::WriteAllText("chemin", $contenu, (New-Object System.Text.UTF8Encoding $false))
```

## Accès SSH ponctuel à l'instance (debug, hors CI)

```powershell
ssh -i <clé.pem> ubuntu@<ip_publique_instance>
```
L'IP publique change à chaque recréation de l'instance (pas d'Elastic IP configurée actuellement —
TODO si un accès stable est nécessaire) :
```bash
aws ec2 describe-instances --region eu-central-1 --instance-ids <instance_id> \
  --query "Reservations[].Instances[].PublicIpAddress" --output text
```
