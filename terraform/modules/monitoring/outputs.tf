output "sns_topic_arn" {
  description = "ARN du topic SNS utilisé pour les alertes de monitoring"
  value       = aws_sns_topic.alerts.arn
}
