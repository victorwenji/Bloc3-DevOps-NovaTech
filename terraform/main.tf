data "aws_caller_identity" "current" {}
output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

# ============================================================
# BACKEND
# ============================================================
terraform {
  backend "s3" {
    bucket       = "hrflow-terraform-state-079716036671"
    key          = "hrflow/terraform.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }
}

# ============================================================
# NETWORK
# ============================================================
module "network" {
  source = "./modules/network"

  vpc_name            = var.vpc_name
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
}

# ============================================================
# EC2 UBUNTU 24.04 ARM64 + K3S
# ============================================================
module "ec2" {
  source = "./modules/ec2"

  project_name     = var.project_name
  vpc_id           = module.network.vpc_id
  public_subnet_id = module.network.public_subnet_ids[0]
  ssh_allowed_cidr = var.ssh_allowed_cidr
  instance_type    = var.instance_type
  key_name         = var.key_name
}

# ============================================================
# MONITORING (alerte email si l'EC2 k3s ne répond plus)
# ============================================================
module "monitoring" {
  source = "./modules/monitoring"

  project_name = var.project_name
  instance_id  = module.ec2.instance_id
  alert_email  = var.alert_email
}

# ============================================================
# RDS POSTGRESQL
# ============================================================
module "rds" {
  source = "./modules/rds"

  project_name = var.project_name

  vpc_id     = module.network.vpc_id
  subnet_ids = module.network.public_subnet_ids # même subnets que l'EC2, publicly_accessible=false donc pas exposée

  ec2_security_group_id = module.ec2.security_group_id

  database_name     = var.database_name
  database_username = var.database_username
  database_password = var.database_password
  instance_class    = var.rds_instance_class
}

# ============================================================
# APPLICATION LOAD BALANCER
# ============================================================
module "alb" {
  source = "./modules/alb"

  project_name = var.project_name
  vpc_id       = module.network.vpc_id
  subnet_ids   = module.network.public_subnet_ids # >= 2 AZ requis par l'ALB

  instance_id     = module.ec2.instance_id
  target_port     = 80
  certificate_arn = var.certificate_arn
}

# L'EC2 n'accepte le port 80 QUE depuis l'ALB (plus de 0.0.0.0/0 direct sur l'instance)
resource "aws_security_group_rule" "alb_to_ec2_http" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  security_group_id        = module.ec2.security_group_id
  source_security_group_id = module.alb.security_group_id
  description              = "HTTP depuis le load balancer uniquement"
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "rds_address" {
  value = module.rds.address
}

output "db_name" {
  value = module.rds.db_name
}

output "db_username" {
  value = var.database_username
}

output "alb_dns_name" {
  value = module.alb.dns_name
}
