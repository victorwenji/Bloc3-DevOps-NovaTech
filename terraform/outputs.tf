output "instance_id" {
  value = module.ec2.instance_id
}
output "sns_topic_arn" {
  description = "ARN du topic SNS d'alerte (déjà souscrit à ALERT_EMAIL) — réutilisé pour notifier un échec de déploiement CI, en plus de l'alarme CloudWatch StatusCheckFailed existante."
  value       = module.monitoring.sns_topic_arn
}