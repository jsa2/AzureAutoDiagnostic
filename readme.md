# Azure Auto-diagnostic solution

## Disclaimer
Read [License](#license)

## Solution description
One of the top issues in detecting and investigation of security incidents (or suspicion of incident) is the fact that logs are often not simply enabled. 

There are multiple ways to enable diagnostic logs in Azure: Built-in and recommended option is to use Azure Policy and to create individually diagnostic deployment for different resource types. 

This solution removes the requirement for creating individual policies resources which supports the [Diagnostic settings](https://docs.microsoft.com/en-us/rest/api/monitor/diagnostic-settings/create-or-update) API in Azure Resource Manager.

## Confirming the solution works
After deployment is created: 
1. confirm that both functions are visible in the portal 
   - If none of the functions are visible in the portal restart the function, this will force resync of the triggers

![img](https://securecloud188323504.files.wordpress.com/2021/09/image-40.png)

1. Create new resource in the subscription the solution was deployed on, for example Azure Key Vault 
   
   ``az keyvault create --location $location -g $rg  -n $kvName`` 

2. approx 15 mins since the key vault was created you should see the following diagnostic setting enabled

## Debugging
- When the function is starting, you might see some transient errors in the logs. These errors seem to be related to propagation delay for some of the resources in scope. Sometimes the managed identity is unable to receive tokens immediately after deployment

**No triggers?**
- As always, you might see a situation with functions where the triggers are not getting synced. At this point you can try to restart the function from the portal, or just delete the resource-group, and deploy it again.
![img](https://securecloud188323504.files.wordpress.com/2021/09/image-39.png)

**Tracing errors**



Use the appInsights created in the resource group to trace errors. Look for messages in traces and exceptions.

```
traces
| distinct message
```

```
exceptions
```

![img](https://securecloud188323504.files.wordpress.com/2021/09/image-41.png)


**1. Illegal connection string**
- This signals, that the function does not have permission to the Key Vault. This can happen if there is propagation error with Key Vault Permissions
`` Illegal connection string parameter name '@Microsoft.KeyVault(SecretUri' (Parameter 'connectionString') `` 

---


## Table of contents
- [Azure Auto-diagnostic solution](#azure-auto-diagnostic-solution)
  - [Disclaimer](#disclaimer)
  - [Solution description](#solution-description)
  - [Confirming the solution works](#confirming-the-solution-works)
  - [Debugging](#debugging)
  - [Table of contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [CLI script](#cli-script)
  - [License](#license)



Service | Description
-|-
|Azure Functions | Enables diagnostic settings on resources 
|Azure Event Hub | Signals the function on new deployments
|Azure Monitor | Source for the activityLog 
|Azure Log Analytics | Destination for log export

**Solution image**

![img](https://securecloud188323504.files.wordpress.com/2021/09/image-38.png)




## Prerequisites 

Requirement | description | Install
-|-|-
✅ Bash shell script | Tested with WSL2 and Ubuntu on windows | [CLI script](#cli-script)
✅ [p7zip](https://www.7-zip.org/) | p7zip is  used to create the zip deployment package for package deployment | ``sudo apt-get install p7zip-full`` 
✅ AZCLI | Azure Services installation |``curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash``
✅ Node.js runtime 14 | Used in Azure Function, and to create local function config |[install with NVM](https://github.com/nvm-sh/nvm#install--update-script)



## Installation

### CLI script
The CLI script below will use current subscription context to setup the solution after user has performed 
``` AZ LOGIN; az account set --subscription {subscriptionID} ``` 
```shell
# Install the node project
npm install
#Define starting variables
rnd=$RANDOM
autodg=autodiag-$rnd
fnName=function-autodiag-eh-$rnd
rg=RG-ehsolution-$rnd
location=westeurope
# You can ignore the warning "command substitution: ignored null byte in input"
storageAcc=storage$(shuf -zer -n10  {a..z})
#
kvName=kv-autodiag2$rnd

# Create Resource Group
az group create -n $rg \
-l $location \
--tags="svc=autoDiag"

wsid=$(az monitor log-analytics workspace create --location $location -g $rg  -n laws${autodg}1 -o tsv --query "id")

# Create storageAcc Account 
az storage account create -n $storageAcc  -g $rg --kind storageV2 -l $location -t Account --sku Standard_LRS

# Create Key Vault
az keyvault create --location $location -g $rg  -n $kvName

# Create EH
az eventhubs namespace create -n eh-${autodg} -g $rg -l $location 

az eventhubs eventhub create -n hub-${autodg} -g $rg --namespace-name eh-${autodg}
#Rule for function
monitorRuleId=$(az eventhubs eventhub authorization-rule create -g $rg --namespace-name eh-${autodg} --eventhub-name hub-${autodg} --name auth${autodg} --rights Listen -o tsv --query "id")

#Rule for Azure Monitor


authRuleForDiagnosticSetting=$(echo $monitorRuleId | cut -d "/" -f1,2,3,4,5,6,7,8,9)/authorizationrules/RootManageSharedAccessKey

ehConstring=$(az eventhubs eventhub authorization-rule keys list -g $rg --namespace-name eh-${autodg} --eventhub-name hub-${autodg} --name auth${autodg} -o tsv --query "primaryConnectionString")
saConstring=$(az storage account show-connection-string -g $rg  -n  $storageAcc -o tsv --query "connectionString")

## Create SUB
sub=$(echo $wsid | cut -d "/" -f3);

# Creates diagnostic setting for the subscription to be forwarded to EH
az monitor diagnostic-settings subscription create -n diag-$rnd \
--event-hub-auth-rule $authRuleForDiagnosticSetting \
--location $location \
--subscription $sub \
--event-hub-name hub-${autodg} \
--logs '[
   {
     "category": "Administrative",
     "enabled": true
    }
   ]'

## Deploy FN
#kvRefEh=$(az keyvault secret set --name ehsecret --vault-name $kvName --value $ehConstring -o tsv --query "id"| cut -d "/" -f1,2,3,4,5)
kvRefEh="@Microsoft.KeyVault(SecretUri=$(az keyvault secret set --name ehsecret --vault-name $kvName --value  $ehConstring -o tsv --query "id" | cut -d "/" -f1,2,3,4,5))"



node createConf.js hub-${autodg} $wsid $ehConstring $saConstring

## Create Function App
az functionapp create \
--functions-version 3 \
--consumption-plan-location $location \
--name $fnName \
--os-type linux \
--resource-group $rg \
--runtime node \
--storage-account $storageAcc

# Scope for web app
scope=$(echo $wsid | cut -d "/" -f1,2,3)
# Enable Managed Identity and required permissions for key vault and monitor
identity=$(az functionapp identity assign -g  $rg  -n $fnName --role 749f88d5-cbae-40b8-bcfc-e573ddc772fa --scope $scope -o tsv --query "principalId")

sleep 20

#Set kv permissions for KV references
az keyvault set-policy --name $kvName --object-id $identity --secret-permissions get -g $rg

## Enables KV REF and Disables the MSI endpoint for testing that function can get access tokens (Enable for debugging)
az functionapp config appsettings set \
--name $fnName \
--resource-group $rg \
--settings AzureEventHubConnectionString=$kvRefEh  workspaceId=$wsid WEBSITE_RUN_FROM_PACKAGE=1 AzureWebJobs.testmsi.Disabled=true

#Create ZIP package 
7z a -tzip deploy.zip . -r -mx0 -xr\!*.git -xr\!*.vscode 

# Force triggers by deployment and restarts

i=0
while [ -z "$fnTrues" ] ; do
((i++))
az functionapp deployment source config-zip -g $rg -n $fnName --src deploy.zip
sleep 10
az functionapp restart --name $fnName --resource-group $rg 
sleep 10
fnTrues=$(az functionapp function show -g $rg -n $fnName --function-name ehdiag -o tsv --query "id")
echo "$fnTrues"
echo "attempting to sync triggers $C/$E"
 if [[ $i -eq 6 ]]; then
    break  
    fi
done

#
rm deploy.zip

#Create rnd resources to confirm the diagnostic setting
az network public-ip create --location $location -g $rg  -n pip-$RANDOM
az network lb create --location $location -g $rg  -n lb-$rnd
az keyvault create --location $location -g $rg  -n ${kvName}1
```

## License
Copyright 2021 Joosua Santasalo

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.