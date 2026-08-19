aws_region = "eu-west-3"

vpc_name = "my-project-vpc"

vpc_cidr = "10.0.0.0/16"

availability_zones = [
  "eu-west-3a",
  "eu-west-3b"
]

public_subnet_cidrs = [
  "10.0.1.0/24",
  "10.0.2.0/24"
]

# ============================================================
# PROJECT
# ============================================================

project_name = "hrflow-dev"

# ============================================================
# EC2 / K3S
# ============================================================

instance_type = "t4g.large"

key_name = "novatech-k3s-key"

ssh_allowed_cidr = "176.141.164.220/32"

# ============================================================
# RDS POSTGRESQL
# ============================================================

database_name     = "novatech"
database_username = "novatech_admin"
