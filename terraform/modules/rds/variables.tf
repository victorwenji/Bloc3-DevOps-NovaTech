variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

# Au moins 2 subnets dans 2 AZ différentes (contrainte RDS)
variable "subnet_ids" {
  type = list(string)
}

variable "ec2_security_group_id" {
  description = "Security group de l'EC2 k3s : seul autorisé à parler à la base"
  type        = string
}

variable "database_name" {
  type = string
}

variable "database_username" {
  type = string
}

variable "database_password" {
  type      = string
  sensitive = true
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "skip_final_snapshot" {
  description = "true en staging pour pouvoir détruire sans blocage. Passer à false en prod."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  type    = bool
  default = false
}
