variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

# L'ALB a besoin d'au moins 2 subnets dans 2 AZ différentes
variable "subnet_ids" {
  type = list(string)
}

variable "instance_id" {
  description = "Instance EC2 k3s ciblée par l'ALB (Traefik écoute en hostNetwork sur le port 80)"
  type        = string
}

variable "target_port" {
  type    = number
  default = 80
}

variable "health_check_path" {
  type    = string
  default = "/"
}

variable "certificate_arn" {
  description = "ARN d'un certificat ACM. Laisser vide tant qu'il n'y a pas de nom de domaine : l'ALB reste en HTTP seul."
  type        = string
  default     = ""
}
