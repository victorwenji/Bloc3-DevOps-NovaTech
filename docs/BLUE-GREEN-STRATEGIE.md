# Stratégie Blue/Green — HRFlow

## État actuel

Le déploiement actuel fonctionne en **rolling update Kubernetes natif** : chaque nouveau
déploiement remplace progressivement les pods de l'ancienne version par la nouvelle, service par
service, avec `readinessProbe` pour ne router le trafic que vers les pods réellement prêts. C'est
déjà un déploiement sans coupure totale, mais ce n'est pas du Blue/Green : les deux versions ne
coexistent jamais complètement isolées, et un rollback nécessite de redéployer l'ancienne image.

## Principe du Blue/Green

Le Blue/Green consiste à maintenir **deux environnements de production identiques** (« Blue » et
« Green »), un seul étant actif (reçoit le trafic réel) à un instant donné :

1. La version actuelle tourne sur **Blue**, reçoit 100% du trafic.
2. La nouvelle version est déployée intégralement sur **Green**, en parallèle, **sans recevoir de
   trafic réel**.
3. Green est validé (health checks, smoke tests, éventuellement tests manuels) pendant qu'il
   tourne isolé.
4. Si Green est sain, le trafic bascule d'un coup de Blue vers Green (au niveau du routeur/load
   balancer/Service).
5. Blue reste disponible, inactif, pendant une période de sécurité — un rollback consiste
   simplement à re-basculer le trafic vers Blue, en quelques secondes, sans rebuild ni redeploy.

## Comment ça s'implémenterait sur cette infra

Sur le cluster K3s actuel, l'implémentation la plus directe consiste à dupliquer chaque
`Deployment` avec un label `version: blue`/`version: green`, et à faire pointer le `Service`
Kubernetes de chaque composant vers l'une des deux couleurs via son `selector` :

```yaml
# Deployment (x2 par service : auth-blue, auth-green)
metadata:
  name: auth-blue
spec:
  selector:
    matchLabels:
      app: auth
      version: blue
---
# Service (un seul par composant, le selector désigne la couleur active)
apiVersion: v1
kind: Service
metadata:
  name: auth
spec:
  selector:
    app: auth
    version: blue   # <- bascule vers "green" ici pour changer le trafic
```

La bascule devient une commande unique et atomique :
```bash
kubectl patch service auth -n hrflow-staging -p '{"spec":{"selector":{"version":"green"}}}'
```

Le pipeline CI déploierait toujours dans la couleur inactive, lancerait un smoke test dessus, puis
ne basculerait le Service que si ce test passe — sinon l'ancienne couleur continue de servir le
trafic sans interruption.

## Avantages

- **Zero-downtime réel** : la bascule est un changement de routage, pas un redéploiement — aucune
  requête n'est perdue pendant la transition.
- **Rollback quasi instantané** : repasser à l'ancienne couleur prend quelques secondes (un
  `kubectl patch`), contre plusieurs minutes pour un rebuild + redeploy avec le rolling update
  actuel.
- **Validation en conditions réelles avant exposition** : la nouvelle version tourne avec la vraie
  configuration/les vraies images en production, mais sans risque, avant de recevoir le moindre
  trafic utilisateur.
- **Élimine les états intermédiaires incohérents** : contrairement au rolling update où anciennes
  et nouvelles instances coexistent brièvement (deux versions de l'API peuvent répondre en même
  temps pendant la transition), Blue/Green garantit qu'à tout instant, 100% du trafic va vers une
  seule version cohérente.

## Inconvénients et pourquoi ce n'est pas encore en place ici

- **Coût en ressources doublé** pendant la fenêtre de validation : les deux couleurs tournent en
  parallèle, ce qui double temporairement la consommation CPU/RAM de chaque service. Sur
  l'instance actuelle (`t4g.large`, mono-nœud, 6 services + stack de monitoring), la marge
  disponible est déjà limitée — on l'a observé concrètement lors des tests de dimensionnement de
  l'instance EC2, où même une seule couleur en `t4g.medium`/`t4g.small` posait des contraintes de
  capacité chez le fournisseur cloud.
- **Complexité opérationnelle accrue** : gérer deux jeux de Deployments, la bascule Service par
  Service, la synchronisation du schéma de base de données entre les deux couleurs (une migration
  de schéma non rétrocompatible casse l'une des deux versions) demande une discipline
  supplémentaire, notamment sur les migrations DB qui doivent être conçues pour être compatibles
  avec l'ancienne ET la nouvelle version pendant la fenêtre de transition.
- **ROI limité à ce stade du projet** : avec une seule instance mono-nœud et un trafic de
  développement/démonstration, le principal bénéfice du Blue/Green (zero-downtime sur un système à
  fort trafic en production) est moins critique que sur un système en production réelle avec des
  utilisateurs actifs en continu.

## Prochaine étape si le projet évolue vers une charge de production réelle

Passer l'instance EC2 à un gabarit plus large (`t4g.xlarge` ou davantage) ou à plusieurs nœuds K3s
lèverait la contrainte de ressources, rendant le Blue/Green pleinement viable sans compromis sur
le dimensionnement des autres services (monitoring compris).
