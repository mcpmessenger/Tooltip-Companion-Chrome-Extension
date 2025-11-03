# Operation Juicebox Infrastructure Scaffolding

This directory contains infrastructure-as-code (IaC) scaffolding and operational runbooks that support Operation Juicebox.

## Contents

- `cloudwatch-alarms.yml` — CloudFormation snippet for ECS health, CPU, memory, and 5XX alarms
- `log-metrics-queries.md` — Sample CloudWatch Logs Insights queries for structured JSON logs
- `ecs-capacity-checklist.md` — Checklist for reviewing task sizing and scaling policies

## Usage

1. Copy the templates into your infrastructure repository (or import this repo as a submodule).
2. Fill in the placeholder parameters (marked with `TODO`) before deployment.
3. Apply via CloudFormation or translate into Terraform as needed.

> **Note:** These files are scaffolding only. They do not make changes until you deploy them in your AWS account.


