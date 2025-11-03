# CloudWatch Logs Insights Queries (Operation Juicebox)

Use these queries after enabling structured JSON logging in the backend. Replace `<LOG_GROUP_NAME>` with your ECS log group when running them.

## Error Rate by Endpoint

```
fields @timestamp, level, msg, http.path
| filter level = 'error'
| stats count(*) as errorCount by bin(5m), http.path
| sort by bin(5m) desc
```

## Screenshot Capture Latency

```
fields @timestamp, metrics.captureDurationMs, http.path
| filter metrics.captureDurationMs is not missing
| stats avg(metrics.captureDurationMs) as p50, pct(metrics.captureDurationMs, 95) as p95 by bin(5m)
| sort by bin(5m) desc
```

## Circuit Breaker Trips

```
fields @timestamp, event, host, cooldownSeconds
| filter event = 'circuit_breaker.opened'
| sort @timestamp desc
| limit 20
```

## Timeouts and Retries

```
fields @timestamp, msg, retry.attempt, retry.maxAttempts, host
| filter msg = 'capture.retry'
| stats max(retry.attempt) as lastAttempt by bin(5m), host
| sort by bin(5m) desc
```


