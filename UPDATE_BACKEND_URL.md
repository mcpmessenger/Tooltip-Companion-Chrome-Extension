# ⚠️ Backend IP Address Changed

## New Backend URL

The ECS task restarted and received a **new IP address**:

**Old IP (no longer valid):**
- ~~http://34.238.170.86:3000~~

**New IP (current):**
```
http://3.84.194.78:3000
```

## Update Extension Settings

If the extension is using the old IP, update it:

1. Open Chrome → `chrome://extensions/`
2. Find "Tooltip Companion"
3. Click "Options"
4. Update "Backend URL" to: `http://3.84.194.78:3000`
5. Click "Save Settings"

## Test Backend

```powershell
# Test health endpoint
Invoke-RestMethod -Uri "http://3.84.194.78:3000/health" -Method GET

# Should return:
# {"status":"healthy","browser":"initialized",...}
```

## Note

**IP addresses change when ECS tasks restart!** 

For a stable endpoint, consider setting up:
- Application Load Balancer (ALB) with a fixed DNS name
- Route53 domain pointing to the ALB
- HTTPS certificate for security

## Quick Fix Script

To automatically get the current IP:

```powershell
$tasks = aws ecs list-tasks --cluster tooltip-companion-cluster --service-name tooltip-companion-backend-service --region us-east-1 --output json | ConvertFrom-Json
$taskArn = $tasks.taskArns[0]
$taskDetails = aws ecs describe-tasks --cluster tooltip-companion-cluster --tasks $taskArn --region us-east-1 --output json | ConvertFrom-Json
$networkInterfaceId = $taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq 'networkInterfaceId' } | Select-Object -ExpandProperty value
$eni = aws ec2 describe-network-interfaces --network-interface-ids $networkInterfaceId --region us-east-1 --output json | ConvertFrom-Json
$publicIp = $eni.NetworkInterfaces[0].Association.PublicIp
Write-Host "Current Backend IP: http://$publicIp:3000"
```

---

**Last Updated**: 2025-11-02  
**Status**: ✅ Backend restarted and running on new IP

