aws_region = "eu-central-1"
vpc_name   = "my-project-vpc-staging"
vpc_cidr   = "10.0.0.0/16"
availability_zones = [
  "eu-central-1a",
  "eu-central-1b",
]

public_subnet_cidrs = [
   "10.0.1.0/24",
  "10.0.2.0/24"
]

# ============================================================
# PROJECT
# ============================================================
project_name = "my-project"

# ============================================================
# EC2 / K3S
# ============================================================
instance_type    = "t4g.large"
key_name         = "novatech-k3s-key"
ssh_allowed_cidr = "92.217.80.233/32"

# ============================================================
# RDS POSTGRESQL
# ============================================================
database_name      = "novatech"
database_username  = "novatech_admin"
rds_instance_class = "db.t4g.micro"

# ============================================================
# ALB
# ============================================================
# Laisser vide tant que vous n'avez pas de nom de domaine + certificat ACM.
# Une fois le domaine prêt : certificate_arn = "arn:aws:acm:eu-west-3:...:certificate/..."
certificate_arn = ""
