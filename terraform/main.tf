# Pencil.io Production Infrastructure
# Provider: AWS

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# 1. VPC & Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "pencil-vpc" }
}

# 2. ECS Cluster (The home for our microservices)
resource "aws_ecs_cluster" "production" {
  name = "pencil-production-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# 3. RDS Database (PostgreSQL)
resource "aws_db_instance" "postgres" {
  identifier           = "pencil-db-prod"
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t4g.medium"
  allocated_storage    = 20
  storage_type         = "gp3"
  username             = "pencil_admin"
  password             = var.db_password
  skip_final_snapshot  = true
  publicly_accessible  = false
}

# 4. Redis (ElastiCache)
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "pencil-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
}

variable "db_password" {
  description = "Production Database Password"
  type        = string
  sensitive   = true
}
