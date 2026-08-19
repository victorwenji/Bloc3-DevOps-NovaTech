# modules/monitoring/variables.tf

variable "project_name" {
  type = string
}

variable "instance_id" {
  type = string
}

variable "alert_email" {
  type        = string
  description = "Adresse email recevant les alertes"
}