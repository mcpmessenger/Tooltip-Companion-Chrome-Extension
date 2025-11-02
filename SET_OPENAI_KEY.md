# Setting OpenAI API Key in AWS Backend

## Overview

The backend now uses a default OpenAI API key from environment variables, so users don't need to enter their own key. Users can still optionally provide their own key if they want to use their personal quota.

## Setting the Default Key in AWS ECS

### Option 1: Using AWS Console

1. Go to **ECS → Clusters → tooltip-companion-cluster**
2. Click on **Services → tooltip-companion-backend-service**
3. Click **Update**
4. Scroll to **Environment variables** section
5. Click **Add environment variable**:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...` (your OpenAI API key)
6. Click **Update**
7. Force a new deployment to apply changes

### Option 2: Using AWS CLI

Update the task definition and service:

```powershell
# Get current task definition
$taskDef = aws ecs describe-task-definition --task-definition tooltip-companion-backend --region us-east-1 --output json | ConvertFrom-Json

# Update environment variables
$containerDef = $taskDef.taskDefinition.containerDefinitions[0]
if (-not $containerDef.environment) {
    $containerDef.environment = @()
}

# Add or update OPENAI_API_KEY
$envVar = $containerDef.environment | Where-Object { $_.name -eq 'OPENAI_API_KEY' }
if ($envVar) {
    $envVar.value = 'sk-proj-YOUR_KEY_HERE'
} else {
    $containerDef.environment += @{ name = 'OPENAI_API_KEY'; value = 'sk-proj-YOUR_KEY_HERE' }
}

# Create new task definition
$newTaskDef = @{
    family = $taskDef.taskDefinition.family
    networkMode = $taskDef.taskDefinition.networkMode
    requiresCompatibilities = $taskDef.taskDefinition.requiresCompatibilities
    cpu = $taskDef.taskDefinition.cpu
    memory = $taskDef.taskDefinition.memory
    containerDefinitions = @($containerDef)
    executionRoleArn = $taskDef.taskDefinition.executionRoleArn
    taskRoleArn = $taskDef.taskDefinition.taskRoleArn
} | ConvertTo-Json -Depth 10

$newTaskDef | Out-File -FilePath task-def-with-openai.json -Encoding UTF8

# Register new task definition
aws ecs register-task-definition --cli-input-json file://task-def-with-openai.json --region us-east-1

# Update service to use new task definition
aws ecs update-service --cluster tooltip-companion-cluster --service tooltip-companion-backend-service --force-new-deployment --region us-east-1
```

### Option 3: Using AWS Secrets Manager (More Secure)

For production, store the key in Secrets Manager:

1. **Create Secret in Secrets Manager**:
   ```powershell
   aws secretsmanager create-secret --name tooltip-companion/openai-key --secret-string "sk-proj-YOUR_KEY_HERE" --region us-east-1
   ```

2. **Update Task Definition** to reference the secret:
   - Add secret to container definition:
   ```json
   "secrets": [
     {
       "name": "OPENAI_API_KEY",
       "valueFrom": "arn:aws:secretsmanager:us-east-1:396608803476:secret:tooltip-companion/openai-key"
     }
   ]
   ```

## How It Works

1. **Backend checks** for OpenAI key in this order:
   - First: User-provided key from extension (if user set their own)
   - Second: Backend's default key from `OPENAI_API_KEY` environment variable
   - Fallback: Basic responses if no key available

2. **Users don't need to**:
   - Enter their own API key
   - Configure anything in the extension
   - Set up any settings

3. **Users can optionally**:
   - Set their own key in extension Options (if they want to use their personal quota)
   - Their key takes priority over the backend default

## Benefits

- ✅ **Free for users** - No need to get their own OpenAI key
- ✅ **Better UX** - Works out of the box
- ✅ **Flexible** - Users can still use their own key if preferred
- ✅ **Centralized** - Easy to manage key rotation and quotas

## Cost Considerations

- Backend key usage will count against your OpenAI account
- Monitor usage at: https://platform.openai.com/usage
- Consider setting usage limits in OpenAI dashboard
- Estimate costs: ~$0.001-0.002 per chat message (GPT-3.5-turbo)

