# Azure Auto-diagnostic solution

## Disclaimer
Read [License](#license) before proceeding
- Do not use this solution in any environment that has sensitive or valuable data. This is a tool meant for security research. 

## Solution description
One of the top issues in detecting and investigation of security incidents (or suspicion of incident) is the fact that logs are often not simply enabled. 

There are multiple ways to enable diagnostic logs in Azure: Built-in and recommended option is to use Azure Policy and to create individually diagnostic deployment for different resource types. 

**Alternative for security research**

✅ This solution removes the requirement for creating individual Azure policies per resource type. As long as the resource type supports the [Diagnostic settings](https://docs.microsoft.com/en-us/rest/api/monitor/diagnostic-settings/create-or-update) API in Azure Resource Manager. The goal of this tool is to gather diagnostic data of resources for security research with fire & forget mechanism.

**Solution image**

![img](https://securecloud188323504.files.wordpress.com/2021/09/image-38.png)





## Table of contents
- [Azure Auto-diagnostic solution](#azure-auto-diagnostic-solution)
  - [Disclaimer](#disclaimer)
  - [Solution description](#solution-description)
  - [Table of contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [CLI script](#cli-script)
  - [- Ensure that you have run ``` NVM Install 14```](#--ensure-that-you-have-run--nvm-install-14)
  - [Confirming the solution works](#confirming-the-solution-works)
  - [Notes](#notes)
  - [Debugging](#debugging)
  - [License](#license)



Service | Description
-|-
|Azure Functions | Enables diagnostic settings on resources 
|Azure Event Hub | Signals the function on new deployments
|Azure Monitor | Source for the activityLog 
|Azure Log Analytics | Destination for log export




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
- Ensure you are running this script in Linux Shell (Bash)
- Ensure you have selected a single subscription context

``` az login; az account set --subscription "6193053b-408b-44d0-b20f-4e29b9b67394"``` 

- Ensure you have permissions on the WSL folder to create directories, and have permissions on those created directories ``chmod 700 /home/user``
   - If you cloned this project with windows client, it is recommended to clone it to Linux filesystem `` /home/user/projectName `` 
- Ensure that you have run ``` NVM Install 14```
--- 

```shell
# clone the project
git clone https://github.com/jsa2/AzureAutoDiagnostic; cd AzureAutoDiagnostic
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
# KV with random name
kvName=kv-autodiag2$rnd-$RANDOM

# Create Resource Group
az group create -n $rg \
-l $location \
--tags="svc=autoDiag"


# use existing wsID
wsid="/subscriptions/3539c2a2-cd25-48c6-b295-14e59334ef1c/resourcegroups/rg-laws/providers/microsoft.operationalinsights/workspaces/hublaws"

#Create new WS
wsid=$(az monitor log-analytics workspace create --location $location -g $rg  -
n laws${autodg}1 -o tsv --query "id")

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


subs=$(az account list --query [].id -o tsv)

for subbie in $subs
   do
   az account set --subscription $subbie
   az monitor diagnostic-settings subscription create -n diag-$rnd \
   --event-hub-auth-rule $authRuleForDiagnosticSetting \
   --location $location \
   --subscription $subbie \
   --event-hub-name hub-${autodg} \
   --logs '[
      {
      "category": "Administrative",
      "enabled": true
      }
      ]'
   done

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

sleep 10

# Scope for web app
scope=$(echo $wsid | cut -d "/" -f1,2,3)
# Enable Managed Identity and required permissions for key vault and monitor
identity=$(az functionapp identity assign -g  $rg  -n $fnName --role 749f88d5-cbae-40b8-bcfc-e573ddc772fa --scope $scope -o tsv --query "principalId")

#Set kv permissions for KV references
az keyvault set-policy --name $kvName --object-id $identity --secret-permissions get -g $rg

for subbie in $subs
   do
   az account set --subscription $subbie
   az role assignment create --assignee $identity --role 749f88d5-cbae-40b8-bcfc-e573ddc772fa --scope "/subscriptions/${subbie}"
   done

az account set --subscription $sub

sleep 20

sleep 20

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


# Create Resource Group
rnd=$(az group create -n "testRg-$RANDOM" -l $location --tags="svc=autoDiag" -o "tsv" --query "name")

#Create rnd resources to confirm the diagnostic setting
az network public-ip create --location $location -g $rnd  -n pip-$RANDOM
az network lb create --location $location -g $rnd  -n lb-$rnd
az keyvault create --location $location -g $rnd  -n ${kvName}1

az group delete -n $rnd
```

## Confirming the solution works
After deployment is created: 
1. confirm that both functions are visible in the portal 

![img](https://securecloud188323504.files.wordpress.com/2021/09/image-40.png)

   - If none of the functions are visible in the portal restart the function, this will force resync of the triggers. If that does not help delete the resource group, and redeploy the solution (remember to delete the diagnostic setting created by the automation manually)


2. Create new resource in the **same subscription** the solution was deployed on, for example Azure Key Vault:
   
   ``az keyvault create --location $location -g $rg  -n $kvName`` 

3. Approx 15 mins since resource was created you should see the following diagnostic setting enabled
![img](https://securecloud188323504.files.wordpress.com/2021/09/image-43.png)


## Notes
- If you do not have all the solution providers registered for the solution the installation might fail.
- Keyvault registration is usually slow, register the provider before running the script, refer to the https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/resource-providers-and-types to register provider for subscription.
- If the installation fails, it is better to delete the resource group

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
2. Propagation delay in AAD
``WARNING: Retrying role assignment creation: 3/36``  

---

## License
Copyright 2021 Joosua Santasalo

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
