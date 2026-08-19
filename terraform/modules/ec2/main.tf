# ============================================================
# NOVATECH - EC2 K3S SERVER
# Ubuntu 24.04 ARM64
# ============================================================

# ============================================================
# DATA - UBUNTU 24.04 ARM64
# ============================================================
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# ============================================================
# IAM - SSM
# ============================================================

resource "aws_iam_role" "k3s_ssm" {
  name = "${var.project_name}-k3s-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "ec2.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-k3s-ssm-role"
  }
}

resource "aws_iam_role_policy_attachment" "k3s_ssm" {
  role       = aws_iam_role.k3s_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "k3s" {
  name = "${var.project_name}-k3s-instance-profile"
  role = aws_iam_role.k3s_ssm.name

  tags = {
    Name = "${var.project_name}-k3s-instance-profile"
  }
}

# ============================================================
# SECURITY GROUP
# ============================================================
resource "aws_security_group" "k3s" {
  name        = "${var.project_name}-k3s-sg"
  description = "Security Group for K3s EC2"
  vpc_id      = var.vpc_id

  # Outbound
  egress {
    description = "Internet outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-k3s-sg"
  }
}

# Les règles d'ingress sont déclarées en ressources séparées (et non en blocs
# `ingress {}` inline sur l'aws_security_group) car main.tf ajoute par ailleurs
# sa propre règle (alb_to_ec2_http) sur ce même security group. Mélanger les deux
# styles fait perdre à Terraform le contrôle de la liste : le bloc inline se
# comporte comme la liste autoritaire et supprime silencieusement toute règle
# ajoutée par un aws_security_group_rule externe au prochain apply.

resource "aws_security_group_rule" "ssh" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "SSH"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.ssh_allowed_cidr]
}

resource "aws_security_group_rule" "k8s_api" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "Kubernetes API (VPC only)"
  from_port         = 6443
  to_port           = 6443
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"]
}

resource "aws_security_group_rule" "flannel_vxlan" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "K3s Flannel VXLAN (VPC only)"
  from_port         = 8472
  to_port           = 8472
  protocol          = "udp"
  cidr_blocks       = ["10.0.0.0/16"]
}

resource "aws_security_group_rule" "grafana" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "Grafana (NodePort)"
  from_port         = 30000
  to_port           = 30000
  protocol          = "tcp"
  cidr_blocks       = [var.ssh_allowed_cidr]
}

resource "aws_security_group_rule" "prometheus" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "Prometheus (NodePort)"
  from_port         = 30090
  to_port           = 30090
  protocol          = "tcp"
  cidr_blocks       = [var.ssh_allowed_cidr]
}

resource "aws_security_group_rule" "node_exporter" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "Node Exporter (VPC only)"
  from_port         = 9100
  to_port           = 9100
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"]
}

resource "aws_security_group_rule" "kubelet" {
  type              = "ingress"
  security_group_id = aws_security_group.k3s.id
  description       = "Kubelet (VPC only)"
  from_port         = 10250
  to_port           = 10250
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"]
}

