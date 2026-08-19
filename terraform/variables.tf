variable "aws_region" {
  description = "AWS region"
  type        = string
}
variable "vpc_name" {
  description = "Name of the VPC"
  type        = string
}
variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
}
variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
}
variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
}

# ============================================================
# EC2
# ============================================================
variable "project_name" {
  description = "Nom du projet"
  type        = string
}
variable "ssh_allowed_cidr" {
  description = "CIDR autorisé pour SSH vers l'EC2"
  type        = string
}
variable "instance_type" {
  description = "Type d'instance EC2"
  type        = string
  default     = "t4g.small"
}
variable "key_name" {
  description = "Nom de la clé SSH AWS"
  type        = string
}

# ============================================================
# RDS
# ============================================================
variable "database_name" {
  description = "Nom de la base PostgreSQL"
  type        = string
  default     = "novatech"
}
variable "database_username" {
  description = "Utilisateur administrateur PostgreSQL"
  type        = string
  default     = "novatech_admin"
}
variable "database_password" {
  description = "Mot de passe administrateur PostgreSQL"
  type        = string
  sensitive   = true
}
variable "rds_instance_class" {
  description = "Classe d'instance RDS"
  type        = string
  default     = "db.t4g.micro"
}

# ============================================================
# ALB
# ============================================================
variable "certificate_arn" {
  description = "ARN du certificat ACM (HTTPS). Laisser vide tant qu'il n'y a pas de nom de domaine."
  type        = string
  default     = ""
}

variable "environment" {
  type    = string
  default = "staging"
}

# ============================================================
# MONITORING
# ============================================================
variable "alert_email" {
  description = "Adresse email recevant les alertes de monitoring (SNS)"
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email doit être une adresse email valide (TF_VAR_alert_email / vars.ALERT_EMAIL est-il bien défini côté GitHub Actions ?)."
  }
}
