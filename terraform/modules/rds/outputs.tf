output "endpoint" {
  description = "host:port"
  value       = aws_db_instance.postgres.endpoint
}

output "address" {
  description = "host seul (sans le port)"
  value       = aws_db_instance.postgres.address
}

output "port" {
  value = aws_db_instance.postgres.port
}

output "db_name" {
  value = aws_db_instance.postgres.db_name
}