# ============================================================
# EC2 - K3S SERVER
# ============================================================
resource "aws_instance" "k3s" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = var.public_subnet_id
  key_name      = var.key_name

  # Par défaut, l'AWS provider ne remplace PAS l'instance quand user_data change
  # (elle ne se réexécute pas non plus sur une instance déjà démarrée) : un
  # correctif dans le script d'installation resterait donc silencieusement sans
  # effet sur l'instance déjà en place tant qu'on ne force pas ce remplacement.
  user_data_replace_on_change = true

  # ----------------------------------------------------------
  # IAM / SSM
  # ----------------------------------------------------------

  iam_instance_profile = aws_iam_instance_profile.k3s.name

  # ----------------------------------------------------------
  # NETWORK
  # ----------------------------------------------------------

  vpc_security_group_ids      = [aws_security_group.k3s.id]
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
    tags = {
      Name = "${var.project_name}-k3s-root"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  user_data = <<-EOF
#!/bin/bash
set -Eeuo pipefail
LOG_FILE="/var/log/novatech-install.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "NOVATECH K3S INSTALLATION"
echo "============================================================"
date
export DEBIAN_FRONTEND=noninteractive

# --- ERROR HANDLER ---
trap 'echo "ERROR at line $LINENO"; journalctl -u k3s --no-pager -n 100 || true' ERR

# --- SYSTEM PREP ---
echo "============================================================"
echo "SYSTEM PREPARATION"
echo "============================================================"
apt-get update -y
apt-get install -y curl ca-certificates apt-transport-https jq unzip socat conntrack iptables bash-completion
echo "System dependencies installed."


# ============================================================
# AWS SSM AGENT
# ============================================================

echo "============================================================"
echo "INSTALLING AWS SSM AGENT"
echo "============================================================"

if ! snap list amazon-ssm-agent >/dev/null 2>&1; then
  snap install amazon-ssm-agent --classic
fi

# Le paquet snap Ubuntu (images cloud 24.04) enregistre l'agent sous ce nom
# d'unité, pas "amazon-ssm-agent.service" (qui n'existe que pour le paquet
# .deb historique). On détecte le vrai nom pour rester robuste si une future
# AMI revient à l'agent packagé en .deb.
SSM_UNIT="snap.amazon-ssm-agent.amazon-ssm-agent.service"
if ! systemctl list-unit-files "$SSM_UNIT" --no-legend 2>/dev/null | grep -q .; then
  SSM_UNIT="amazon-ssm-agent.service"
fi
echo "Unité systemd détectée pour l'agent SSM : $SSM_UNIT"

systemctl enable "$SSM_UNIT"
systemctl restart "$SSM_UNIT"

echo "SSM Agent status:"
systemctl status "$SSM_UNIT" --no-pager || true

# ============================================================
# SWAP
# ============================================================

# --- SWAP ---
echo "============================================================"
echo "CONFIGURING SWAP"
echo "============================================================"
if ! swapon --show | grep -q "/swapfile"; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if ! grep -q "^/swapfile" /etc/fstab; then
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
echo "Swap configured."
free -h

# --- KERNEL / NETWORK ---
echo "============================================================"
echo "CONFIGURING KUBERNETES NETWORKING"
echo "============================================================"
cat > /etc/modules-load.d/k3s.conf <<'MODULES'
overlay
br_netfilter
MODULES
modprobe overlay || true
modprobe br_netfilter || true

cat > /etc/sysctl.d/99-k3s.conf <<'SYSCTL'
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
net.ipv4.ip_forward=1
SYSCTL
sysctl --system

# --- DISABLE UFW ---
if command -v ufw >/dev/null 2>&1; then
  ufw disable || true
fi

# --- HOSTNAME ---
hostnamectl set-hostname "$(hostname)"

# --- INSTALL K3S ---
echo "============================================================"
echo "INSTALLING K3S"
echo "============================================================"
if ! command -v k3s >/dev/null 2>&1; then
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_EXEC="server --write-kubeconfig-mode=644 --disable=traefik" \
    sh -
else
  echo "K3s already installed."
fi
systemctl enable k3s
systemctl restart k3s

# --- KUBECONFIG ---
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# --- WAIT FOR K3S API ---
echo "============================================================"
echo "WAITING FOR K3S API"
echo "============================================================"
K3S_READY=false
for i in $(seq 1 60); do
  if k3s kubectl get nodes >/dev/null 2>&1; then
    echo "K3s API is ready."
    K3S_READY=true
    break
  fi
  echo "Waiting for K3s... attempt $i/60"
  sleep 5
done
if [ "$K3S_READY" != "true" ]; then
  echo "ERROR: K3s API did not become ready."
  systemctl status k3s --no-pager || true
  journalctl -u k3s --no-pager -n 200 || true
  exit 1
fi
k3s kubectl get nodes -o wide

# --- WAIT FOR NODE READY ---
echo "============================================================"
echo "WAITING FOR KUBERNETES NODE"
echo "============================================================"
NODE_READY=false
for i in $(seq 1 60); do
  if k3s kubectl get nodes --no-headers 2>/dev/null | awk '$2 == "Ready" {found=1} END {exit !found}'; then
    echo "Kubernetes node is Ready."
    NODE_READY=true
    break
  fi
  echo "Node not Ready yet... attempt $i/60"
  sleep 5
done
if [ "$NODE_READY" != "true" ]; then
  echo "WARNING: Kubernetes node is not Ready."
  k3s kubectl get nodes -o wide || true
  k3s kubectl describe node || true
fi

# --- KUBECTL FOR UBUNTU ---
echo "============================================================"
echo "CONFIGURING KUBECTL"
echo "============================================================"
mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube
chmod 600 /home/ubuntu/.kube/config
if ! grep -q "KUBECONFIG=/home/ubuntu/.kube/config" /home/ubuntu/.bashrc; then
  echo 'export KUBECONFIG=/home/ubuntu/.kube/config' >> /home/ubuntu/.bashrc
fi
if ! grep -q "alias k=kubectl" /home/ubuntu/.bashrc; then
  echo 'alias k=kubectl' >> /home/ubuntu/.bashrc
fi

# --- INSTALL HELM ---
echo "============================================================"
echo "INSTALLING HELM"
echo "============================================================"
if ! command -v helm >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi
helm version

# --- MONITORING NAMESPACE ---
echo "============================================================"
echo "CREATING MONITORING NAMESPACE"
echo "============================================================"
k3s kubectl create namespace monitoring --dry-run=client -o yaml | k3s kubectl apply -f -

# --- PROMETHEUS HELM REPO ---
echo "============================================================"
echo "CONFIGURING PROMETHEUS HELM REPOSITORY"
echo "============================================================"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo update

# --- DOWNLOAD DASHBOARD 15757 JSON ---
echo "Downloading Grafana dashboard 15757..."
mkdir -p /tmp/dashboards
curl -s https://grafana.com/api/dashboards/15757/revisions/43/download/ -o /tmp/dashboards/15757.json

# --- WRITE CUSTOM HRFLOW DASHBOARD (latence P99, taux d'erreur, CPU/RAM, saturation) ---
echo "Writing HRFlow observability dashboard..."
cat > /tmp/dashboards/hrflow-observability.json <<'JSONEOF'
${file("${path.module}/../../dashboards/hrflow-observability.json")}
JSONEOF

# --- INSTALL KUBE-PROMETHEUS-STACK ---
echo "============================================================"
echo "INSTALLING KUBE-PROMETHEUS-STACK"
echo "============================================================"
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.enabled=true \
  --set prometheus.enabled=true \
  --set alertmanager.enabled=true \
  --set nodeExporter.enabled=true \
  --set kubeStateMetrics.enabled=true \
  --set grafana.service.type=NodePort \
  --set grafana.service.nodePort=30000 \
  --set prometheus.service.type=NodePort \
  --set prometheus.service.nodePort=30090 \
  --set alertmanager.service.type=ClusterIP \
  --set prometheus.prometheusSpec.retention=6h \
  --set prometheus.prometheusSpec.scrapeInterval=30s \
  --set prometheus.prometheusSpec.evaluationInterval=30s \
  --set prometheus.prometheusSpec.resources.requests.cpu=100m \
  --set prometheus.prometheusSpec.resources.requests.memory=256Mi \
  --set prometheus.prometheusSpec.resources.limits.cpu=700m \
  --set prometheus.prometheusSpec.resources.limits.memory=768Mi \
  --set grafana.resources.requests.cpu=100m \
  --set grafana.resources.requests.memory=256Mi \
  --set grafana.resources.limits.cpu=500m \
  --set grafana.resources.limits.memory=768Mi \
  --set alertmanager.alertmanagerSpec.resources.requests.cpu=25m \
  --set alertmanager.alertmanagerSpec.resources.requests.memory=32Mi \
  --set alertmanager.alertmanagerSpec.resources.limits.cpu=100m \
  --set alertmanager.alertmanagerSpec.resources.limits.memory=128Mi \
  --set kubeStateMetrics.resources.requests.cpu=20m \
  --set kubeStateMetrics.resources.requests.memory=32Mi \
  --set kubeStateMetrics.resources.limits.cpu=100m \
  --set kubeStateMetrics.resources.limits.memory=128Mi \
  --set prometheus-node-exporter.resources.requests.cpu=20m \
  --set prometheus-node-exporter.resources.requests.memory=24Mi \
  --set prometheus-node-exporter.resources.limits.cpu=100m \
  --set prometheus-node-exporter.resources.limits.memory=64Mi \
  --wait=false

echo "kube-prometheus-stack installation submitted."

# --- CUSTOM GRAFANA DASHBOARDS CONFIGMAP ---
# grafana.dashboards.<provider>.json ne pose pas le label grafana_dashboard=1 surveillé
# par le sidecar (vérifié dans le chart) : jamais chargé. ConfigMap manuel + label à la place.
echo "Applying custom Grafana dashboards ConfigMap..."
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
k3s kubectl create configmap hrflow-custom-dashboards -n monitoring \
  --from-file=/tmp/dashboards/15757.json \
  --from-file=/tmp/dashboards/hrflow-observability.json \
  --dry-run=client -o yaml \
  | k3s kubectl label --local -f - grafana_dashboard=1 -o yaml \
  | k3s kubectl apply -f -

# --- PODMONITOR TRAEFIK (Traefik arrive plus tard au 1er déploiement CD, 0 pod matché
# au départ, pas une erreur. Label "release" requis par podMonitorSelectorNilUsesHelmValues) ---
echo "Applying Traefik PodMonitor..."
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
cat <<'YAMLEOF' | k3s kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: traefik
  namespace: kube-system
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: traefik
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
      interval: 30s
YAMLEOF

# --- WAIT FOR MONITORING PODS ---
echo "============================================================"
echo "WAITING FOR MONITORING PODS"
echo "============================================================"
sleep 60

# --- MONITORING STATUS ---
echo "============================================================"
echo "MONITORING STATUS"
echo "============================================================"
k3s kubectl get pods -n monitoring -o wide || true
k3s kubectl get svc -n monitoring || true

# --- CREATE MONITORING STATUS SCRIPT ---
echo "============================================================"
echo "CREATING MONITORING STATUS SCRIPT"
echo "============================================================"
cat > /usr/local/bin/novatech-monitoring-status.sh <<'SCRIPT'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo "============================================================"
echo "NOVATECH MONITORING STATUS"
echo "============================================================"
echo
echo "SYSTEM:"
free -h
echo
echo "LOAD:"
uptime
echo
echo "K3s:"
kubectl get nodes -o wide
echo
echo "K3s system pods:"
kubectl get pods -n kube-system -o wide
echo
echo "Monitoring pods:"
kubectl get pods -n monitoring -o wide
echo
echo "Monitoring services:"
kubectl get svc -n monitoring
echo
echo "Deployments:"
kubectl get deployments -n monitoring
echo
echo "StatefulSets:"
kubectl get statefulsets -n monitoring
echo
echo "DaemonSets:"
kubectl get daemonsets -n monitoring
echo
echo "Resource usage:"
kubectl top nodes 2>/dev/null || true
echo
echo "Monitoring resource usage:"
kubectl top pods -n monitoring 2>/dev/null || true
SCRIPT
chmod +x /usr/local/bin/novatech-monitoring-status.sh

# --- INSTALLATION MARKER ---
cat > /home/ubuntu/k3s-installed.txt <<'MARKER'
NOVATECH K3S INSTALLATION

K3s installed successfully.
Helm installed successfully.
kube-prometheus-stack installation submitted.

Grafana:
NodePort 30000 (http://<PUBLIC_IP>:30000)
Prometheus:
NodePort 30090 (http://<PUBLIC_IP>:30090)

Check status:
sudo /usr/local/bin/novatech-monitoring-status.sh

Useful commands:
kubectl get nodes -o wide
kubectl get pods -A
kubectl top nodes
kubectl top pods -A
kubectl get svc -n monitoring
MARKER
chown ubuntu:ubuntu /home/ubuntu/k3s-installed.txt

# --- FINAL STATUS ---
echo "============================================================"
echo "FINAL K3S STATUS"
echo "============================================================"
k3s kubectl get nodes -o wide || true
echo
echo "============================================================"
echo "KUBE-SYSTEM"
echo "============================================================"
k3s kubectl get pods -n kube-system -o wide || true
echo
echo "============================================================"
echo "MONITORING"
echo "============================================================"
k3s kubectl get pods -n monitoring -o wide || true
echo
echo "============================================================"
echo "SERVICES"
echo "============================================================"
k3s kubectl get svc -n monitoring || true
echo
echo "============================================================"
echo "NOVATECH INSTALLATION COMPLETE"
echo "============================================================"
date
EOF

  tags = {
    Name = "${var.project_name}-k3s"
  }
}